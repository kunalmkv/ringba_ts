/**
 * Ringba Original Payout/Revenue Sync Service (TypeScript).
 * Fetches calls from Ringba for a date range, saves to ringba_original_sync (ringba_id, ringba_payout, etc.),
 * matches with eLocal calls and updates ringba_original_payout/ringba_original_revenue.
 */
import { createNeonDbOps } from '../database/neon-operations.js';
import { convertRingbaDateToEST } from '../utils/date-normalizer.js';
import {
  getCallsByTargetId,
  TARGET_IDS,
  getCategoryFromTargetId,
  type RingbaCallRecord,
} from '../http/ringba-target-calls.js';
import type {
  DateRange,
  RingbaOriginalSyncConfig,
  RingbaCallForSync,
  RingbaOriginalSyncSummary,
  Category,
} from '../types/index.js';
import type { DatabaseCallRecord } from '../types/index.js';

const toE164 = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return raw;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.length > 0 ? `+${digits}` : null;
};

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (!Number.isNaN(date.getTime())) return date;
    const ringbaFormat = dateStr.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i
    );
    if (ringbaFormat) {
      const month = parseInt(ringbaFormat[1], 10) - 1;
      const day = parseInt(ringbaFormat[2], 10);
      const year = parseInt(ringbaFormat[3], 10);
      let hours = parseInt(ringbaFormat[4], 10);
      const minutes = parseInt(ringbaFormat[5], 10);
      const seconds = parseInt(ringbaFormat[6], 10);
      const ampm = ringbaFormat[7].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      else if (ampm === 'AM' && hours === 12) hours = 0;
      return new Date(year, month, day, hours, minutes, seconds);
    }
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (isoMatch) {
      return new Date(
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10) - 1,
        parseInt(isoMatch[3], 10),
        parseInt(isoMatch[4], 10),
        parseInt(isoMatch[5], 10),
        parseInt(isoMatch[6], 10)
      );
    }
    const yyyy = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyy) {
      return new Date(parseInt(yyyy[1], 10), parseInt(yyyy[2], 10) - 1, parseInt(yyyy[3], 10));
    }
  } catch {
    // ignore
  }
  return null;
}

function timeDiffMinutes(date1: Date | null, date2: Date | null): number {
  if (!date1 || !date2) return Infinity;
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
}

async function fetchAllRingbaCalls(
  accountId: string,
  apiToken: string,
  startDate: Date,
  endDate: Date
): Promise<RingbaCallForSync[]> {
  const allCalls: RingbaCallForSync[] = [];
  for (const [targetId, targetName] of Object.entries(TARGET_IDS)) {
    try {
      const resultEither = await getCallsByTargetId(accountId, apiToken)(targetId, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        pageSize: 1000,
      })();
      if (resultEither._tag === 'Left') {
        console.error(`[Ringba Original Sync] Failed target ${targetId}:`, resultEither.left);
        continue;
      }
      const result = resultEither.right;
      const calls = result.calls;
      for (const call of calls as RingbaCallRecord[]) {
        const payout = Number(call.ringbaCost ?? call.payout ?? 0);
        const revenue = Number(call.revenue ?? 0);
        const ringbaCallerId = call.callerId ?? null;
        const callerIdE164 = ringbaCallerId
          ? ringbaCallerId.startsWith('+')
            ? ringbaCallerId
            : toE164(ringbaCallerId)
          : null;
        let callDtEST = call.callDate ?? '';
        const callDtOriginal = callDtEST;
        if (callDtEST) {
          const converted = convertRingbaDateToEST(callDtEST);
          if (converted) callDtEST = converted;
        }
        allCalls.push({
          inboundCallId: call.inboundCallId ?? '',
          callDt: callDtEST,
          callDtOriginal,
          callerId: ringbaCallerId,
          callerIdE164,
          inboundPhoneNumber: call.inboundPhoneNumber ?? null,
          payout,
          revenue,
          callDuration: call.callDuration ?? 0,
          targetId,
          targetName: call.targetName ?? targetName,
          campaignName: call.campaignName ?? null,
          publisherName: call.publisherName ?? null,
        });
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`[Ringba Original Sync] Exception target ${targetId}:`, (e as Error).message);
    }
  }
  return allCalls;
}

