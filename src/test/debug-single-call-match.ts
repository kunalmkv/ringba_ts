#!/usr/bin/env node
/**
 * Debug why a specific Ringba call is not matching an eLocal row.
 * Uses DB only (no Ringba API). Compares Ringba row vs eLocal row(s) with same caller.
 *
 * Usage: npx tsx src/test/debug-single-call-match.ts <ringba_id> [caller_id]
 *   ringba_id: e.g. RGBD574BE5DFA49C47ACAD6B8818E5CBC9A5E04CEDFV386W01
 *   caller_id: optional, e.g. +18326127007 (default: read from ringba_original_sync)
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonDbOps } from '../database/neon-operations.js';
import { getCategoryFromTargetId } from '../http/ringba-target-calls.js';
import { parseDateAsEastern, getEasternDatePart } from '../utils/date-normalizer.js';
import type { DatabaseCallRecord } from '../types/index.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

// Commented out as not currently used
// const toE164 = (raw: string | null | undefined): string | null => {
//   if (!raw) return null;
//   const digits = (raw || '').replace(/\D/g, '');
//   if (!digits) return null;
//   if (String(raw).startsWith('+')) return `+${digits}`;
//   if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
//   if (digits.length === 10) return `+1${digits}`;
//   return digits.length > 0 ? `+${digits}` : null;
// };

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
  } catch {
    // ignore
  }
  return null;
}

function timeDiffMinutes(date1: Date | null, date2: Date | null): number {
  if (!date1 || !date2) return Infinity;
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
}

const WINDOW_MINUTES = 120;
const PAYOUT_TOLERANCE = 0.01;

/** Same logic as ringba-original-sync matchCall (without MatchResult shape). */
function whyNoMatch(
  ringbaCallDt: string,
  ringbaPayout: number,
  _ringbaTargetId: string | null,
  elocalCall: DatabaseCallRecord,
  windowMinutes = WINDOW_MINUTES,
  payoutTolerance = PAYOUT_TOLERANCE
): { match: boolean; reason?: string; details?: Record<string, unknown> } {
  const elocalDate = parseDateAsEastern(elocalCall.call_timestamp) ?? parseDate(elocalCall.call_timestamp);
  const ringbaDate = parseDateAsEastern(ringbaCallDt) ?? parseDate(ringbaCallDt);

  if (!elocalDate) {
    return { match: false, reason: 'parse_elocal_fail', details: { call_timestamp: elocalCall.call_timestamp } };
  }
  if (!ringbaDate) {
    return { match: false, reason: 'parse_ringba_fail', details: { call_dt: ringbaCallDt } };
  }

  const elocalDateStr = getEasternDatePart(elocalDate);
  const ringbaDateStr = getEasternDatePart(ringbaDate);
  const daysDiff =
    Math.abs(new Date(elocalDateStr).getTime() - new Date(ringbaDateStr).getTime()) /
    (1000 * 60 * 60 * 24);

  if (daysDiff > 1) {
    return {
      match: false,
      reason: 'days_diff',
      details: { elocalDateStr, ringbaDateStr, daysDiff: Math.round(daysDiff * 100) / 100 },
    };
  }

  const elocalTimeOnly = new Date(elocalDate);
  elocalTimeOnly.setSeconds(0, 0);
  const ringbaTimeOnly = new Date(ringbaDate);
  ringbaTimeOnly.setSeconds(0, 0);
  const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
  const effectiveWindow = daysDiff === 0 ? windowMinutes : 24 * 60;
  if (timeDiff > effectiveWindow) {
    return {
      match: false,
      reason: 'time_window',
      details: {
        timeDiffMinutes: Math.round(timeDiff * 100) / 100,
        effectiveWindowMinutes: effectiveWindow,
        elocalDateStr,
        ringbaDateStr,
      },
    };
  }

  const elocalPayout = Number(elocalCall.elocal_payout ?? 0);
  const payoutDiff = Math.abs(elocalPayout - ringbaPayout);
  if (elocalPayout > 0 && ringbaPayout > 0 && payoutDiff > payoutTolerance) {
    return {
      match: false,
      reason: 'payout_tolerance',
      details: { elocalPayout, ringbaPayout, payoutDiff, payoutTolerance },
    };
  }

  return { match: true };
}

