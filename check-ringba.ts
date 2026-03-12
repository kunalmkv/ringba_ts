#!/usr/bin/env node
import { createNeonClient } from './src/config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  const idToCheck1 = 'RGB2BB4F9C86FC38A52A260A0242CF64B4EB1C281EAV3ZKT01';
  const idToCheck2 = 'RGB5AEC1BD66DAA69D90FC62178C036FB07F9C579C5V3RHJ01';
  
  const res = await sql`
    SELECT id, caller_id, call_timestamp, category, ringba_id 
    FROM public.ringba_call_data
    WHERE ringba_id IN (${idToCheck1}, ${idToCheck2})
  `;
  console.log('Rows that already have these Ringba IDs:', res);
  process.exit(0);
}

main();
