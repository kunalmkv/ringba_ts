#!/usr/bin/env node
/**
 * Debug why Feb 3 Ringba calls were unmatched.
 * Compares eLocal vs Ringba data and identifies root cause.
 *
 * Run: npx tsx src/test/debug-feb3-unmatched.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonDbOps } from '../database/neon-operations.js';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

type RingbaRow = {
  id: number;
  ringba_id: string;
  call_timestamp: string;
  caller_id: string | null;
  target_id: string | null;
};

async function main() {
  const db = createNeonDbOps();
  const sql = createNeonClient();
  const targetDate = new Date(2026, 1, 3); // Feb 3, 2026 (month 1 = Feb)
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const targetDay = targetDate.getDate();
  const startDate = new Date(
    Date.UTC(targetYear, targetMonth, targetDay, 5, 0, 0, 0)
  );
  const endDate = new Date(
    Date.UTC(targetYear, targetMonth, targetDay + 1, 4, 59, 59, 999)
  );

  console.log('');
  console.log('=== Debug Feb 3 unmatched ===');
  console.log('Target date (local):', targetDate.toISOString());
  console.log('startDate (UTC):', startDate.toISOString());
  console.log('endDate (UTC):', endDate.toISOString());
  console.log('');

  // eLocal: what we fetch with current (UTC-fixed) getCallsForDateRange
  const elocalCalls = await db.getCallsForDateRange(startDate, endDate, null);
  console.log(`eLocal calls fetched (for 2026-02-03): ${elocalCalls.length}`);

  const elocalByCategory = new Map<string, number>();
  const elocalSampleCallerIds = new Set<string>();
  for (const c of elocalCalls) {
    const cat = (c.category || 'STATIC') as string;
    elocalByCategory.set(cat, (elocalByCategory.get(cat) || 0) + 1);
    if (elocalSampleCallerIds.size < 5) elocalSampleCallerIds.add(c.caller_id);
  }
  console.log('eLocal by category:', Object.fromEntries(elocalByCategory));
  console.log('eLocal sample caller_id:', [...elocalSampleCallerIds]);
  if (elocalCalls.length > 0) {
    console.log('eLocal sample call_timestamp:', elocalCalls[0].call_timestamp);
  }
  console.log('');

  // Ringba: query ringba_original_sync for Feb 3 (date part 2026-02-03)
  const ringbaRows = (await sql`
    SELECT id, ringba_id, call_timestamp, caller_id, target_id
    FROM ringba_original_sync
    WHERE SUBSTRING(call_timestamp, 1, 10) = '2026-02-03'
    ORDER BY call_timestamp
    LIMIT 200
  `) as RingbaRow[];
  console.log(`Ringba calls for 2026-02-03: ${ringbaRows.length}`);

  const ringbaByTarget = new Map<string, number>();
  const ringbaSampleCaller = new Set<string>();
  for (const r of ringbaRows) {
    const tid = r.target_id || 'null';
    ringbaByTarget.set(tid, (ringbaByTarget.get(tid) || 0) + 1);
    const cid = r.caller_id;
    if (cid && ringbaSampleCaller.size < 5) ringbaSampleCaller.add(cid);
  }
  console.log('Ringba by target_id:', Object.fromEntries(ringbaByTarget));
  console.log('Ringba sample caller_id:', [...ringbaSampleCaller]);
  if (ringbaRows.length > 0) {
    console.log('Ringba sample call_timestamp:', ringbaRows[0].call_timestamp);
  }
  console.log('');

  // Simulate BEFORE fix: which date would getCallsForDateRange have used in local TZ?
  const formatDateLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dateIfLocalTZ = formatDateLocal(new Date(startDate));
  const dateIfUTC = '2026-02-03';
  console.log('--- Root cause ---');
  console.log('Sync uses startDate = Feb 3 05:00 UTC. When building the eLocal date list:');
  console.log('  - Using LOCAL timezone (old bug): first date =', dateIfLocalTZ);
  console.log('  - Using UTC (fixed):              first date =', dateIfUTC);
  if (dateIfLocalTZ !== dateIfUTC) {
    console.log('');
    console.log('ROOT CAUSE: getCallsForDateRange used local getFullYear/getMonth/getDate.');
    console.log('On this machine, Feb 3 05:00 UTC is still', dateIfLocalTZ, 'local.');
    console.log('So eLocal was fetched for', dateIfLocalTZ, 'while Ringba had 52 calls for 2026-02-03.');
    console.log('Different calendar days => matchCall never matches => 0 matches.');
    console.log('');
    console.log('FIX: getCallsForDateRange now uses UTC (getUTCFullYear, getUTCMonth, getUTCDate)');
    console.log('so the eLocal date list is 2026-02-03 for Feb 3 sync. Re-run sync for Feb 3.');
  } else {
    console.log('');
    console.log('On this machine local date equals UTC for this range; root cause was');
    console.log('timezone-dependent (e.g. PST/IST). Fix ensures UTC everywhere.');
  }
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
