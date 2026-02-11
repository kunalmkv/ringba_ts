#!/usr/bin/env node

/**
 * Sequential Scheduler Runner
 * 
 * Starts the sequential scheduler that runs services ONE BY ONE (not in parallel)
 * to save computational resources on the server.
 * 
 * The scheduler will run different services at scheduled times:
 * - Early Morning (12:00 AM): eLocal data fetch
 * - 3:04 AM: Ringba original sync
 * - 6:10 AM: Cost sync (current day)
 * - 9:00 PM: Evening comprehensive sync
 * - 11:58 PM: Historical data collection
 * 
 * Each schedule runs its services SEQUENTIALLY:
 * 1. First service runs completely
 * 2. Second service starts (and so on)
 * 3. Never runs multiple services at the same time
 * 
 * Usage:
 *   npm run scheduler
 *   npm run scheduler:sequential
 * 
 * To stop the scheduler, press Ctrl+C
 */

import dotenv from 'dotenv';
import { SequentialScheduler } from '../services/sequential-scheduler.service.js';
import { DEFAULT_SCHEDULER_CONFIG } from '../config/scheduler-config.js';

// Load environment variables
dotenv.config();

/**
 * Get IST time string
 */
const getISTTime = (): string => {
  const now = new Date();
  return now.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

/**
 * Handle graceful shutdown
 */
const setupGracefulShutdown = (scheduler: SequentialScheduler): void => {
  const shutdown = async () => {
    console.log('');
    console.log('[INFO] Shutting down scheduler...');
    await scheduler.stop();
    
    // Display final statistics
    console.log('');
    console.log('='.repeat(70));
    console.log('Final Statistics');
    console.log('='.repeat(70));
    
    const stats = scheduler.getStats();
    Object.entries(stats).forEach(([name, stat]) => {
      console.log(`${name}:`);
      console.log(`  Total Runs: ${stat.totalRuns}`);
      console.log(`  Successful: ${stat.successfulRuns}`);
      console.log(`  Failed: ${stat.failedRuns}`);
      console.log(`  Average Duration: ${stat.averageDuration.toFixed(2)}s`);
      console.log(`  Last Run: ${stat.lastRun || 'Never'}`);
      console.log('');
    });
    
    console.log('='.repeat(70));
    console.log('Scheduler shutdown complete');
    console.log('='.repeat(70));
    
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

/**
 * Main execution
 */
const main = async (): Promise<void> => {
  console.log('');
  console.log('='.repeat(70));
  console.log('Sequential Scheduler');
  console.log('='.repeat(70));
  console.log('');
  console.log('This scheduler runs services ONE BY ONE (sequentially) instead');
  console.log('of all at once to save computational resources on the server.');
  console.log('');
  console.log('Key Features:');
  console.log('  ✓ Sequential execution (one service at a time)');
  console.log('  ✓ Comprehensive scheduling (all services covered)');
  console.log('  ✓ Resource-efficient (no parallel execution)');
  console.log('  ✓ Automatic retries on failure');
  console.log('  ✓ Detailed logging and statistics');
  console.log('');
  console.log('='.repeat(70));
  console.log('');
  
  // Check for required environment variables
  const requiredVars = [
    'NEON_DATABASE_URL',
    'RINGBA_ACCOUNT_ID',
    'RINGBA_API_TOKEN',
  ];
  
  const missingVars = requiredVars.filter(env => !process.env[env]);
  
  if (missingVars.length > 0) {
    console.error('[ERROR] Missing required environment variables:');
    missingVars.forEach(env => console.error(`  - ${env}`));
    console.error('');
    console.error('Please set these variables in your .env file');
    process.exit(1);
  }
  
  // Create scheduler with default configuration
  const scheduler = new SequentialScheduler(DEFAULT_SCHEDULER_CONFIG);
  
  // Setup graceful shutdown
  setupGracefulShutdown(scheduler);
  
  // Start the scheduler
  try {
    await scheduler.start();
    
    console.log('');
    console.log('='.repeat(70));
    console.log('Scheduler Status');
    console.log('='.repeat(70));
    console.log(`Current Time (IST): ${getISTTime()}`);
    console.log('');
    console.log('Active Schedules:');
    
    DEFAULT_SCHEDULER_CONFIG.schedules.filter(s => s.enabled).forEach((schedule, index) => {
      const serviceCount = schedule.services.filter(s => s.enabled).length;
      console.log(`  ${index + 1}. ${schedule.name}`);
      console.log(`     Time: ${schedule.time} IST`);
      console.log(`     Services: ${serviceCount} (sequential execution)`);
    });
    
    console.log('');
    console.log('The scheduler is running. Services will execute automatically');
    console.log('at their scheduled times. Press Ctrl+C to stop.');
    console.log('='.repeat(70));
    console.log('');
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('Fatal Error');
    console.error('='.repeat(70));
    console.error(error);
    console.error('='.repeat(70));
    process.exit(1);
  }
};

// Run if executed directly
main();
