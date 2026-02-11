#!/usr/bin/env node
/**
 * One-time migration: Rename total_duration → call_duration in elocal_call_data
 *
 * Run: npx tsx src/database/migrate-elocal-total-duration-to-call-duration.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { createNeonClient } from '../config/database.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  console.log('[migrate] Renaming total_duration → call_duration in elocal_call_data...\n');

  try {
    await (sql as any).query(
      'ALTER TABLE elocal_call_data RENAME COLUMN total_duration TO call_duration',
      []
    );
    console.log('[migrate] ✓ done\n');
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
