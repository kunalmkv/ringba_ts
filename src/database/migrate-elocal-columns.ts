#!/usr/bin/env node
/**
 * One-time migration for elocal_call_data: rename/remove columns and set defaults for adjustment_*.
 * Run on existing Neon DB that still has the old schema.
 *
 * Usage: npx tsx src/database/migrate-elocal-columns.ts
 *    or: npm run migrate:elocal-columns
 *
 * Steps:
 * - Drop old indexes, rename payout/original_payout/original_revenue
 * - Drop campaign_phone, screen_duration, post_screen_duration, assessment, classification
 * - Set defaults and backfill NULLs for adjustment_time, adjustment_amount, adjustment_classification, adjustment_duration
 * - Create new indexes
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  const steps: { name: string; run: () => Promise<unknown> }[] = [
    {
      name: 'Drop old indexes',
      run: async () => {
        await sql`DROP INDEX IF EXISTS idx_elocal_call_data_original_payout`;
        await sql`DROP INDEX IF EXISTS idx_elocal_call_data_original_revenue`;
      },
    },
    {
      name: 'Rename payout -> elocal_payout',
      run: () => sql`ALTER TABLE elocal_call_data RENAME COLUMN payout TO elocal_payout`,
    },
    {
      name: 'Rename original_payout -> ringba_original_payout',
      run: () =>
        sql`ALTER TABLE elocal_call_data RENAME COLUMN original_payout TO ringba_original_payout`,
    },
    {
      name: 'Rename original_revenue -> ringba_original_revenue',
      run: () =>
        sql`ALTER TABLE elocal_call_data RENAME COLUMN original_revenue TO ringba_original_revenue`,
    },
    {
      name: 'Drop unused columns',
      run: async () => {
        await sql`ALTER TABLE elocal_call_data DROP COLUMN IF EXISTS campaign_phone`;
        await sql`ALTER TABLE elocal_call_data DROP COLUMN IF EXISTS screen_duration`;
        await sql`ALTER TABLE elocal_call_data DROP COLUMN IF EXISTS post_screen_duration`;
        await sql`ALTER TABLE elocal_call_data DROP COLUMN IF EXISTS assessment`;
        await sql`ALTER TABLE elocal_call_data DROP COLUMN IF EXISTS classification`;
      },
    },
    {
      name: 'Set defaults for adjustment columns',
      run: async () => {
        await sql`ALTER TABLE elocal_call_data ALTER COLUMN adjustment_time SET DEFAULT ''`;
        await sql`ALTER TABLE elocal_call_data ALTER COLUMN adjustment_amount SET DEFAULT 0`;
        await sql`ALTER TABLE elocal_call_data ALTER COLUMN adjustment_classification SET DEFAULT ''`;
        await sql`ALTER TABLE elocal_call_data ALTER COLUMN adjustment_duration SET DEFAULT 0`;
      },
    },
    {
      name: 'Backfill NULL adjustment values',
      run: async () => {
        await sql`UPDATE elocal_call_data SET adjustment_time = '' WHERE adjustment_time IS NULL`;
        await sql`UPDATE elocal_call_data SET adjustment_amount = 0 WHERE adjustment_amount IS NULL`;
        await sql`UPDATE elocal_call_data SET adjustment_classification = '' WHERE adjustment_classification IS NULL`;
        await sql`UPDATE elocal_call_data SET adjustment_duration = 0 WHERE adjustment_duration IS NULL`;
      },
    },
    {
      name: 'Create new indexes',
      run: async () => {
        await sql`CREATE INDEX IF NOT EXISTS idx_elocal_call_data_ringba_original_payout ON elocal_call_data(ringba_original_payout)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_elocal_call_data_ringba_original_revenue ON elocal_call_data(ringba_original_revenue)`;
      },
    },
  ];

  console.log('[migrate] Running elocal_call_data column migration...\n');
  let ok = 0;
  let err = 0;
  for (const step of steps) {
    try {
      await step.run();
      ok++;
      console.log(`[migrate] OK: ${step.name}`);
    } catch (e) {
      err++;
      console.error(`[migrate] FAIL: ${step.name}`);
      console.error((e as Error).message);
    }
  }
  console.log(`\n[migrate] Done. ${ok} succeeded, ${err} failed.`);
  process.exit(err > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[migrate]', (e as Error).message);
  process.exit(1);
});
