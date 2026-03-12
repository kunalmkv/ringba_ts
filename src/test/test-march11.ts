#!/usr/bin/env node
import dotenv from 'dotenv';
import { join } from 'path';

// Services
import { scrapeElocalDataWithDateRange } from '../services/fetch-elocal-calls.service.js';
import { syncRingbaOriginalPayout } from '../services/ringba-original-sync.service.js';
import { syncCostToRingba } from '../services/ringba-cost-sync.service.js';

// Load env
dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

const config = {
  elocalApiKey: process.env.ELOCAL_API_KEY,
  neonDatabaseUrl: process.env.NEON_DATABASE_URL,
};

// Target date: March 11, 2026
const march11DateRange = {
  startDate: new Date('2026-03-11T00:00:00Z'),
  endDate: new Date('2026-03-11T23:59:59Z'),
  startDateFormatted: '03/11/2026',
  endDateFormatted: '03/11/2026',
  startDateURL: '2026-03-11',
  endDateURL: '2026-03-11'
};

const ringbaConfig = {
  ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
  ringbaApiToken: process.env.RINGBA_API_TOKEN,
  neonDatabaseUrl: process.env.NEON_DATABASE_URL,
  dateRange: march11DateRange,
  daysDown: undefined
};

async function main() {
  console.log('=== Testing Services for March 11, 2026 ===\n');

  try {
    console.log('[1/4] Running Fetch eLocal Calls (STATIC)...');
    const elocalStatic = await scrapeElocalDataWithDateRange(config)(march11DateRange)('custom')('STATIC')();
    console.log('STATIC Results:', elocalStatic.summary, elocalStatic.databaseResults);

    console.log('\n[2/4] Running Fetch eLocal Calls (API)...');
    const elocalApi = await scrapeElocalDataWithDateRange(config)(march11DateRange)('custom')('API')();
    console.log('API Results:', elocalApi.summary, elocalApi.databaseResults);

    console.log('\n[3/4] Running Ringba Original Sync...');
    const originalSync = await syncRingbaOriginalPayout(ringbaConfig, march11DateRange);
    console.log('Original Sync Results:', originalSync);

    console.log('\n[4/4] Running Ringba Cost Sync...');
    const costSync = await syncCostToRingba(ringbaConfig as any, march11DateRange);
    console.log('Cost Sync Results:', costSync);

    console.log('\n=== All services completed successfully! ===\n');
  } catch(e: any) {
    console.error('Error during testing:', e);
    process.exit(1);
  }
}

main();
