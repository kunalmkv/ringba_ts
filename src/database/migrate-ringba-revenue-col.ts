#!/usr/bin/env node
/**
 * One-time migration: rename revenue_amount -> ringba_revenue_amount in ringba_calls.
 *
 * Usage: npx tsx src/database/migrate-ringba-revenue-col.ts
 *    or: npm run migrate:ringba-revenue-col
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  console.log('[migrate] Renaming revenue_amount -> ringba_revenue_amount...\n');
  try {
    await sql`ALTER TABLE ringba_calls RENAME COLUMN revenue_amount TO ringba_revenue_amount`;
    console.log('[migrate] OK: Done.');
  } catch (e) {
    console.error('[migrate] FAIL:', (e as Error).message);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('[migrate]', (e as Error).message);
  process.exit(1);
});
