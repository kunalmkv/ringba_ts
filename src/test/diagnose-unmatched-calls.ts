#!/usr/bin/env node
/**
 * Diagnose why ringba_id is NULL for many eLocal rows.
 * Shows date ranges and match statistics.
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  console.log('\n=== Diagnosing Unmatched eLocal Calls ===\n');

  // Overall stats
  console.log('[1] Overall Statistics:');
  const overallStats = await sql`
    SELECT 
      COUNT(*) as total_elocal_calls,
      COUNT(ringba_id) as has_ringba_id,
      COUNT(*) - COUNT(ringba_id) as null_ringba_id,
      COUNT(CASE WHEN ringba_original_payout IS NOT NULL AND ringba_original_payout != 0 THEN 1 END) as has_original_payout
    FROM public.elocal_call_data
  `;
  console.log('  Total eLocal calls:', overallStats[0].total_elocal_calls);
  console.log('  Has ringba_id:', overallStats[0].has_ringba_id);
  console.log('  NULL ringba_id:', overallStats[0].null_ringba_id);
  console.log('  Has original_payout:', overallStats[0].has_original_payout);
  console.log('');

  // Date range for eLocal
  console.log('[2] eLocal Date Range:');
  const elocalDateRange = await sql`
    SELECT 
      MIN(SUBSTRING(call_timestamp, 1, 10)) as earliest_date,
      MAX(SUBSTRING(call_timestamp, 1, 10)) as latest_date,
      COUNT(DISTINCT SUBSTRING(call_timestamp, 1, 10)) as distinct_days
    FROM public.elocal_call_data
  `;
  console.log('  Earliest:', elocalDateRange[0].earliest_date);
  console.log('  Latest:', elocalDateRange[0].latest_date);
  console.log('  Days with data:', elocalDateRange[0].distinct_days);
  console.log('');

  // Date range for Ringba
  console.log('[3] Ringba Calls Date Range:');
  const ringbaDateRange = await sql`
    SELECT 
      MIN(SUBSTRING(call_timestamp, 1, 10)) as earliest_date,
      MAX(SUBSTRING(call_timestamp, 1, 10)) as latest_date,
      COUNT(DISTINCT SUBSTRING(call_timestamp, 1, 10)) as distinct_days,
      COUNT(*) as total_ringba_calls
    FROM public.ringba_original_sync
  `;
  console.log('  Earliest:', ringbaDateRange[0].earliest_date);
  console.log('  Latest:', ringbaDateRange[0].latest_date);
  console.log('  Days with data:', ringbaDateRange[0].distinct_days);
  console.log('  Total Ringba calls:', ringbaDateRange[0].total_ringba_calls);
  console.log('');

  // Breakdown by date
  console.log('[4] Breakdown by Date (eLocal):');
  const byDate = await sql`
    SELECT 
      SUBSTRING(call_timestamp, 1, 10) as date,
      COUNT(*) as total_calls,
      COUNT(ringba_id) as matched_calls,
      COUNT(*) - COUNT(ringba_id) as unmatched_calls,
      category
    FROM public.elocal_call_data
    GROUP BY SUBSTRING(call_timestamp, 1, 10), category
    ORDER BY SUBSTRING(call_timestamp, 1, 10) DESC, category
    LIMIT 20
  `;

  console.log('  Date       | Category | Total | Matched | Unmatched');
  console.log('  ' + '-'.repeat(60));
  for (const row of byDate) {
    console.log(
      `  ${row.date} | ${row.category.padEnd(8)} | ${String(row.total_calls).padStart(5)} | ${String(row.matched_calls).padStart(7)} | ${String(row.unmatched_calls).padStart(9)}`
    );
  }
  console.log('');

  console.log('=== ROOT CAUSE ===');
  console.log('');
  console.log('If you see many "Unmatched" rows above, it means:');
  console.log('');
  console.log('1. You have eLocal data for multiple dates');
  console.log('2. You have Ringba data in ringba_original_sync table');
  console.log('3. BUT the sync was only run for specific dates (e.g., Feb 2)');
  console.log('');
  console.log('SOLUTION: Run the Ringba sync for ALL dates where you have data:');
  console.log('');
  console.log('  # For a single date:');
  console.log('  npm run sync:ringba-original -- 2026-02-03');
  console.log('');
  console.log('  # For a date range:');
  console.log('  npm run sync:ringba-original -- 2026-02-02:2026-02-09');
  console.log('');
  console.log('  # For all historical data (past 10 days):');
  console.log('  npm run sync:ringba-original -- historical');
  console.log('');

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
