#!/usr/bin/env node
/**
 * One-time migration:
 * 1. Rename table ringba_calls → ringba_original_sync
 * 2. Rename column call_date_time → call_timestamp
 * 3. Recreate indexes with new names
 *
 * Run: npx tsx src/database/migrate-ringba-calls-to-original-sync.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  console.log('[migrate] Renaming ringba_calls table and call_date_time column...\n');

  try {
    // 1. Rename table
    console.log('[migrate] Renaming table ringba_calls → ringba_original_sync...');
    await (sql as any).query('ALTER TABLE ringba_calls RENAME TO ringba_original_sync', []);
    console.log('[migrate]   ✓ done\n');

    // 2. Rename column
    console.log('[migrate] Renaming column call_date_time → call_timestamp...');
    await (sql as any).query(
      'ALTER TABLE ringba_original_sync RENAME COLUMN call_date_time TO call_timestamp',
      []
    );
    console.log('[migrate]   ✓ done\n');

    // 3. Drop old indexes (they keep old names after table rename) and create new ones
    console.log('[migrate] Updating indexes...');
    await (sql as any).query('DROP INDEX IF EXISTS idx_ringba_calls_ringba_id', []);
    await (sql as any).query('DROP INDEX IF EXISTS idx_ringba_calls_caller_id', []);
    await (sql as any).query('DROP INDEX IF EXISTS idx_ringba_calls_call_date_time', []);
    await (sql as any).query(
      'CREATE INDEX IF NOT EXISTS idx_ringba_original_sync_ringba_id ON ringba_original_sync(ringba_id)',
      []
    );
    await (sql as any).query(
      'CREATE INDEX IF NOT EXISTS idx_ringba_original_sync_caller_id ON ringba_original_sync(caller_id)',
      []
    );
    await (sql as any).query(
      'CREATE INDEX IF NOT EXISTS idx_ringba_original_sync_call_timestamp ON ringba_original_sync(call_timestamp)',
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