interface MatchResult {
  elocalCall: DatabaseCallRecord;
  ringbaCall: RingbaCallForSync;
  matchScore: number;
  timeDiff: number;
  payoutDiff: number;
  payoutMatch: boolean;
}

function matchCall(
  ringbaCall: RingbaCallForSync,
  elocalCall: DatabaseCallRecord,
  windowMinutes = 120,
  payoutTolerance = 0.01
): MatchResult | null {
  // Parse dates - use parseDate (not parseDateAsEastern) to match ringbav2 behavior
  // ringbav2 uses parseDate which treats dates as local time, then uses .toISOString() for comparison
  const elocalDate = parseDate(elocalCall.call_timestamp);
  const ringbaDate = parseDate(ringbaCall.callDt);
  if (!elocalDate || !ringbaDate) return null;

  // Check if dates are on the same day or adjacent days
  // Use .toISOString().split('T')[0] to match ringbav2 exactly (line 352-353)
  const elocalDateStr = elocalDate.toISOString().split('T')[0];
  const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
  const elocalDateOnly = new Date(elocalDateStr);
  const ringbaDateOnly = new Date(ringbaDateStr);
  const daysDiff = Math.abs((elocalDateOnly.getTime() - ringbaDateOnly.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff > 1) return null;

  // Calculate time difference in minutes, but only using hour and minutes (ignore seconds)
  // Set seconds to 0 for both dates before comparing (matches ringbav2 line 363-368)
  const elocalTimeOnly = new Date(elocalDate);
  elocalTimeOnly.setSeconds(0, 0);
  const ringbaTimeOnly = new Date(ringbaDate);
  ringbaTimeOnly.setSeconds(0, 0);
  const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);

  const effectiveWindow = daysDiff === 0 ? windowMinutes : 24 * 60; // 24 hours if different days

  if (timeDiff > effectiveWindow) return null;

  // Match payout (if available) - matches ringbav2 line 376-390
  const elocalPayout = Number(elocalCall.elocal_payout ?? 0);
  const ringbaPayout = Number(ringbaCall.payout ?? 0);
  const payoutDiff = Math.abs(elocalPayout - ringbaPayout);

  // Calculate match score (lower is better)
  let matchScore = timeDiff;

  if (elocalPayout > 0 && ringbaPayout > 0) {
    if (payoutDiff <= payoutTolerance) {
      matchScore = timeDiff * 0.1; // Exact payout match
    } else {
      matchScore = timeDiff + payoutDiff * 10; // Penalize payout differences
    }
  }

  return {
    elocalCall,
    ringbaCall,
    matchScore,
    timeDiff,
    payoutDiff,
    payoutMatch: payoutDiff <= payoutTolerance,
  };
}

interface PrepareUpdatesResult {
  updates: Array<{
    elocalCallId: number;
    ringbaInboundCallId: string;
    originalPayout: number;
    originalRevenue: number;
  }>;
  unmatched: number;
  skipped: number;
}

