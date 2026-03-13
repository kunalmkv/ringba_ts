#!/usr/bin/env node
import { createNeonClient } from './src/config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();

  console.log('Fetching eLocal calls for March 12...');
  const calls = await sql`
    SELECT id, caller_id, call_timestamp, category, elocal_payout, ringba_original_payout, ringba_revenue, ringba_id
    FROM public.ringba_call_data
    WHERE DATE(call_timestamp) = '2026-03-12'
      AND elocal_payout > 0
  `;
  
  console.log(`Found ${calls.length} eLocal calls on March 12 WITH PAYOUT>0.`);
  
  let mismatchCount = 0;
  for (const c of calls) {
    if (Number(c.elocal_payout) !== Number(c.ringba_revenue) && c.ringba_id) {
       mismatchCount++;
       console.log(`MISMATCH: ID=${c.id} Caller=${c.caller_id} eLocalPayout=${c.elocal_payout} RingbaRev=${c.ringba_revenue} Cat=${c.category} RingbaID=${c.ringba_id}`);
    }
  }

  if (mismatchCount === 0) {
     console.log('All calls that have a Ringba ID already have matching revenue! No missed updates.');
  } else {
     console.log(`Found ${mismatchCount} missed updates.`);
  }

  process.exit(0);
}

main().catch(console.error);
