#!/usr/bin/env node
import { syncCostToRingba } from '../services/ringba-cost-sync.service.js';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

async function main() {
  const accountId = process.env.RINGBA_ACCOUNT_ID;
  const apiToken = process.env.RINGBA_API_TOKEN;

  if (!accountId || !apiToken) {
    console.error('Missing RINGBA credentials in environment variables.');
    process.exit(1);
  }

  const ringbaConfig = {
    ringbaAccountId: accountId,
    ringbaApiToken: apiToken
  };

  const march12DateRange = {
    startDate: '2026-03-12',
    endDate: '2026-03-12',
    startDateFormatted: '03/12/2026',
    endDateFormatted: '03/12/2026'
  };

  console.log('=== Running Ringba Cost Sync for March 12, 2026 ===');

  try {
    const costSync = await syncCostToRingba(ringbaConfig, march12DateRange);
    console.log('Cost Sync Results:', costSync);
  } catch (error) {
    console.error('Error during Ringba Cost Sync:', error);
  }
}

main().catch(console.error);