function matchAndPrepareUpdates(
  ringbaCalls: RingbaCallForSync[],
  elocalCalls: DatabaseCallRecord[]
): PrepareUpdatesResult {
  const updates: PrepareUpdatesResult['updates'] = [];
  let unmatched = 0;
  let skipped = 0;

  // Group eLocal calls by category first, then by normalized caller ID for faster lookup
  // Structure: Map<category, Map<callerE164, Array<elocalCall>>>
  // Matches ringbav2 line 222-240
  const elocalCallsByCategoryAndCaller = new Map<string, Map<string, DatabaseCallRecord[]>>();

  for (const elocalCall of elocalCalls) {
    const category = elocalCall.category || 'STATIC';
    const callerE164 = toE164(elocalCall.caller_id);

    if (!callerE164) {
      continue; // Skip calls without valid caller ID (matches ringbav2 line 227-229)
    }

    if (!elocalCallsByCategoryAndCaller.has(category)) {
      elocalCallsByCategoryAndCaller.set(category, new Map());
    }

    const callsByCaller = elocalCallsByCategoryAndCaller.get(category)!;
    if (!callsByCaller.has(callerE164)) {
      callsByCaller.set(callerE164, []);
    }
    callsByCaller.get(callerE164)!.push(elocalCall);
  }

  // Track which eLocal calls have been matched
  const matchedElocalIds = new Set<number>();

  // Match each Ringba call (matches ringbav2 line 246-294)
  for (const ringbaCall of ringbaCalls) {
    // Step 1: Match by target ID (which corresponds to category)
    const ringbaCategory = getCategoryFromTargetId(ringbaCall.targetId);
    if (!ringbaCategory) {
      unmatched++;
      continue;
    }

    // Step 2: Match by caller ID
    const callerE164 = ringbaCall.callerIdE164 || toE164(ringbaCall.callerId);
    if (!callerE164) {
      unmatched++;
      continue;
    }

    // Get eLocal calls for this category and caller ID
    const categoryCalls = elocalCallsByCategoryAndCaller.get(ringbaCategory);
    if (!categoryCalls) {
      unmatched++;
      continue;
    }

    const candidateElocalCalls = categoryCalls.get(callerE164) || [];

    if (candidateElocalCalls.length === 0) {
      unmatched++;
      continue;
    }

    // Step 3: Find best match by time (hour:minute only, ignore seconds)
    // Matches ringbav2 line 275-294
    let bestMatch: MatchResult | null = null;
    let bestScore = Infinity;

    for (const elocalCall of candidateElocalCalls) {
      if (matchedElocalIds.has(elocalCall.id)) {
        continue; // Already matched
      }

      const match = matchCall(ringbaCall, elocalCall);
      if (match && match.matchScore < bestScore) {
        bestMatch = match;
        bestScore = match.matchScore;
      }
    }

    if (!bestMatch) {
      unmatched++;
      continue;
    }

    matchedElocalIds.add(bestMatch.elocalCall.id);

    // Check if original_payout or original_revenue already exist (preserve original Ringba data)
    const existingOriginalPayout = Number(bestMatch.elocalCall.ringba_original_payout ?? 0);
    const existingOriginalRevenue = Number(bestMatch.elocalCall.ringba_original_revenue ?? 0);
    const hasExistingData = existingOriginalPayout !== 0 || existingOriginalRevenue !== 0;

    // Always update if we have a match - but for rows with existing payout/revenue,
    // only update ringba_id (the updateOriginalPayout uses COALESCE to preserve existing values)
    updates.push({
      elocalCallId: bestMatch.elocalCall.id,
      ringbaInboundCallId: ringbaCall.inboundCallId,
      originalPayout: ringbaCall.payout,
      originalRevenue: ringbaCall.revenue,
    });

    if (hasExistingData) {
      skipped++;
    }
  }

  return { updates, unmatched, skipped };
}

