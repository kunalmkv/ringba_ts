#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  
  console.log('Sample from elocal_call_data:');
  const ecd = await sql`SELECT ringba_id FROM public.elocal_call_data WHERE ringba_id IS NOT NULL LIMIT 5`;
  console.log(ecd);

  console.log('\nSample from ringba_call_data:');
  const rcd = await sql`SELECT ringba_id FROM public.ringba_call_data WHERE ringba_id IS NOT NULL LIMIT 5`;
  console.log(rcd);
  
  process.exit(0);
}

main();
