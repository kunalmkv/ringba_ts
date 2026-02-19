
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables
dotenv.config();
dotenv.config({ path: join(process.cwd(), '.env.neon') });

const connectionString = process.env.NEON_DATABASE_URL;

if (!connectionString) {
    console.error('Error: NEON_DATABASE_URL is not set.');
    process.exit(1);
}

const sql = neon(connectionString);

async function addTestData() {
    const testCall = {
        caller_id: '+12223334444',
        call_timestamp: new Date().toISOString(),
        elocal_payout: 25.50,
        category: 'STATIC',
        city_state: 'Test City, TS',
        zip_code: '12345',
        call_duration: 120
    };

    console.log('Attempting to add test call:', testCall);

    try {
        const result = await sql`
      INSERT INTO elocal_call_data (
        caller_id, 
        call_timestamp, 
        elocal_payout, 
        category, 
        city_state, 
        zip_code, 
        call_duration
      ) VALUES (
        ${testCall.caller_id}, 
        ${testCall.call_timestamp}, 
        ${testCall.elocal_payout}, 
        ${testCall.category}, 
        ${testCall.city_state}, 
        ${testCall.zip_code}, 
        ${testCall.call_duration}
      )
      ON CONFLICT (caller_id, call_timestamp, category) DO NOTHING
      RETURNING *;
    `;

        if (result.length > 0) {
            console.log('✅ Test call added successfully:', result[0]);
        } else {
            console.log('⚠️ Test call already exists (skipped due to conflict).');
        }
    } catch (error) {
        console.error('❌ Error adding test data:', error);
    }
}

addTestData();
