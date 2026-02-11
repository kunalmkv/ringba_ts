#!/usr/bin/env node
/**
 * Smoke test: verifies service and date utils load and run without DB/API.
 * Run: npm run test:smoke (no .env.neon required)
 */
import {
  getPast10DaysRange,
  getCurrentDayRangeWithTimezone,
  getDateRangeDescription,
  getServiceScheduleInfo,
} from '../utils/date-utils.js';
import { scrapeElocalDataWithDateRange } from '../services/fetch-elocal-calls.service.js';

function main() {
  console.log('Smoke test: date utils and service exports...\n');

  const past = getPast10DaysRange();
  console.log('getPast10DaysRange:', getDateRangeDescription(past), `(${past.startDateURL} to ${past.endDateURL})`);

  const current = getCurrentDayRangeWithTimezone();
  console.log('getCurrentDayRangeWithTimezone:', getDateRangeDescription(current), `(${current.startDateURL})`);

  const info = getServiceScheduleInfo('current');
  console.log('getServiceScheduleInfo(current):', info.name);

  // Build the curried pipeline (do not invoke the inner async function – no DB/API)
  const config = { elocalApiKey: undefined, neonDatabaseUrl: undefined };
  const chain = scrapeElocalDataWithDateRange(config)(current)('current')('STATIC');
  if (typeof chain !== 'function') {
    console.error('Expected scrapeElocalDataWithDateRange(...) to return a function');
    process.exit(1);
  }
  console.log('scrapeElocalDataWithDateRange(config)(dateRange)(\'current\')(\'STATIC\') returns a function: OK');

  console.log('\n✓ Smoke test passed (no DB/API used).');
  process.exit(0);
}

main();
