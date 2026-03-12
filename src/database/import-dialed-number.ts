import * as fs from 'fs';
import csv from 'csv-parser';
import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the root of elocal-scrapper-ts
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const CSV_FILE = path.resolve(process.cwd(), 'dialed.csv');

async function importDialedNumber() {
    if (!process.env.NEON_DATABASE_URL) {
        console.error('NEON_DATABASE_URL is missing in .env');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.NEON_DATABASE_URL
    });

    console.log('Connecting to database...');
    const client = await pool.connect();

    try {
        console.log('Adding "dialedNumber" column if it does not exist...');
        await client.query('ALTER TABLE ringba_call_data ADD COLUMN IF NOT EXISTS "dialedNumber" VARCHAR(50)');
        console.log('✅ Column check/add successful.');

        let totalRows = 0;
        console.log(`Starting CSV import from ${CSV_FILE}`);

        const records: { callId: string; dialedNumber: string }[] = [];

        // Read the CSV file
        await new Promise((resolve, reject) => {
            fs.createReadStream(CSV_FILE)
                .pipe(csv())
                .on('data', (data) => {
                    const callId = data['Inbound Call ID'];
                    const dialedNumber = data['Number'];
                    if (callId && dialedNumber) {
                        records.push({ callId, dialedNumber });
                    }
                    totalRows++;
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`Successfully parsed ${records.length} valid records out of ${totalRows} total lines in CSV.`);

        if (records.length === 0) {
            console.log('No valid records to process. Exiting.');
            return;
        }

        console.log('Updating database with dialed numbers (Batched in chunks of 500)...');

        await client.query('BEGIN');

        let updatedRows = 0;
        const BATCH_SIZE = 500;
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE);
            const mappingParts: string[] = [];
            const values: any[] = [];

            // Generate values pattern ($1, $2), ($3, $4)...
            batch.forEach((rec, idx) => {
                const baseIdx = idx * 2;
                mappingParts.push(`($${baseIdx + 1}::text, $${baseIdx + 2}::text)`);
                values.push(rec.callId, rec.dialedNumber);
            });

            // Fast update using FROM VALUES
            const query = `
                WITH updates (call_id, dialed_number) AS (
                    VALUES ${mappingParts.join(', ')}
                )
                UPDATE ringba_call_data r
                SET "dialedNumber" = u.dialed_number, updated_at = NOW()
                FROM updates u
                WHERE r.ringba_id = u.call_id
                AND (r."dialedNumber" IS DISTINCT FROM u.dialed_number OR r."dialedNumber" IS NULL);
            `;

            const res = await client.query(query, values);
            updatedRows += res.rowCount || 0;
            console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)}, updated ${res.rowCount || 0} rows.`);
        }

        await client.query('COMMIT');
        console.log(`✅ Successfully updated a total of ${updatedRows} dialed numbers in this run.`);
        console.log(`ℹ️ Unchanged records indicate they were already up-to-date or matching record was not found.`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error updating database. Transaction rolled back.', error);
    } finally {
        client.release();
        await pool.end();
    }
}

importDialedNumber().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
