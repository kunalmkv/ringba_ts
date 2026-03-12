#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  
  // Check if unique constraint exists on (caller_id, call_timestamp, category)
  const constraints = await sql`
    SELECT constraint_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_name = 'ringba_call_data'
      AND constraint_type IN ('UNIQUE', 'PRIMARY KEY')
  `;
  console.log('Existing constraints on ringba_call_data:', constraints);

  const hasUniqueConstraint = constraints.some(c => 
    (c.constraint_name as string).includes('caller') || 
    (c.constraint_name as string).includes('category') ||
    (c.constraint_name as string).includes('timestamp')
  );

  if (!hasUniqueConstraint) {
    console.log('\nNo composite unique constraint found. Creating one...');
    // First check for actual duplicate rows before applying the constraint
    const dupes = await sql`
      SELECT caller_id, call_timestamp, category, COUNT(*) as cnt
      FROM public.ringba_call_data
      GROUP BY caller_id, call_timestamp, category
      HAVING COUNT(*) > 1
      LIMIT 10
    `;
    if (dupes.length > 0) {
      console.log(`⚠️  Found ${dupes.length} sets of duplicate rows. Must resolve before adding constraint:`);
      console.log(dupes);
    } else {
      await sql`
        ALTER TABLE public.ringba_call_data
        ADD CONSTRAINT uq_ringba_call_data_caller_ts_cat
        UNIQUE (caller_id, call_timestamp, category)
      `;
      console.log('✓ Unique constraint created: uq_ringba_call_data_caller_ts_cat');
    }
  } else {
    console.log('✓ Composite unique constraint already exists');
  }
  
  process.exit(0);
}

main();
