#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  
  console.log('Checking backfilled record count...');
  const result = await sql`
     SELECT count(*) 
     FROM public.ringba_call_data 
     WHERE elocal_payout IS NOT NULL AND elocal_payout > 0
  `;
  
  console.log('Total ringba_call_data records with eLocal payout matched:', result[0].count);
  process.exit(0);
}

main();
