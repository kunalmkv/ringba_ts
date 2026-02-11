#!/usr/bin/env node
/**
 * One-time migration: drop adjustment_classification and adjustment_duration from elocal_call_data.
 * Run on existing Neon DB after migrate-elocal-columns (or if table still has these columns).
 *
 * Usage: npx tsx src/database/migrate-drop-adjustment-cols.ts
 *    or: npm run migrate:drop-adjustment-cols
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  console.log('[migrate] Dropping adjustment_classification and adjustment_duration...\n');

  try {
    await sql`ALTER TABLE elocal_call_data DROP COLUMN IF EXISTS adjustment_classification`;
    console.log('[migrate] OK: Dropped adjustment_classification');
  } catch (e) {
    console.error('[migrate] FAIL: Drop adjustment_classification:', (e as Error).message);
  }

  try {
    await sql`ALTER TABLE elocal_call_data DROP COLUMN IF EXISTS adjustment_duration`;
    console.log('[migrate] OK: Dropped adjustment_duration');
  } catch (e) {
    console.error('[migrate] FAIL: Drop adjustment_duration:', (e as Error).message);
  }

  console.log('\n[migrate] Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error('[migrate]', (e as Error).message);
  process.exit(1);
});
