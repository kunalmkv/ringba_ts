#!/usr/bin/env node
/**
 * Migrate the unique_phone_timestamp constraint to also include the `category` column.
 * This is required for the UPSERT ON CONFLICT (caller_id, call_timestamp, category) to work.
 */
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  
  console.log('Checking for duplicates that would prevent the constraint change...');
  const dupes = await sql`
    SELECT caller_id, call_timestamp, category, COUNT(*) as cnt
    FROM public.ringba_call_data
    WHERE caller_id IS NOT NULL AND call_timestamp IS NOT NULL AND category IS NOT NULL
    GROUP BY caller_id, call_timestamp, category
    HAVING COUNT(*) > 1
    LIMIT 20
  `;
  
  if (dupes.length > 0) {
    console.log(`⚠️  Found ${dupes.length} duplicate (caller_id, call_timestamp, category) combos:`);
    console.log(dupes);
    console.log('Removing duplicates keeping the most recently updated row...');
    await sql`
      DELETE FROM public.ringba_call_data
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY caller_id, call_timestamp, category
              ORDER BY updated_at DESC NULLS LAST, id DESC
            ) as rn
          FROM public.ringba_call_data
          WHERE caller_id IS NOT NULL AND call_timestamp IS NOT NULL AND category IS NOT NULL
        ) ranked
        WHERE rn > 1
      )
    `;
    console.log('✓ Duplicates removed');
  } else {
    console.log('✓ No duplicates found');
  }

  console.log('Dropping old constraint unique_phone_timestamp...');
  await sql`ALTER TABLE public.ringba_call_data DROP CONSTRAINT IF EXISTS unique_phone_timestamp`;
  
  console.log('Creating new constraint on (caller_id, call_timestamp, category)...');
  await sql`
    ALTER TABLE public.ringba_call_data
    ADD CONSTRAINT unique_caller_ts_category
    UNIQUE (caller_id, call_timestamp, category)
  `;
  
  console.log('✓ Constraint updated: unique_caller_ts_category (caller_id, call_timestamp, category)');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
