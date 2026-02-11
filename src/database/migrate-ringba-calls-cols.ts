#!/usr/bin/env node
/**
 * One-time migration for ringba_calls table:
 * - Rename inbound_call_id -> ringba_id, payout_amount -> ringba_payout
 * - Drop caller_id_e164, inbound_phone_number
 *
 * Usage: npx tsx src/database/migrate-ringba-calls-cols.ts
 *    or: npm run migrate:ringba-calls-cols
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
      name: 'Drop old index on inbound_call_id',
      run: () => sql`DROP INDEX IF EXISTS idx_ringba_calls_inbound_call_id`,
    },
    {
      name: 'Rename inbound_call_id -> ringba_id',
      run: () => sql`ALTER TABLE ringba_calls RENAME COLUMN inbound_call_id TO ringba_id`,
    },
    {
      name: 'Rename payout_amount -> ringba_payout',
      run: () => sql`ALTER TABLE ringba_calls RENAME COLUMN payout_amount TO ringba_payout`,
    },
    {
      name: 'Drop caller_id_e164',
      run: () => sql`ALTER TABLE ringba_calls DROP COLUMN IF EXISTS caller_id_e164`,
    },
    {
      name: 'Drop inbound_phone_number',
      run: () => sql`ALTER TABLE ringba_calls DROP COLUMN IF EXISTS inbound_phone_number`,
    },
    {
      name: 'Create index on ringba_id',
      run: () => sql`CREATE INDEX IF NOT EXISTS idx_ringba_calls_ringba_id ON ringba_calls(ringba_id)`,
    },
  ];

  console.log('[migrate] Running ringba_calls column migration...\n');
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
