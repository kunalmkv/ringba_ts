#!/usr/bin/env node
/**
 * Ringba Original Payout/Revenue Sync – run for a date range.
 *
 * Usage:
 *   npx tsx src/test/run-ringba-original-sync.ts [date-range] [category]
 *
 * date-range: "current" | "today" | "historical" | "past10days" | YYYY-MM-DD | start:end
 * category: "API" | "STATIC" | omit for all
 *
 * Examples:
 *   npx tsx src/test/run-ringba-original-sync.ts current
 *   npx tsx src/test/run-ringba-original-sync.ts 2026-02-09 STATIC
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { syncRingbaOriginalPayout } from '../services/ringba-original-sync.service.js';
import {
  getPast10DaysRange,
  getRingbaSyncDateRange,
  getDateRangeDescription,
  getCustomDateRange,
} from '../utils/date-utils.js';
import type { DateRange, RingbaOriginalSyncConfig, Category } from '../types/index.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

function parseDate(s: string): Date | null {
  if (!s || typeof s !== 'string') return null;
  const yyyy = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyy) {
    const d = new Date(parseInt(yyyy[1], 10), parseInt(yyyy[2], 10) - 1, parseInt(yyyy[3], 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const ddmmyyyy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(
      parseInt(ddmmyyyy[3], 10),
      parseInt(ddmmyyyy[2], 10) - 1,
      parseInt(ddmmyyyy[1], 10)
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const d = new Date(
      parseInt(mmddyyyy[3], 10),
      parseInt(mmddyyyy[1], 10) - 1,
      parseInt(mmddyyyy[2], 10)
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseDateRange(arg: string): DateRange {
  const lower = arg.toLowerCase();
  if (lower === 'current' || lower === 'today') return getRingbaSyncDateRange();
  if (lower === 'historical' || lower === 'past10days') return getPast10DaysRange();
  if (arg.includes(':')) {
    const [startStr, endStr] = arg.split(':').map((x) => x.trim());
    const start = parseDate(startStr);
    const end = parseDate(endStr);
    if (!start || !end) throw new Error(`Invalid date range: ${arg}`);
    if (start > end) throw new Error('Start date must be <= end date');
    return getCustomDateRange(start, end);
  }
  const date = parseDate(arg);
  if (!date) throw new Error(`Invalid date: ${arg}`);
  return getCustomDateRange(date, new Date(date));
}

async function main() {
  const dateArg = process.argv[2] ?? 'current';
  const categoryArg = process.argv[3] ?? null;
  const category: Category | null =
    categoryArg === 'API' || categoryArg === 'STATIC' ? categoryArg : null;

  const config: RingbaOriginalSyncConfig = {
    ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
    ringbaApiToken: process.env.RINGBA_API_TOKEN,
    neonDatabaseUrl: process.env.NEON_DATABASE_URL,
  };

  if (!config.ringbaAccountId || !config.ringbaApiToken) {
    console.error('[ERROR] RINGBA_ACCOUNT_ID and RINGBA_API_TOKEN are required');
    process.exit(1);
  }
  if (!config.neonDatabaseUrl) {
    console.error('[ERROR] NEON_DATABASE_URL is required');
    process.exit(1);
  }

  let dateRange: DateRange;
  try {
    dateRange = parseDateRange(dateArg);
  } catch (e) {
    console.error('[ERROR]', (e as Error).message);
    process.exit(1);
  }

  console.log('');
  console.log('Ringba Original Sync');
  console.log('Date Range:', getDateRangeDescription(dateRange));
  console.log('Category:', category ?? 'all');
  console.log('');

  try {
    await syncRingbaOriginalPayout(config, dateRange, category);
    console.log('[SUCCESS] Sync completed.');
    process.exit(0);
  } catch (e) {
    console.error('[ERROR]', (e as Error).message);
    process.exit(1);
  }
}

main();
