// Runner script for Ringba Cost Sync
// Syncs eLocal payment changes to Ringba dashboard

import dotenv from 'dotenv';
import { syncCostToRingba } from '../services/ringba-cost-sync.service.js';
import type { RingbaCostSyncConfig, RingbaCostSyncSummary } from '../types/ringba-cost-sync.js';
import type { DateRange, Category } from '../types/index.js';

// Load environment variables
dotenv.config();

/**
 * Parse command line arguments
 * Format: npm run sync:cost -- <startDate> <endDate> [category]
 * Example: npm run sync:cost -- 2026-02-03 2026-02-03
 * Example: npm run sync:cost -- 2026-02-01 2026-02-05 STATIC
 * Example: npm run sync:cost -- 2026-02-01 2026-02-05 API
 */
const parseArgs = (): { startDate: string; endDate: string; category: Category | null } => {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npm run sync:cost -- <startDate> <endDate> [category]');
    console.error('Example: npm run sync:cost -- 2026-02-03 2026-02-03');
    console.error('Example: npm run sync:cost -- 2026-02-01 2026-02-05 STATIC');
    console.error('Example: npm run sync:cost -- 2026-02-01 2026-02-05 API');
    process.exit(1);
  }

  const startDate = args[0];
  const endDate = args[1];
  const categoryArg = args[2]?.toUpperCase();
  
  let category: Category | null = null;
  if (categoryArg) {
    if (categoryArg !== 'STATIC' && categoryArg !== 'API') {
      console.error(`Invalid category: ${categoryArg}. Must be STATIC or API`);
      process.exit(1);
    }
    category = categoryArg as Category;
  }

  // Validate dates
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    console.error('Invalid date format. Use YYYY-MM-DD');
    process.exit(1);
  }

  return { startDate, endDate, category };
};

/**
 * Format date for display
 */
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format date for URL
 */
const formatDateURL = (dateStr: string): string => {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}%2F${day}%2F${year}`;
};

/**
 * Main runner function
 */
const run = async (): Promise<void> => {
  try {
    const { startDate, endDate, category } = parseArgs();

    // Construct config
    const config: RingbaCostSyncConfig = {
      ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
      ringbaApiToken: process.env.RINGBA_API_TOKEN,
      neonDatabaseUrl: process.env.NEON_DATABASE_URL,
    };

    // Validate config
    if (!config.ringbaAccountId || !config.ringbaApiToken) {
      throw new Error('Missing required environment variables: RINGBA_ACCOUNT_ID, RINGBA_API_TOKEN');
    }

    if (!config.neonDatabaseUrl) {
      throw new Error('Missing required environment variable: NEON_DATABASE_URL');
    }

    // Construct date range
    const dateRange: DateRange = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      startDateFormatted: formatDate(startDate),
      endDateFormatted: formatDate(endDate),
      startDateURL: formatDateURL(startDate),
      endDateURL: formatDateURL(endDate),
    };

    console.log('');
    console.log('Starting Ringba Cost Sync...');
    console.log(`Date Range: ${dateRange.startDateFormatted} to ${dateRange.endDateFormatted}`);
    if (category) {
      console.log(`Category: ${category}`);
    }
    console.log('');

    // Run sync
    const summary: RingbaCostSyncSummary = await syncCostToRingba(config, dateRange, category);

    console.log('');
    console.log('Sync completed successfully!');
    console.log('');

    // Exit with appropriate code
    if (summary.failed > 0) {
      console.error(`WARNING: ${summary.failed} calls failed to update`);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('Fatal error:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
};

// Run the script
run();
