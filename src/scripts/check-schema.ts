#!/usr/bin/env node
import { createNeonClient } from '../config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const sql = createNeonClient();
  const result = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'ringba_call_data'
    ORDER BY ordinal_position
  `;
  console.log('Columns in ringba_call_data:');
  console.log(result);
}

main();
