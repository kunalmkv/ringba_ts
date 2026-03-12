#!/usr/bin/env node
/**
 * One-time migration to merge elocal_call_data columns into ringba_call_data
 * 1. Adds missing columns to ringba_call_data
 * 2. Creates indexes for lookups
 * 3. Backfills existing eLocal data into ringba_call_data
 *
 * Usage:
 *   npx tsx src/database/migrate-merge-elocal-to-ringba.ts
 */

import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  console.log('\n=== Starting Database Migration ===\n');
  const sql = createNeonClient();

  try {
    // 1. Add columns to ringba_call_data
    console.log('[1/3] Adding new columns to ringba_call_data...');
    await sql`
      ALTER TABLE public.ringba_call_data
      ADD COLUMN IF NOT EXISTS elocal_payout NUMERIC NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS category VARCHAR(50) NULL DEFAULT 'STATIC',
      ADD COLUMN IF NOT EXISTS ringba_original_payout NUMERIC NULL,
      ADD COLUMN IF NOT EXISTS adjustment_amount NUMERIC NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS adjustment_time TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS unmatched BOOLEAN NULL DEFAULT false
    `;
    console.log('✓ Columns added successfully');

    // 2. Add indexes
    console.log('[2/3] Creating indexes on ringba_call_data...');
    await sql`CREATE INDEX IF NOT EXISTS idx_rcd_category ON public.ringba_call_data(category)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_rcd_unmatched ON public.ringba_call_data(unmatched)`;
    console.log('✓ Indexes created successfully');

    // 3. Backfill data
    console.log('[3/3] Backfilling data from elocal_call_data to ringba_call_data...');
    console.log('  Matching on: caller_id AND call_timestamp (approximate)');

    const result = await sql`
      UPDATE public.ringba_call_data rcd
      SET 
        elocal_payout = ecd.elocal_payout,
        category = ecd.category,
        ringba_original_payout = ecd.ringba_original_payout,
        adjustment_amount = ecd.adjustment_amount,
        adjustment_time = NULLIF(TRIM(ecd.adjustment_time), '')::timestamp,
        unmatched = ecd.unmatched
      FROM public.elocal_call_data ecd
      WHERE rcd.caller_id = ecd.caller_id 
        AND DATE(rcd.call_timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'EST') = DATE(ecd.call_timestamp::timestamp)
        AND rcd.caller_id IS NOT NULL 
        AND ecd.caller_id IS NOT NULL
    `;

    console.log(`✓ Backfilled ${result.length} records successfully`);

    console.log('\n=== Migration Completed Successfully ===\n');

  } catch (error) {
    console.error('\n❌ Migration Failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
