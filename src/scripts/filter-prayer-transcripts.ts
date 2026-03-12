#!/usr/bin/env node
/**
 * Filter and download ringba_call_data rows with "prayer" in transcript
 * Date range: January 1 - January 31, 2026
 *
 * Usage:
 *   npx tsx src/scripts/filter-prayer-transcripts.ts
 */

import { createNeonClient } from '../config/database.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

interface PrayerCallRecord {
  id: number;
  caller_id: string | null;
  ringba_id: string;
  campaignName: string | null;
  publisherName: string | null;
  targetName: string | null;
  call_duration: string;
  call_timestamp: string | null;
  recordingUrl: string | null;
  transcript: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  ringbaCost: number | null;
  adCost: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data: PrayerCallRecord[]): string {
  if (data.length === 0) {
    return 'No data found';
  }

  // Get headers from first record
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');

  // Convert each row to CSV
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header as keyof PrayerCallRecord];

      // Handle null/undefined
      if (value === null || value === undefined) {
        return '';
      }

      // Escape quotes and wrap in quotes if contains comma or newline
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }

      return stringValue;
    }).join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * Convert data to JSON format (pretty printed)
 */
function convertToJSON(data: PrayerCallRecord[]): string {
  return JSON.stringify(data, null, 2);
}

async function main() {
  try {
    console.log('\n=== Filtering Prayer Transcripts ===\n');
    console.log('Date Range: February 1 - February 28, 2026');
    console.log('Filter: Transcript contains "prayer" (case-insensitive)');
    console.log('Table: ringba_call_data\n');

    const sql = createNeonClient();

    // Check if table exists
    console.log('[1/4] Checking if ringba_call_data table exists...');
    try {
      const tableCheck = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'ringba_call_data'
        ) as exists
      `;

      const exists = tableCheck[0]?.exists === true || tableCheck[0]?.exists === 't';

      if (!exists) {
        console.error('\n❌ Error: Table "ringba_call_data" does not exist in the database.');
        console.error('\nPlease ensure the table is created first.');
        console.error('You may need to run: npx tsx src/database/run-schema-ringba-calls-data.ts\n');
        process.exit(1);
      }

      console.log('✓ Table exists');
    } catch (error) {
      console.warn('  Warning: Could not verify table existence. Proceeding anyway...');
    }

    // Query for records with "prayer" in transcript, filtered by date
    console.log('[2/4] Querying database...');

    const startDate = '2026-02-01';
    const endDate = '2026-02-28';

    const results = await sql`
      SELECT
        id, caller_id, ringba_id, "campaignName", "publisherName", "targetName",
        call_duration, call_timestamp, "recordingUrl", transcript,
        "firstName", "lastName", email, city, state,
        "ringbaCost", "adCost", created_at, updated_at
      FROM ringba_call_data
      WHERE
        transcript IS NOT NULL
        AND LOWER(transcript) LIKE '%prayer%'
        AND call_timestamp >= ${startDate}
        AND call_timestamp <= ${endDate + ' 23:59:59'}
      ORDER BY call_timestamp DESC
    ` as unknown as PrayerCallRecord[];

    console.log(`✓ Found ${results.length} matching records\n`);

    if (results.length === 0) {
      console.log('No records found matching the criteria.');
      console.log('\nSearch criteria:');
      console.log('  - Date range: Feb 1 - Feb 28, 2026');
      console.log('  - Transcript contains: "prayer" (case-insensitive)');
      console.log('  - Transcript is not null\n');
      process.exit(0);
    }

    // Display summary
    console.log('[3/4] Summary of results:');
    console.log(`  Total records: ${results.length}`);
    console.log(`  Date range: ${startDate} to ${endDate}`);

    // Show first few examples
    console.log('\n  Sample records:');
    results.slice(0, 3).forEach((record, index) => {
      console.log(`    ${index + 1}. ID: ${record.id}, Timestamp: ${record.call_timestamp}`);
      const transcriptPreview = record.transcript
        ? record.transcript.substring(0, 60) + '...'
        : 'N/A';
      console.log(`       Transcript preview: ${transcriptPreview}`);
    });

    // Save results to files
    console.log('\n[4/4] Saving results...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const csvFilename = `prayer-transcripts-${timestamp}.csv`;
    const jsonFilename = `prayer-transcripts-${timestamp}.json`;

    const csvPath = join(process.cwd(), csvFilename);
    const jsonPath = join(process.cwd(), jsonFilename);

    // Save CSV
    const csvContent = convertToCSV(results);
    writeFileSync(csvPath, csvContent, 'utf-8');
    console.log(`✓ CSV saved to: ${csvPath}`);

    // Save JSON
    const jsonContent = convertToJSON(results);
    writeFileSync(jsonPath, jsonContent, 'utf-8');
    console.log(`✓ JSON saved to: ${jsonPath}`);

    console.log('\n=== Export Complete ===\n');
    console.log(`Total records exported: ${results.length}`);
    console.log('Files created:');
    console.log(`  - ${csvFilename}`);
    console.log(`  - ${jsonFilename}\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();
