#!/usr/bin/env node
import { createNeonClient } from './src/config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  const callerId = '+14072565548';
  
  console.log(`Checking ALL Ringba calls for caller ${callerId}`);
  const calls = await sql`
     SELECT id, caller_id, call_timestamp, ringba_payout, ringba_revenue_amount
     FROM public.ringba_original_sync
     WHERE caller_id = ${callerId}
     ORDER BY call_timestamp
  `;
  
  let i = 1;
  for (const c of calls) {
     console.log(`${i++}. Ringba Call: ${c.call_timestamp} | Payout: ${c.ringba_payout} | Revenue: ${c.ringba_revenue_amount}`);
  }

  process.exit(0);
}

main().catch(console.error);