async function main() {
  const ringbaId = process.argv[2];
  const callerArg = process.argv[3];

  if (!ringbaId) {
    console.error('Usage: npx tsx src/test/debug-single-call-match.ts <ringba_id> [caller_id]');
    process.exit(1);
  }

  const db = createNeonDbOps();

  const ringbaRow = await db.getRingbaCallByRingbaId(ringbaId);
  if (!ringbaRow) {
    console.error(`Ringba call not found: ${ringbaId}`);
    process.exit(1);
  }

  const callerToSearch = callerArg ?? ringbaRow.caller_id ?? '';
  const digits = callerToSearch.replace(/\D/g, '');
  const searchDigits = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!searchDigits) {
    console.error('No caller_id on Ringba row and none provided.');
    process.exit(1);
  }

  const elocalRows = await db.getElocalCallsByCallerDigits(searchDigits);
  if (elocalRows.length === 0) {
    console.error(`No eLocal rows found for caller containing ...${searchDigits}`);
    process.exit(1);
  }

  const ringbaCategory = ringbaRow.target_id ? getCategoryFromTargetId(ringbaRow.target_id) : null;

  console.log('\n=== Debug: Single call match ===\n');
  console.log('Ringba row:');
  console.log('  ringba_id:', ringbaRow.ringba_id);
  console.log('  call_timestamp:', ringbaRow.call_timestamp);
  console.log('  caller_id:', ringbaRow.caller_id);
  console.log('  target_id:', ringbaRow.target_id);
  console.log('  ringba_category (from target):', ringbaCategory ?? '(unknown – no target_id)');
  console.log('  ringba_payout:', ringbaRow.ringba_payout);
  console.log('');
  console.log(`eLocal rows for caller ...${searchDigits}: ${elocalRows.length}`);
  console.log('');

  for (const elocal of elocalRows) {
    const elocalCategory = (elocal.category || 'STATIC') as string;
    const categoryMismatch =
      ringbaCategory != null && elocalCategory !== ringbaCategory;

    console.log('--- eLocal id', elocal.id, '---');
    console.log('  caller_id:', elocal.caller_id);
    console.log('  call_timestamp:', elocal.call_timestamp);
    console.log('  category:', elocalCategory);
    console.log('  elocal_payout:', elocal.elocal_payout);
    console.log('  ringba_original_payout:', elocal.ringba_original_payout ?? '(none)');

    if (categoryMismatch) {
      console.log('  => CATEGORY MISMATCH: Ringba is', ringbaCategory, 'but eLocal is', elocalCategory);
      console.log('');
      continue;
    }

    const result = whyNoMatch(
      ringbaRow.call_timestamp,
      Number(ringbaRow.ringba_payout ?? 0),
      ringbaRow.target_id,
      elocal
    );

    if (result.match) {
      console.log('  => WOULD MATCH (same logic as sync).');
    } else {
      console.log('  => NO MATCH:', result.reason, result.details ?? '');
    }
    console.log('');
  }

  // Check if eLocal date would be included in sync date range
  const ringbaDate = parseDateAsEastern(ringbaRow.call_timestamp) ?? parseDate(ringbaRow.call_timestamp);
  if (ringbaDate) {
    const ringbaDateStr = getEasternDatePart(ringbaDate);
    const utcDateStr = ringbaDate.toISOString().split('T')[0];
    console.log('--- Sync date-range check ---');
    console.log('  Ringba call Eastern date:', ringbaDateStr);
    console.log('  Ringba call UTC date:', utcDateStr);
    console.log(
      '  When sync runs for that day, getCallsForDateRange uses UTC dates and fetches eLocal where SUBSTRING(call_timestamp,1,10) IN (that day UTC, next day UTC).'
    );
    console.log(
      '  If eLocal call_timestamp is stored in Eastern, a call late at night EST can be "previous calendar day" in Eastern vs UTC – so it may be EXCLUDED from the fetched eLocal set.'
    );
    console.log('');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
