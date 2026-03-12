#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  // Count filled dialedNumber for February
  const febCount = await sql`
    SELECT COUNT(*)::int as count
    FROM ringba_call_data
    WHERE "dailedNumber" IS NOT NULL
      AND "dailedNumber" != ''
      AND call_timestamp >= '2026-02-01'
      AND call_timestamp <= '2026-02-28 23:59:59'
  `;

  // Count total February records
  const totalFeb = await sql`
    SELECT COUNT(*)::int as count
    FROM ringba_call_data
    WHERE call_timestamp >= '2026-02-01'
      AND call_timestamp <= '2026-02-28 23:59:59'
  `;

  console.log(`\nFebruary 2026 dialedNumber backfill progress:`);
  console.log(`  Records with dailedNumber filled: ${febCount[0].count}`);
  console.log(`  Total February records: ${totalFeb[0].count}`);
  console.log(`  Progress: ${((febCount[0].count / totalFeb[0].count) * 100).toFixed(1)}%\n`);
}

main();
