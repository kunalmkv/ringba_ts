#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  
  console.log('Testing JOIN conditions on sample data...');
  const count = await sql`
    SELECT COUNT(*) 
    FROM public.ringba_call_data rcd
    JOIN public.elocal_call_data ecd 
      ON rcd.caller_id = ecd.caller_id 
      AND DATE(rcd.call_timestamp) = DATE(ecd.call_timestamp::timestamp)
  `;
  console.log('With standard DATE() cast:', count);

  const countTimezoneAware = await sql`
     SELECT COUNT(*) 
     FROM public.ringba_call_data rcd
     JOIN public.elocal_call_data ecd 
       ON rcd.caller_id = ecd.caller_id 
       AND DATE(rcd.call_timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'EST') = DATE(ecd.call_timestamp::timestamp)
  `;
  
  console.log('With EST timezone correction:', countTimezoneAware);

  const countFallback = await sql`
     SELECT COUNT(*) 
     FROM public.ringba_call_data rcd
     JOIN public.elocal_call_data ecd 
       ON rcd.caller_id = ecd.caller_id 
  `;
  
  console.log('Just matching Caller ID (Total possible matches):', countFallback);
  
  process.exit(0);
}

main();
