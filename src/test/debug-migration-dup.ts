#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  
  console.log('Duplicate check on ringba_id in elocal_call_data:');
  const ecd = await sql`
    SELECT ringba_id, COUNT(*) 
    FROM public.elocal_call_data 
    WHERE ringba_id IS NOT NULL 
    GROUP BY ringba_id 
    HAVING COUNT(*) > 1 
    LIMIT 5
  `;
  console.log('Duplicates in elocal_call_data itself:', ecd);

  console.log('\nChecking the specific violating ID RGBCD8FA178BFAB70BE5A3FD1862C3858FB97190553V3M8401:');
  const specificEcd = await sql`SELECT id, caller_id, call_timestamp, ringba_id FROM public.elocal_call_data WHERE ringba_id = 'RGBCD8FA178BFAB70BE5A3FD1862C3858FB97190553V3M8401'`;
  console.log('In elocal_call_data:', specificEcd);

  const specificRcd = await sql`SELECT id, caller_id, call_timestamp, ringba_id FROM public.ringba_call_data WHERE ringba_id = 'RGBCD8FA178BFAB70BE5A3FD1862C3858FB97190553V3M8401'`;
  console.log('In ringba_call_data:', specificRcd);
  
  process.exit(0);
}

main();
