#!/usr/bin/env node
import dotenv from 'dotenv';
import { join } from 'path';
import {
  scrapeHistoricalData,
  scrapeCurrentDayData,
  scrapeHistoricalDataAPI,
  scrapeCurrentDayDataAPI,
} from '../services/fetch-elocal-calls.service.js';
import type { Config } from '../types/index.js';

// Load secrets from env file: .env then .env.neon (cwd)
dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

/**
 * Test runner for elocal scrapper service (TypeScript version)
 */
async function main() {
  const serviceType = process.argv[2] || 'current';

  const config: Config = {
    elocalApiKey: process.env.ELOCAL_API_KEY,
    neonDatabaseUrl: process.env.NEON_DATABASE_URL,
  };

  console.log('\n===========================================');
  console.log('Fetch eLocal Calls Service – Test');
  console.log('===========================================\n');
  console.log(`Service Type: ${serviceType}`);
  console.log(`Neon DB: ${config.neonDatabaseUrl ? '✓ Configured' : '✗ Not configured'}`);
  console.log(`eLocal API Key: ${config.elocalApiKey ? '✓ Configured' : '✗ Not configured'}`);
  console.log('\n');

  try {
    let result;

    switch (serviceType) {
      case 'historical':
        console.log('Running Historical Data Service (STATIC category)...\n');
        result = await scrapeHistoricalData(config);
        break;

      case 'current':
        console.log('Running Current Day Service (STATIC category)...\n');
        result = await scrapeCurrentDayData(config);
        break;

      case 'historical-api':
        console.log('Running Historical Data Service (API category)...\n');
        result = await scrapeHistoricalDataAPI(config);
        break;

      case 'current-api':
        console.log('Running Current Day Service (API category)...\n');
        result = await scrapeCurrentDayDataAPI(config);
        break;

      default:
        throw new Error(
          `Unknown service type: ${serviceType}. Use: historical, current, historical-api, or current-api`
        );
    }

    console.log('\n===========================================');
    console.log('Test Results');
    console.log('===========================================\n');
    console.log('Session ID:', result.sessionId);
    console.log('Date Range:', result.dateRange);
    console.log('\nSummary:');
    console.log('  Total Calls:', result.summary.totalCalls);
    console.log('  Total Payout: $' + result.summary.totalPayout.toFixed(2));
    console.log('  Unique Callers:', result.summary.uniqueCallers);
    console.log('  Adjustments Applied:', result.summary.adjustmentsApplied);
    console.log('\nDatabase Results:');
    console.log('  Calls Inserted:', result.databaseResults.callsInserted);
    console.log('  Calls Updated:', result.databaseResults.callsUpdated);
    console.log('\n✓ Test completed successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', (error as Error).message);
    console.error('\nStack trace:', (error as Error).stack);
    process.exit(1);
  }
}

main();
