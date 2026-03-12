#!/usr/bin/env node
/**
 * Backfill dialedNumber column in ringba_call_data table from CSV file
 *
 * CSV columns:
 * - "Inbound Call ID" -> matches ringba_id in database
 * - "Number" -> the dialed number to backfill
 *
 * Usage:
 *   npx tsx src/scripts/backfill-dialed-number.ts
 */

import { createNeonClient } from '../config/database.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

interface CSVRow {
  'Inbound Call ID': string;
  'Number': string;
  [key: string]: string;
}

/**
 * Parse CSV file (handles quoted fields and newlines within quotes)
 */
function parseCSV(content: string): CSVRow[] {
  // Remove BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  // Parse headers
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  console.log('CSV Headers:', headers);

  // Parse data rows
  const rows: CSVRow[] = [];
  let i = 1;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    // Handle multi-line records (quotes spanning lines)
    let fullLine = line;
    let quoteCount = (line.match(/"/g) || []).length;

    // If odd number of quotes, the field spans multiple lines
    while (quoteCount % 2 !== 0 && i + 1 < lines.length) {
      i++;
      fullLine += '\n' + lines[i];
      quoteCount = (fullLine.match(/"/g) || []).length;
    }

    const values = parseCSVLine(fullLine);

    if (values.length > 0 && values[0]) {
      const row: CSVRow = {} as CSVRow;
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    i++;
  }

  return rows;
}

/**
 * Parse a single CSV line (handles quoted fields with commas)
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Push last field
  values.push(current);

  return values;
}

async function main() {
  try {
    console.log('\n=== Backfilling dialedNumber Column ===\n');

    const sql = createNeonClient();
    const csvPath = join(process.cwd(), 'dialed.csv');

    // Step 1: Check if column exists
    console.log('[1/6] Checking table structure...');

    const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'ringba_call_data'
    `;

    const columnNames = columns.map((c: any) => c.column_name);
    console.log(`✓ Found ${columnNames.length} columns in ringba_call_data`);

    // Check if dailedNumber or dialedNumber exists
    const hasDialedColumn = columnNames.includes('dialedNumber');
    const hasDailedColumn = columnNames.includes('dailedNumber'); // typo version

    let targetColumn = 'dialedNumber';

    if (hasDailedColumn && !hasDialedColumn) {
      console.log('  Note: Found column "dailedNumber" (with typo). Using this column.');
      targetColumn = 'dailedNumber';
    } else if (!hasDialedColumn && !hasDailedColumn) {
      console.log('  Column does not exist. Creating "dialedNumber" column...');
      await sql`
        ALTER TABLE ringba_call_data
        ADD COLUMN IF NOT EXISTS "dialedNumber" VARCHAR(50)
      `;
      console.log('  ✓ Column created');
    } else {
      console.log(`  ✓ Using column "${targetColumn}"`);
    }

    // Step 2: Read CSV file
    console.log('\n[2/6] Reading CSV file...');
    console.log(`  Path: ${csvPath}`);

    const csvContent = readFileSync(csvPath, 'utf-8');
    const csvRows = parseCSV(csvContent);

    console.log(`✓ Loaded ${csvRows.length} rows from CSV`);

    // Step 3: Validate CSV data
    console.log('\n[3/6] Validating CSV data...');

    const validRows = csvRows.filter(row => {
      return row['Inbound Call ID'] && row['Inbound Call ID'].trim() !== '';
    });

    console.log(`✓ Found ${validRows.length} valid rows with Inbound Call ID`);

    // Count rows with Number field
    const rowsWithNumber = validRows.filter(row =>
      row['Number'] && row['Number'].trim() !== ''
    );
    console.log(`  Rows with Number field: ${rowsWithNumber.length}`);

    // Step 4: Check matching records in database
    console.log('\n[4/6] Checking database matches...');

    const sampleIds = validRows.slice(0, 5).map(r => r['Inbound Call ID']);
    console.log(`  Sample Inbound Call IDs: ${sampleIds.join(', ').substring(0, 100)}...`);

    const totalRecords = await sql`
      SELECT COUNT(*)::int as count FROM ringba_call_data
    `;
    console.log(`  Total records in database: ${totalRecords[0].count}`);

    // Step 5: Perform backfill
    console.log('\n[5/6] Starting backfill...');
    console.log(`  Target column: ${targetColumn}`);
    console.log(`  Date filter: February 2026 only`);

    const startDate = '2026-02-01';
    const endDate = '2026-02-28 23:59:59';

    let updated = 0;
    let notFound = 0;
    let alreadyFilled = 0;
    let notInDateRange = 0;
    let errors = 0;
    const batchSize = 100;

    for (let i = 0; i < rowsWithNumber.length; i++) {
      const row = rowsWithNumber[i];
      const inboundCallId = row['Inbound Call ID'].trim();
      const dialedNumber = row['Number'].trim();

      try {
        // Check if record exists and if dialedNumber is already set (with February date filter)
        let existing;
        if (targetColumn === 'dialedNumber') {
          existing = await sql`
            SELECT id, "dialedNumber" as dialed_number, call_timestamp
            FROM ringba_call_data
            WHERE ringba_id = ${inboundCallId}
              AND call_timestamp >= ${startDate}
              AND call_timestamp <= ${endDate}
            LIMIT 1
          `;
        } else {
          existing = await sql`
            SELECT id, "dailedNumber" as dialed_number, call_timestamp
            FROM ringba_call_data
            WHERE ringba_id = ${inboundCallId}
              AND call_timestamp >= ${startDate}
              AND call_timestamp <= ${endDate}
            LIMIT 1
          `;
        }

        if (existing.length === 0) {
          // Check if record exists but not in date range
          const anyRecord = targetColumn === 'dialedNumber'
            ? await sql`SELECT id FROM ringba_call_data WHERE ringba_id = ${inboundCallId} LIMIT 1`
            : await sql`SELECT id FROM ringba_call_data WHERE ringba_id = ${inboundCallId} LIMIT 1`;

          if (anyRecord.length > 0) {
            notInDateRange++;
          } else {
            notFound++;
          }
          continue;
        }

        const currentValue = existing[0].dialed_number;

        // Skip if already filled (unless it's different)
        if (currentValue && currentValue.trim() !== '' && currentValue === dialedNumber) {
          alreadyFilled++;
          continue;
        }

        // Update the record using dynamic column name
        if (targetColumn === 'dialedNumber') {
          await sql`
            UPDATE ringba_call_data
            SET "dialedNumber" = ${dialedNumber}, updated_at = NOW()
            WHERE ringba_id = ${inboundCallId}
          `;
        } else {
          // For dailedNumber (typo version)
          await sql`
            UPDATE ringba_call_data
            SET "dailedNumber" = ${dialedNumber}, updated_at = NOW()
            WHERE ringba_id = ${inboundCallId}
          `;
        }

        updated++;

        // Progress indicator
        if ((i + 1) % batchSize === 0 || i === rowsWithNumber.length - 1) {
          const progress = ((i + 1) / rowsWithNumber.length * 100).toFixed(1);
          console.log(`  Progress: ${i + 1}/${rowsWithNumber.length} (${progress}%) - Updated: ${updated}, Already Filled: ${alreadyFilled}, Not in Feb: ${notInDateRange}, Not Found: ${notFound}`);
        }

      } catch (error) {
        errors++;
        if (errors <= 5) {
          console.error(`  Error processing row ${i + 1}:`, error instanceof Error ? error.message : error);
        }
      }
    }

    // Step 6: Summary
    console.log('\n[6/6] Backfill Summary:');
    console.log('='.repeat(60));
    console.log(`Date Range: February 1-28, 2026`);
    console.log(`Total CSV rows processed: ${rowsWithNumber.length}`);
    console.log(`Records updated: ${updated}`);
    console.log(`Records already filled: ${alreadyFilled}`);
    console.log(`Records not in date range: ${notInDateRange}`);
    console.log(`Records not found in DB: ${notFound}`);
    console.log(`Errors: ${errors}`);
    console.log('='.repeat(60));

    // Verification
    console.log('\n✓ Verification:');
    let filledCount;
    if (targetColumn === 'dialedNumber') {
      filledCount = await sql`
        SELECT COUNT(*)::int as count
        FROM ringba_call_data
        WHERE "dialedNumber" IS NOT NULL
          AND "dialedNumber" != ''
      `;
    } else {
      filledCount = await sql`
        SELECT COUNT(*)::int as count
        FROM ringba_call_data
        WHERE "dailedNumber" IS NOT NULL
          AND "dailedNumber" != ''
      `;
    }
    console.log(`  Records with ${targetColumn} filled: ${filledCount[0].count}`);

    console.log('\n✓ Backfill completed successfully!\n');
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
