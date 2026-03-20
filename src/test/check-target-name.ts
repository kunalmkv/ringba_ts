import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

async function main() {
  const sql = neon(process.env.NEON_DATABASE_URL!);

  // targetName values in ringba_call_data for March 19
  const rows = await sql`
    SELECT "targetName", category, COUNT(*) as cnt
    FROM public.ringba_call_data
    WHERE call_timestamp >= '2026-03-19'
      AND call_timestamp < '2026-03-20'
    GROUP BY "targetName", category
    ORDER BY cnt DESC
    LIMIT 20
  `;
  console.log('targetName / category in ringba_call_data for March 19:');
  rows.forEach((r: any) => console.log(JSON.stringify(r)));

  // Check overlap: calls that appear in ringba_original_sync with wrong category in ringba_call_data
  const mismatch = await sql`
    SELECT rcd.caller_id, rcd.category as rcd_category, ros.target_name
    FROM public.ringba_call_data rcd
    JOIN public.ringba_original_sync ros ON rcd.ringba_id = ros.ringba_id
    WHERE rcd.call_timestamp >= '2026-03-19'
      AND rcd.call_timestamp < '2026-03-20'
      AND (
        (rcd.category = 'STATIC' AND ros.target_name ILIKE '%appliance repair%' AND ros.target_name NOT ILIKE '%static%')
        OR
        (rcd.category = 'API' AND ros.target_name ILIKE '%static%')
      )
    LIMIT 10
  `;
  console.log('\nCategory mismatches (by ringba_id join):');
  mismatch.forEach((r: any) => console.log(JSON.stringify(r)));
  console.log('Total mismatches:', mismatch.length);
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
