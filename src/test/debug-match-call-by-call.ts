#!/usr/bin/env node
/**
 * Debug script: match each Ringba call to eLocal call-by-call and log why matches fail.
 * Aligns with ringbav2/src/services/ringba-original-sync.js matching logic.
 *
 * Usage: npx tsx src/test/debug-match-call-by-call.ts [date]
 *   date: YYYY-MM-DD (default: 2026-02-02)
 *
 * Output: per-Ringba-call result (no_candidate | parse_fail | days_diff | time_window | matched | skipped)
 *         and summary counts by reason.
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonDbOps } from '../database/neon-operations.js';
import {
  getCallsByTargetId,
  TARGET_IDS,
  getCategoryFromTargetId,
  type RingbaCallRecord,
} from '../http/ringba-target-calls.js';
import { convertRingbaDateToEST, parseDateAsEastern, getEasternDatePart } from '../utils/date-normalizer.js';
import type { DatabaseCallRecord } from '../types/index.js';
import type { RingbaCallForSync } from '../types/index.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

const toE164 = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (String(raw).startsWith('+')) return `+${digits}`;
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

/** Result of trying to match one Ringba call to one eLocal candidate */
type MatchAttempt =
  | { matched: true; elocalId: number; timeDiff: number; skippedPreserved?: boolean }
  | {
      matched: false;
      reason:
        | 'parse_elocal_fail'
        | 'parse_ringba_fail'
        | 'days_diff'
        | 'time_window'
        | 'already_matched';
      details?: Record<string, unknown>;
    };

const WINDOW_MINUTES = 120;

/**
 * Try to match one Ringba call to one eLocal call; return reason if no match.
 * Uses same logic as ringbav2: parse dates, same/adjacent day (UTC date part in JS; we use Eastern), time window 120 min.
 */
function matchCallWithReason(
  ringbaCall: RingbaCallForSync,
  elocalCall: DatabaseCallRecord,
  alreadyMatchedElocalIds: Set<number>
): MatchAttempt {
  if (alreadyMatchedElocalIds.has(elocalCall.id)) {
    return { matched: false, reason: 'already_matched', details: { elocalId: elocalCall.id } };
  }

  const elocalDate =
    parseDateAsEastern(elocalCall.call_timestamp) ?? parseDate(elocalCall.call_timestamp);
  const ringbaDate = parseDateAsEastern(ringbaCall.callDt) ?? parseDate(ringbaCall.callDt);

  if (!elocalDate) {
    return {
      matched: false,
      reason: 'parse_elocal_fail',
      details: { call_timestamp: elocalCall.call_timestamp },
    };
  }
  if (!ringbaDate) {
    return {
      matched: false,
      reason: 'parse_ringba_fail',
      details: { callDt: ringbaCall.callDt },
    };
  }

  const elocalDateStr = getEasternDatePart(elocalDate);
  const ringbaDateStr = getEasternDatePart(ringbaDate);
  const daysDiff =
    Math.abs(
      new Date(elocalDateStr).getTime() - new Date(ringbaDateStr).getTime()
    ) / (1000 * 60 * 60 * 24);

  if (daysDiff > 1) {
    return {
      matched: false,
      reason: 'days_diff',
      details: {
        elocalDateStr,
        ringbaDateStr,
        daysDiff: Math.round(daysDiff * 100) / 100,
      },
    };
  }

  const elocalTimeOnly = new Date(elocalDate);
  elocalTimeOnly.setSeconds(0, 0);
  const ringbaTimeOnly = new Date(ringbaDate);
  ringbaTimeOnly.setSeconds(0, 0);
  const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
  const effectiveWindow = daysDiff === 0 ? WINDOW_MINUTES : 24 * 60;

  if (timeDiff > effectiveWindow) {
    return {
      matched: false,
      reason: 'time_window',
      details: {
        timeDiffMinutes: Math.round(timeDiff * 10) / 10,
        effectiveWindow,
        elocalDateStr,
        ringbaDateStr,
      },
    };
  }

  const existingPayout = Number(elocalCall.ringba_original_payout ?? 0);
  const existingRevenue = Number(elocalCall.ringba_original_revenue ?? 0);
  const skippedPreserved = existingPayout !== 0 || existingRevenue !== 0;

  return {
    matched: true,
    elocalId: elocalCall.id,
    timeDiff: Math.round(timeDiff * 10) / 10,
    skippedPreserved,
  };
}

