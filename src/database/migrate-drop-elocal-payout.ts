#!/usr/bin/env node
/**
 * Migration: Move elocal_payout values → ringba_revenue, then drop elocal_payout column.
 *
 * What this does:
 *  1. Backfill ringba_revenue = elocal_payout for all rows where ringba_revenue IS NULL or 0,
 *     but elocal_payout > 0 (preserves any values already written by recent service runs).
 *  2. Drop the elocal_payout column from ringba_call_data.
 *
 * After this migration:
 *  - ringba_revenue is the single authoritative eLocal payout column.
 *  - The fetch-elocal-calls service writes directly to ringba_revenue.
 *  - ringba-original-sync no longer touches ringba_revenue.
 *
 * Usage:
 *   npx tsx src/database/migrate-drop-elocal-payout.ts
 *     OR
 *   npm run migrate:drop-elocal-payout
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  console.log('================================================');
  console.log('Migration: elocal_payout → ringba_revenue');
  console.log('================================================\n');

  // Step 1: Check current state
  console.log('[Step 1] Checking current column state...');
  const colCheck = await sql`
    SELECT COUNT(*) AS total,
           COUNT(elocal_payout) AS with_elocal_payout,
           COUNT(CASE WHEN elocal_payout > 0 AND (ringba_revenue IS NULL OR ringba_revenue = 0) THEN 1 END) AS needs_backfill
    FROM public.ringba_call_data
  `;
  const stats = colCheck[0] as { total: string; with_elocal_payout: string; needs_backfill: string };
  console.log(`  Total rows:          ${stats.total}`);
  console.log(`  Rows with elocal_payout set: ${stats.with_elocal_payout}`);
  console.log(`  Rows needing backfill:       ${stats.needs_backfill}`);

  // Step 2: Backfill ringba_revenue from elocal_payout where not already set
  console.log('\n[Step 2] Backfilling ringba_revenue from elocal_payout...');
  try {
    const backfillResult = await sql`
      UPDATE public.ringba_call_data
      SET
        ringba_revenue = elocal_payout,
        updated_at     = NOW()
      WHERE elocal_payout > 0
        AND (ringba_revenue IS NULL OR ringba_revenue = 0)
    `;
    console.log(`  ✅ Backfilled ${(backfillResult as any).count ?? 'N/A'} rows.`);
  } catch (e) {
    console.error('  ❌ Backfill failed:', (e as Error).message);
    process.exit(1);
  }

  // Step 3: Verify backfill - count rows that still have mismatched values
  console.log('\n[Step 3] Verifying backfill...');
  const verification = await sql`
    SELECT COUNT(*) AS remaining_gaps
    FROM public.ringba_call_data
    WHERE elocal_payout > 0
      AND (ringba_revenue IS NULL OR ringba_revenue = 0)
  `;
  const remaining = Number((verification[0] as any).remaining_gaps);
  if (remaining > 0) {
    console.warn(`  ⚠️  WARNING: ${remaining} rows still have elocal_payout > 0 but ringba_revenue is null/0.`);
    console.warn('  Aborting column drop to prevent data loss. Please investigate.');
    process.exit(1);
  }
  console.log('  ✅ All rows verified. No data gaps.');

  // Step 4: Drop the elocal_payout column
  console.log('\n[Step 4] Dropping elocal_payout column...');
  try {
    await sql`ALTER TABLE public.ringba_call_data DROP COLUMN IF EXISTS elocal_payout`;
    console.log('  ✅ Column elocal_payout dropped successfully.');
  } catch (e) {
    console.error('  ❌ Failed to drop column:', (e as Error).message);
    process.exit(1);
  }

  console.log('\n================================================');
  console.log('Migration complete!');
  console.log('ringba_revenue is now the authoritative eLocal payout column.');
  console.log('================================================\n');

  process.exit(0);
}

main().catch((e) => {
  console.error('[migrate] Fatal error:', (e as Error).message);
  process.exit(1);
});