export async function syncRingbaOriginalPayout(
  config: RingbaOriginalSyncConfig,
  dateRange: DateRange,
  category: Category | null = null
): Promise<RingbaOriginalSyncSummary> {
  const accountId = config.ringbaAccountId ?? process.env.RINGBA_ACCOUNT_ID;
  const apiToken = config.ringbaApiToken ?? process.env.RINGBA_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('Ringba account ID and API token are required');
  }
  const db = createNeonDbOps();

  // Full range in UTC (EST-aligned: 00:00 EST = 05:00 UTC, 23:59 EST = 04:59 UTC next day)
  const rangeStart = new Date(dateRange.startDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(dateRange.endDate);
  rangeEnd.setHours(0, 0, 0, 0);
  

  const fullRangeStartUTC = new Date(
    Date.UTC(
      rangeStart.getFullYear(),
      rangeStart.getMonth(),
      rangeStart.getDate(),
      5,
      0,
      0,
      0
    )
  );
  const fullRangeEndUTC = new Date(
    Date.UTC(
      rangeEnd.getFullYear(),
      rangeEnd.getMonth(),
      rangeEnd.getDate() + 1,
      4,
      59,
      59,
      999
    )
  );

  const categoryLabel = category ? ` (${category})` : ' (all categories)';

  console.log('');
  console.log('='.repeat(70));
  console.log('Ringba Original Payout/Revenue Sync');
  console.log('='.repeat(70));
  console.log(`Date Range: ${dateRange.startDateFormatted} to ${dateRange.endDateFormatted}${categoryLabel}`);
  console.log('');

  // Step 1: Fetch Ringba calls for each day in the range (so multi-day range fetches all days)
  console.log('[Step 1] Fetching calls from Ringba...');
  const allRingbaCalls: RingbaCallForSync[] = [];
  const seenInboundIds = new Set<string>();
  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    const dayStartUTC = new Date(Date.UTC(y, m, day, 5, 0, 0, 0));
    const dayEndUTC = new Date(Date.UTC(y, m, day + 1, 4, 59, 59, 999));
    const dayCalls = await fetchAllRingbaCalls(accountId, apiToken, dayStartUTC, dayEndUTC);
    for (const c of dayCalls) {
      if (c.inboundCallId && !seenInboundIds.has(c.inboundCallId)) {
        seenInboundIds.add(c.inboundCallId);
        allRingbaCalls.push(c);
      }
    }
  }
  const ringbaCalls = allRingbaCalls;
  console.log(`[Step 1] Fetched ${ringbaCalls.length} calls from Ringba`);

  console.log('[Step 2] Saving Ringba calls to database...');
  const saveResult = await db.insertRingbaCallsBatch(ringbaCalls);
  console.log(`[Step 2] Inserted: ${saveResult.inserted}, Updated: ${saveResult.updated}, Skipped: ${saveResult.skipped}`);

  console.log(`[Step 3] Fetching eLocal calls${categoryLabel}...`);
  const elocalCalls = await db.getCallsForDateRange(fullRangeStartUTC, fullRangeEndUTC, category);
  console.log(`[Step 3] Fetched ${elocalCalls.length} eLocal calls`);

  let updatedCount = 0;
  let failedCount = 0;
  const { updates, unmatched, skipped } =
    elocalCalls.length > 0 && ringbaCalls.length > 0
      ? matchAndPrepareUpdates(ringbaCalls, elocalCalls)
      : { updates: [] as PrepareUpdatesResult['updates'], unmatched: 0, skipped: 0 };

  const matchedElocalCount = updates.length + skipped;
  const unmatchedElocalCount = elocalCalls.length - matchedElocalCount;

  console.log(`[Step 4] Matching Results:`);
  console.log(`  - Ringba calls to update: ${updates.length}`);
  console.log(`  - Ringba calls unmatched: ${unmatched} (of ${ringbaCalls.length})`);
  console.log(`  - Ringba calls skipped (already synced): ${skipped}`);
  console.log(`  - eLocal calls matched: ${matchedElocalCount} (of ${elocalCalls.length})`);
  console.log(`  - eLocal calls unmatched: ${unmatchedElocalCount}`);

  if (updates.length > 0) {
    console.log('[Step 5] Updating ringba_original_payout and ringba_original_revenue...');
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      try {
        const result = await db.updateOriginalPayout(
          u.elocalCallId,
          u.originalPayout,
          u.originalRevenue,
          u.ringbaInboundCallId
        );
        if (result.updated > 0) updatedCount++;
        else failedCount++;
      } catch {
        failedCount++;
      }
    }
    console.log(`[Step 5] Updated: ${updatedCount}, Failed: ${failedCount}`);
  }

  const result: RingbaOriginalSyncSummary = {
    dateRange: { start: dateRange.startDateFormatted, end: dateRange.endDateFormatted },
    category: category ?? 'all',
    ringbaCalls: ringbaCalls.length,
    inserted: saveResult.inserted,
    updated: saveResult.updated,
    skipped: saveResult.skipped,
    elocalCalls: elocalCalls.length,
    matched: updatedCount,
    updatedOriginal: updatedCount,
    failed: failedCount,
    unmatched,
    skippedPreserved: skipped,
  };

  console.log('='.repeat(70));
  console.log('Sync Summary');
  console.log('='.repeat(70));
  console.log(JSON.stringify(result, null, 2));
  console.log('='.repeat(70));
  console.log('');

  return result;
}
