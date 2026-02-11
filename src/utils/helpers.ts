import { normalizeDateTime } from './date-normalizer.js';
import type { Session, ElocalCall, AdjustmentDetail } from '../types/index.js';

/**
 * Create a new scraping session object
 */
export const createSession = (): Session => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  return {
    sessionId: `session_${timestamp}_${randomId}`,
    startedAt: new Date().toISOString(),
    status: 'running',
  };
};

/**
 * Process raw campaign calls - deduplicate and normalize
 */
export const processCampaignCalls = (rawCalls: ElocalCall[]): ElocalCall[] => {
  if (!rawCalls || rawCalls.length === 0) {
    return [];
  }

  // Deduplicate based on callerId, dateOfCall (full timestamp), and category
  const seen = new Map<string, boolean>();
  const processed: ElocalCall[] = [];
  const timestampCounts = new Map<string, number>();

  console.log(`[INFO] Processing ${rawCalls.length} raw calls for deduplication...`);

  for (const call of rawCalls) {
    // Normalize date+time to ISO format
    let normalizedDateTime = normalizeDateTime(call.dateOfCall) || call.dateOfCall || '';

    if (!normalizedDateTime) {
      console.warn(
        `[WARN] Skipping call with invalid date: ${call.dateOfCall} for caller ${call.callerId}`
      );
      continue;
    }

    // Handle duplicate timestamps by adding sequence
    const baseKey = `${call.callerId}|${normalizedDateTime}|${call.category || 'STATIC'}`;
    let count = timestampCounts.get(baseKey) || 0;

    if (count > 0) {
      // Add sequence as seconds offset
      const [datePart, timePart] = normalizedDateTime.split('T');
      if (timePart) {
        const [hours, minutes, seconds] = timePart.split(':');
        const newSeconds = String((parseInt(seconds || '0', 10) + count) % 60).padStart(2, '0');
        normalizedDateTime = `${datePart}T${hours}:${minutes}:${newSeconds}`;
      }
    }

    timestampCounts.set(baseKey, count + 1);

    const key = `${call.callerId}|${normalizedDateTime}|${call.category || 'STATIC'}`;

    if (!seen.has(key)) {
      seen.set(key, true);

      const processedCall: ElocalCall = {
        callerId: call.callerId || '',
        dateOfCall: normalizedDateTime,
        elocalPayout: Number(call.elocalPayout ?? 0) || 0,
        ringbaOriginalPayout: call.ringbaOriginalPayout ?? null,
        ringbaOriginalRevenue: call.ringbaOriginalRevenue ?? null,
        category: call.category || 'STATIC',
        cityState: call.cityState || null,
        zipCode: call.zipCode || null,
        totalDuration: call.totalDuration ?? null,
        adjustmentTime: call.adjustmentTime ?? undefined,
        adjustmentAmount: call.adjustmentAmount ?? undefined,
      };

      processed.push(processedCall);
    } else {
      console.warn(
        `[WARN] Duplicate call skipped: ${call.callerId} at ${normalizedDateTime} (category: ${call.category || 'STATIC'})`
      );
    }
  }

  console.log(
    `[INFO] After deduplication: ${processed.length} unique calls (from ${rawCalls.length} raw calls)`
  );
  if (processed.length < rawCalls.length) {
    console.log(`[INFO] Removed ${rawCalls.length - processed.length} duplicate calls during processing`);
  }

  return processed;
};

/**
 * Process adjustment details - normalize and validate
 */
export const processAdjustmentDetails = (rawAdjustments: any[]): AdjustmentDetail[] => {
  if (!rawAdjustments || rawAdjustments.length === 0) {
    return [];
  }

  const processed: AdjustmentDetail[] = [];

  for (const adj of rawAdjustments) {
    const normalizedTimeOfCall = normalizeDateTime(adj.timeOfCall) || adj.timeOfCall;
    const normalizedAdjustmentTime = normalizeDateTime(adj.adjustmentTime) || adj.adjustmentTime;

    if (!normalizedTimeOfCall || !normalizedAdjustmentTime) {
      console.warn('[WARN] Skipping adjustment with invalid date:', adj);
      continue;
    }

    processed.push({
      callerId: adj.callerId || '',
      timeOfCall: normalizedTimeOfCall,
      adjustmentTime: normalizedAdjustmentTime,
      campaignPhone: adj.campaignPhone || '(877) 834-1273',
      amount: parseFloat(String(adj.amount)) || 0,
      duration: adj.duration || 0,
      callSid: adj.callSid || null,
      classification: adj.classification || null,
    });
  }

  return processed;
};

/**
 * Aggregate scraping results
 */
export const aggregateScrapingResults = (results: any[]): any => {
  if (!results || results.length === 0) {
    return {
      totalCalls: 0,
      totalPayout: 0,
      uniqueCallers: 0,
      adjustmentsApplied: 0,
    };
  }

  let totalCalls = 0;
  let totalPayout = 0;
  const allCallers = new Set<string>();
  let adjustmentsApplied = 0;

  for (const result of results) {
    if (result.summary) {
      totalCalls += result.summary.totalCalls || 0;
      totalPayout += result.summary.totalPayout || 0;
      adjustmentsApplied += result.summary.adjustmentsApplied || 0;
    }
    if (result.calls) {
      result.calls.forEach((call: ElocalCall) => allCallers.add(call.callerId));
    }
  }

  return {
    totalCalls,
    totalPayout,
    uniqueCallers: allCallers.size,
    adjustmentsApplied,
  };
};
