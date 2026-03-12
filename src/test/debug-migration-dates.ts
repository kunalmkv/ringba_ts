#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  
  console.log('Comparing dates for caller_id: +17274322100');
  const ecd = await sql`
    SELECT id, caller_id, call_timestamp, pg_typeof(call_timestamp) as type 
    FROM public.elocal_call_data 
    WHERE caller_id = '+17274322100'
  `;
  console.log('In elocal_call_data:', ecd);

  const rcd = await sql`
    SELECT id, caller_id, call_timestamp, pg_typeof(call_timestamp) as type 
    FROM public.ringba_call_data 
    WHERE caller_id = '+17274322100'
  `;
  console.log('In ringba_call_data:', rcd);
  
  process.exit(0);
}

main();
