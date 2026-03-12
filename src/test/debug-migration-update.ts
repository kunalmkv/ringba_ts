#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  
  console.log('Testing a single UPDATE statement...');
  const result = await sql`
      UPDATE public.ringba_call_data rcd
      SET 
        elocal_payout = ecd.elocal_payout
      FROM public.elocal_call_data ecd
      WHERE rcd.caller_id = '+17274322100'
        AND ecd.caller_id = '+17274322100'
        AND DATE(rcd.call_timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'EST') = DATE(ecd.call_timestamp::timestamp)
      RETURNING rcd.id, rcd.caller_id, rcd.elocal_payout
  `;
  
  console.log('Update result:', result);
  process.exit(0);
}

main();
