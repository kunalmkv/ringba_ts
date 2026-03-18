/**
 * View Calls by Date
 *
 * Fetches and displays all calls from the database for a given date,
 * grouped by category (STATIC / API), with a revenue summary.
 *
 * Usage:
 *   npx tsx src/test/view-calls-by-date.ts <YYYY-MM-DD> [category]
 *
 * Examples:
 *   npx tsx src/test/view-calls-by-date.ts 2026-03-17
 *   npx tsx src/test/view-calls-by-date.ts 2026-03-17 STATIC
 *   npx tsx src/test/view-calls-by-date.ts 2026-03-17 API
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

const dateArg = process.argv[2];
const categoryArg = process.argv[3]?.toUpperCase() || null;  // 'STATIC', 'API', or null for all

if (!dateArg) {
  console.error('Usage: npx tsx src/test/view-calls-by-date.ts <YYYY-MM-DD> [category]');
  process.exit(1);
}

const sql = neon(process.env.NEON_DATABASE_URL!);


const money = (n: number) => `$${Number(n).toFixed(2)}`;
const formatTs = (ts: string | Date) =>
  ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';

async function main() {
  console.log('');
  console.log('='.repeat(90));
  console.log(`  Calls for: ${dateArg} (EST) ${categoryArg ? `  (${categoryArg})` : '  (ALL categories)'}`);
  console.log('='.repeat(90));

  let rows: any[];

  if (categoryArg) {
    rows = await sql`
      SELECT
        id, caller_id, call_timestamp, category,
        ringba_revenue, ringba_original_payout,
        adjustment_amount, ringba_id, unmatched
      FROM public.ringba_call_data
      WHERE DATE(call_timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York') = ${dateArg}::date
        AND category = ${categoryArg}
      ORDER BY call_timestamp ASC
    `;
  } else {
    rows = await sql`
      SELECT
        id, caller_id, call_timestamp, category,
        ringba_revenue, ringba_original_payout,
        adjustment_amount, ringba_id, unmatched
      FROM public.ringba_call_data
      WHERE DATE(call_timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York') = ${dateArg}::date
      ORDER BY category, call_timestamp ASC
    `;
  }

  if (rows.length === 0) {
    console.log(`\n  No calls found for ${dateArg}${categoryArg ? ` (${categoryArg})` : ''}.`);
    console.log('='.repeat(90));
    return;
  }

  // Group by category
  const groups: Record<string, typeof rows> = {};
  for (const row of rows) {
    const cat = row.category || '(null)';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(row);
  }

  let grandTotalRevenue = 0;
  let grandTotalCalls = 0;

  for (const [cat, calls] of Object.entries(groups)) {
    const totalRevenue = calls.reduce((s, c) => s + Number(c.ringba_revenue || 0), 0);

    console.log('');
    console.log(`  ── ${cat} ─────────────────────────────────────`);
    console.log(
      `  ${'#'.padEnd(5)} ${'Caller ID'.padEnd(16)} ${'Timestamp (UTC)'.padEnd(22)} ${'Revenue'.padStart(10)} ${'Adj Amt'.padStart(9)} ${'Category'.padEnd(8)} ${'Ringba ID'.padEnd(20)}`
    );
    console.log('  ' + '-'.repeat(100));

    calls.forEach((call, i) => {
      const rev  = Number(call.ringba_revenue || 0);
      const adj  = Number(call.adjustment_amount || 0);
      const catLabel = call.category || '—';
      const ringbaId = call.ringba_id ? call.ringba_id.slice(-10) : '—';

      console.log(
        `  ${String(i + 1).padEnd(5)} ${String(call.caller_id || '—').padEnd(16)} ${formatTs(call.call_timestamp).padEnd(22)} ${money(rev).padStart(10)} ${money(adj).padStart(9)} ${catLabel.padEnd(8)} ...${ringbaId}`
      );
    });

    console.log('  ' + '-'.repeat(100));
    console.log(`  Calls: ${calls.length}   Total Revenue: ${money(totalRevenue)}`);
    grandTotalRevenue += totalRevenue;
    grandTotalCalls += calls.length;
  }

  console.log('');
  console.log('='.repeat(90));
  console.log(`  GRAND TOTAL  |  Calls: ${grandTotalCalls}  |  Revenue: ${money(grandTotalRevenue)}`);
  console.log('='.repeat(90));
  console.log('');
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
