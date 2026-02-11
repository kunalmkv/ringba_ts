#!/usr/bin/env node
/**
 * One-time migration: Rename columns in elocal_call_data table
 *
 * Renames:
 *   date_of_call → call_timestamp
 *   ringba_inbound_call_id → ringba_id
 *
 * Run: npx tsx src/database/migrate-elocal-rename-cols.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  console.log('[migrate] Renaming columns in elocal_call_data...\n');

  try {
    // 1. Rename date_of_call → call_timestamp
    console.log('[migrate] Renaming date_of_call → call_timestamp...');
    await (sql as any).query(
      'ALTER TABLE elocal_call_data RENAME COLUMN date_of_call TO call_timestamp',
      []
    );
    console.log('[migrate]   ✓ done\n');

    // 2. Rename ringba_inbound_call_id → ringba_id
    console.log('[migrate] Renaming ringba_inbound_call_id → ringba_id...');
    await (sql as any).query(
      'ALTER TABLE elocal_call_data RENAME COLUMN ringba_inbound_call_id TO ringba_id',
      []
    );
    console.log('[migrate]   ✓ done\n');

    // 3. Recreate indexes that referenced old column names (drop old, create new)
    console.log('[migrate] Updating indexes...');
    await (sql as any).query('DROP INDEX IF EXISTS idx_elocal_call_data_date_of_call', []);
    await (sql as any).query(
      'CREATE INDEX IF NOT EXISTS idx_elocal_call_data_call_timestamp ON elocal_call_data(call_timestamp)',
      []
    );
    await (sql as any).query('DROP INDEX IF EXISTS idx_caller_date_category', []);
    await (sql as any).query(
      'CREATE INDEX IF NOT EXISTS idx_caller_timestamp_category ON elocal_call_data(caller_id, call_timestamp, category)',
      []
    );
    console.log('[migrate]   ✓ indexes updated\n');

    console.log('[migrate] ========================================');
    console.log('[migrate] ✓ Migration completed successfully.');
    console.log('[migrate] ========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('[migrate] Error:', (error as Error).message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[migrate] Fatal error:', e);
  process.exit(1);
});
