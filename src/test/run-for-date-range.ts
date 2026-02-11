#!/usr/bin/env node
/**
 * Run eLocal scrapper for a custom date range.
 *
 * Usage:
 *   npx tsx src/test/run-for-date-range.ts <start-date> <end-date> [category]
 *
 * Date format: YYYY-MM-DD (e.g. 2026-02-02 2026-02-07)
 * Category: STATIC (default) | API
 *
 * Example:
 *   npx tsx src/test/run-for-date-range.ts 2026-02-02 2026-02-07 STATIC
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { scrapeElocalDataWithDateRange } from '../services/fetch-elocal-calls.service.js';
import { getCustomDateRange, getDateRangeDescription } from '../utils/date-utils.js';
import type { Config } from '../types/index.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const startStr = process.argv[2];
  const endStr = process.argv[3];
  const category = (process.argv[4] || 'STATIC') as 'STATIC' | 'API';

  if (!startStr || !endStr) {
    console.error('Usage: npx tsx src/test/run-for-date-range.ts <start-date> <end-date> [category]');
    console.error('Example: npx tsx src/test/run-for-date-range.ts 2026-02-02 2026-02-07 STATIC');
    process.exit(1);
  }

  const startDate = parseDate(startStr);
  const endDate = parseDate(endStr);
  if (!startDate || !endDate) {
    console.error('Invalid date(s). Use YYYY-MM-DD.');
    process.exit(1);
  }
  if (startDate > endDate) {
    console.error('Start date must be <= end date.');
    process.exit(1);
  }

  const dateRange = getCustomDateRange(startDate, endDate);
  const config: Config = {
    elocalApiKey: process.env.ELOCAL_API_KEY,
    neonDatabaseUrl: process.env.NEON_DATABASE_URL,
  };

  console.log('\n===========================================');
  console.log('Fetch eLocal Calls – Custom Date Range');
  console.log('===========================================\n');
  console.log('Date Range:', getDateRangeDescription(dateRange), `(${dateRange.startDateURL} to ${dateRange.endDateURL})`);
  console.log('Category:', category);
  console.log('Neon DB:', config.neonDatabaseUrl ? '✓' : '✗');
  console.log('eLocal API Key:', config.elocalApiKey ? '✓' : '✗');
  console.log('\n');

  try {
    const result = await scrapeElocalDataWithDateRange(config)(dateRange)('custom')(category)();
    console.log('\n===========================================');
    console.log('Results');
    console.log('===========================================\n');
    console.log('Session ID:', result.sessionId);
    console.log('Date Range:', result.dateRange);
    console.log('Total Calls:', result.summary.totalCalls);
    console.log('Total Payout: $' + result.summary.totalPayout.toFixed(2));
    console.log('Unique Callers:', result.summary.uniqueCallers);
    console.log('Calls Inserted:', result.databaseResults.callsInserted);
    console.log('Calls Updated:', result.databaseResults.callsUpdated);
    console.log('\n✓ Done.\n');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