async function fetchRingbaCallsForDay(
  accountId: string,
  apiToken: string,
  year: number,
  month: number,
  day: number
): Promise<RingbaCallForSync[]> {
  const dayStartUTC = new Date(Date.UTC(year, month, day, 5, 0, 0, 0));
  const dayEndUTC = new Date(Date.UTC(year, month, day + 1, 4, 59, 59, 999));
  const allCalls: RingbaCallForSync[] = [];
  for (const [targetId, targetName] of Object.entries(TARGET_IDS)) {
    try {
      const resultEither = await getCallsByTargetId(accountId, apiToken)(targetId, {
        startDate: dayStartUTC.toISOString(),
        endDate: dayEndUTC.toISOString(),
        pageSize: 1000,
      })();
      if (resultEither._tag === 'Left') continue;
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
        if (callDtEST) {
          const converted = convertRingbaDateToEST(callDtEST);
          if (converted) callDtEST = converted;
        }
        allCalls.push({
          inboundCallId: call.inboundCallId ?? '',
          callDt: callDtEST,
          callDtOriginal: callDtEST,
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
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.error(`[debug] Ringba target ${targetId}:`, (e as Error).message);
    }
  }
  return allCalls;
}

type Outcome =
  | 'no_candidate_category'
  | 'no_candidate_caller'
  | 'no_candidate_caller_e164'
  | 'parse_elocal_fail'
  | 'parse_ringba_fail'
  | 'days_diff'
  | 'time_window'
  | 'matched'
  | 'skipped_preserved';

interface PerCallResult {
  ringbaIndex: number;
  ringbaInboundId: string;
  category: string;
  callerE164: string | null;
  outcome: Outcome;
  candidateCount?: number;
  failureReasons?: string[];
  details?: Record<string, unknown>;
}

async function main() {
  const dateStr = process.argv[2] ?? '2026-02-02';
  const matchParsed = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matchParsed) {
    console.error('Usage: npx tsx src/test/debug-match-call-by-call.ts [YYYY-MM-DD]');
    process.exit(1);
  }
  const year = parseInt(matchParsed[1], 10);
  const month = parseInt(matchParsed[2], 10) - 1;
  const day = parseInt(matchParsed[3], 10);

  const accountId = process.env.RINGBA_ACCOUNT_ID;
  const apiToken = process.env.RINGBA_API_TOKEN;
  if (!accountId || !apiToken) {
    console.error('[ERROR] RINGBA_ACCOUNT_ID and RINGBA_API_TOKEN required');
    process.exit(1);
  }

  const db = createNeonDbOps();
  const fullRangeStartUTC = new Date(Date.UTC(year, month, day, 5, 0, 0, 0));
  const fullRangeEndUTC = new Date(Date.UTC(year, month, day + 1, 4, 59, 59, 999));

  console.log('\n=== Debug: Match Call by Call ===');
  console.log(`Date: ${dateStr}`);
  console.log('');

  console.log('[1] Fetching Ringba calls...');
  const ringbaCalls = await fetchRingbaCallsForDay(accountId, apiToken, year, month, day);
  console.log(`    Ringba calls: ${ringbaCalls.length}`);

  console.log('[2] Fetching eLocal calls...');
  const elocalCalls = await db.getCallsForDateRange(fullRangeStartUTC, fullRangeEndUTC, null);
  console.log(`    eLocal calls: ${elocalCalls.length}`);

  // Show how eLocal data is split by category (saved by fetch-elocal-calls.service: STATIC vs API runs)
  const byCategoryCount = elocalCalls.reduce(
    (acc, c) => {
      const cat = (c.category ?? 'null') as string;
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.log('    eLocal by category (from DB):', byCategoryCount);
  console.log('    (Category is set by fetch-elocal-calls.service: STATIC run vs API run.)');

  const byCategoryAndCaller = new Map<string, Map<string, DatabaseCallRecord[]>>();
  for (const c of elocalCalls) {
    const category = (c.category || 'STATIC') as string;
    const callerE164 = toE164(c.caller_id);
    if (!callerE164) continue;
    if (!byCategoryAndCaller.has(category)) byCategoryAndCaller.set(category, new Map());
    const byCaller = byCategoryAndCaller.get(category)!;
    if (!byCaller.has(callerE164)) byCaller.set(callerE164, []);
    byCaller.get(callerE164)!.push(c);
  }

  const summary: Record<Outcome, number> = {
    no_candidate_category: 0,
    no_candidate_caller: 0,
    no_candidate_caller_e164: 0,
    parse_elocal_fail: 0,
    parse_ringba_fail: 0,
    days_diff: 0,
    time_window: 0,
    matched: 0,
    skipped_preserved: 0,
  };

  const results: PerCallResult[] = [];
  const matchedElocalIds = new Set<number>();

  for (let i = 0; i < ringbaCalls.length; i++) {
    const ringbaCall = ringbaCalls[i];
    const ringbaCategory = getCategoryFromTargetId(ringbaCall.targetId);
    const callerE164 = ringbaCall.callerIdE164 ?? toE164(ringbaCall.callerId);

    if (!callerE164) {
      summary.no_candidate_caller_e164++;
      results.push({
        ringbaIndex: i + 1,
        ringbaInboundId: ringbaCall.inboundCallId,
        category: ringbaCategory,
        callerE164: null,
        outcome: 'no_candidate_caller_e164',
        details: { ringbaCallerId: ringbaCall.callerId ?? null },
      });
      continue;
    }

    const categoryCalls = byCategoryAndCaller.get(ringbaCategory);
    if (!categoryCalls) {
      summary.no_candidate_category++;
      results.push({
        ringbaIndex: i + 1,
        ringbaInboundId: ringbaCall.inboundCallId,
        category: ringbaCategory,
        callerE164,
        outcome: 'no_candidate_category',
      });
      continue;
    }

    const candidates = categoryCalls.get(callerE164) ?? [];
    if (candidates.length === 0) {
      summary.no_candidate_caller++;
      results.push({
        ringbaIndex: i + 1,
        ringbaInboundId: ringbaCall.inboundCallId,
        category: ringbaCategory,
        callerE164,
        outcome: 'no_candidate_caller',
        candidateCount: 0,
      });
      continue;
    }

    let best: MatchAttempt | null = null;
    const failureReasons: string[] = [];
    for (const elocalCall of candidates) {
      const attempt = matchCallWithReason(ringbaCall, elocalCall, matchedElocalIds);
      if (attempt.matched) {
        if (!best || (best.matched && attempt.timeDiff < best.timeDiff)) {
          best = attempt;
        }
      } else {
        failureReasons.push(
          `${attempt.reason}${attempt.details ? ` ${JSON.stringify(attempt.details)}` : ''}`
        );
      }
    }

    if (best?.matched) {
      if (best.skippedPreserved) {
        summary.skipped_preserved++;
        results.push({
          ringbaIndex: i + 1,
          ringbaInboundId: ringbaCall.inboundCallId,
          category: ringbaCategory,
          callerE164,
          outcome: 'skipped_preserved',
          candidateCount: candidates.length,
          details: { elocalId: best.elocalId },
        });
      } else {
        matchedElocalIds.add(best.elocalId);
        summary.matched++;
        results.push({
          ringbaIndex: i + 1,
          ringbaInboundId: ringbaCall.inboundCallId,
          category: ringbaCategory,
          callerE164,
          outcome: 'matched',
          candidateCount: candidates.length,
          details: { elocalId: best.elocalId, timeDiff: best.timeDiff },
        });
      }
      continue;
    }

    const firstReason = failureReasons[0] ?? 'unknown';
    let outcome: Outcome = 'time_window';
    if (firstReason.startsWith('parse_elocal_fail')) {
      summary.parse_elocal_fail++;
      outcome = 'parse_elocal_fail';
    } else if (firstReason.startsWith('parse_ringba_fail')) {
      summary.parse_ringba_fail++;
      outcome = 'parse_ringba_fail';
    } else if (firstReason.startsWith('days_diff')) {
      summary.days_diff++;
      outcome = 'days_diff';
    } else {
      summary.time_window++;
      outcome = 'time_window';
    }

    results.push({
      ringbaIndex: i + 1,
      ringbaInboundId: ringbaCall.inboundCallId,
      category: ringbaCategory,
      callerE164,
      outcome,
      candidateCount: candidates.length,
      failureReasons,
    });
  }

  console.log('');
  console.log('--- Summary by outcome ---');
  console.log(JSON.stringify(summary, null, 2));
  if (summary.no_candidate_category > 0) {
    console.log('');
    console.log(
      '  Hint: no_candidate_category = no eLocal rows for that Ringba category (STATIC/API).'
    );
    console.log(
      '  eLocal category is set by fetch-elocal-calls.service (STATIC run vs API run).'
    );
    console.log(
      '  Run the eLocal fetcher for the missing category for this date to get candidates.'
    );
  }
  console.log('');

  const unmatched = results.filter(
    (r) =>
      r.outcome !== 'matched' &&
      r.outcome !== 'skipped_preserved'
  );
  console.log(`--- First 25 unmatched Ringba calls (of ${unmatched.length}) ---`);
  for (const r of unmatched.slice(0, 25)) {
    console.log(
      `  [${r.ringbaIndex}] ${r.ringbaInboundId} category=${r.category} caller=${r.callerE164 ?? 'null'} => ${r.outcome}`
    );
    if (r.failureReasons?.length) {
      r.failureReasons.slice(0, 3).forEach((fr) => console.log(`      ${fr}`));
    }
  }
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
