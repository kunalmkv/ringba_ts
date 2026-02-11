import { createNeonClient } from './src/config/database.js';

const sql = createNeonClient();

async function test() {
  try {
    // Check what dates exist
    const allDates = await sql`
      SELECT DISTINCT SUBSTRING(call_timestamp::text, 1, 10) as date, COUNT(*) as count
      FROM elocal_call_data
      GROUP BY SUBSTRING(call_timestamp::text, 1, 10)
      ORDER BY date DESC
      LIMIT 10
    `;
    console.log('Dates in elocal_call_data:');
    console.log(allDates);
    
    // Check Feb 3 specifically
    const feb3 = await sql`
      SELECT COUNT(*) as count
      FROM elocal_call_data
      WHERE SUBSTRING(call_timestamp::text, 1, 10) = '2026-02-03'
    `;
    console.log('\nFeb 3 count:', feb3);
    
    // Try the actual query being used
    const datesInRange = ['2026-02-03'];
    const result = await sql`
      SELECT 
        id, caller_id, call_timestamp as date_of_call, elocal_payout as payout, 
        category, ringba_original_payout as original_payout, 
        ringba_original_revenue as original_revenue, call_duration as total_duration
      FROM elocal_call_data
      WHERE SUBSTRING(call_timestamp::text, 1, 10) = ANY(${datesInRange})
      ORDER BY caller_id, call_timestamp
    `;
    console.log('\nQuery result count:', result.length);
    if (result.length > 0) {
      console.log('First row:', result[0]);
    }
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

test();
