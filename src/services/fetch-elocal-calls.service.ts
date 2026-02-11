/**
 * Fetch eLocal Calls Service
 *
 * Fetches call data from eLocal API v2 for a given date range, processes and
 * deduplicates, and persists to Neon DB. Supports historical, current-day,
 * and custom date ranges; STATIC and API categories.
 */
import { createNeonDbOps } from '../database/neon-operations.js';
import { getElocalCalls } from '../http/elocal-client.js';
import { processAdjustmentDetails, processCampaignCalls, createSession } from '../utils/helpers.js';
import {
  getPast10DaysRange,
  getCurrentDayRange,
  getCurrentDayRangeWithTimezone,
  getDateRangeDescription,
  getServiceScheduleInfo,
} from '../utils/date-utils.js';
import type {
  Config,
  DateRange,
  ServiceType,
  Category,
  ScrapingResult,
  ElocalCall,
  RawApiCall,
} from '../types/index.js';

/**
 * Base workflow: fetch eLocal calls for a date range (config + dateRange + serviceType + category)
 */
export const scrapeElocalDataWithDateRange =
  (config: Config) =>
  (dateRange: DateRange) =>
  (serviceType: ServiceType = 'unknown') =>
  (category: Category = 'STATIC') =>
    async (): Promise<ScrapingResult> => {
      const session = createSession();
      session.sessionId = `${serviceType}_${category.toLowerCase()}_${session.sessionId}_${dateRange.startDateFormatted.replace(/\//g, '-')}_to_${dateRange.endDateFormatted.replace(/\//g, '-')}`;

      const db = createNeonDbOps();

      const campaignUuid =
        category === 'API' ? '4534924c-f52b-4124-981b-9d2670b2af3e' : 'dce224a6-f813-4cab-a8c6-972c5a1520ab';
      const includeAdjustments = category === 'STATIC';

      try {
        console.log(`[INFO] Starting scraping session: ${session.sessionId}`);
        console.log(`[INFO] Category: ${category}, Campaign UUID: ${campaignUuid}`);
        console.log(`[INFO] Date range: ${getDateRangeDescription(dateRange)}`);

        try {
          await db.createSession(session);
        } catch (error) {
          console.warn('[WARN] Failed to create session in database:', (error as Error).message);
        }

        try {
          console.log(`[INFO] Running ${category} category via eLocal API v2...`);

          const apiKey = config.elocalApiKey || process.env.ELOCAL_API_KEY;
          if (!apiKey) {
            throw new Error('ELOCAL_API_KEY is not configured');
          }

          const apiResultEither = await getElocalCalls(apiKey, campaignUuid)(dateRange)();

          if (apiResultEither._tag === 'Left') {
            throw apiResultEither.left;
          }

          const apiData = apiResultEither.right;
          const rawCalls = apiData.calls;

          const mappedCalls: ElocalCall[] = rawCalls.map((call: RawApiCall) => ({
            callerId: call.caller_phone || call.callerPhoneNumber || call.callerId || call.phone || '',
            dateOfCall: call.call_date || call.callStartTime || call.date || '',
            elocalPayout: call.final_payout !== undefined ? call.final_payout : call.payout ?? 0,
            ringbaOriginalPayout: call.original_payout !== undefined && call.original_payout !== null ? call.original_payout : null,
            ringbaOriginalRevenue: call.original_revenue !== undefined && call.original_revenue !== null ? call.original_revenue : null,
            category: category,
            cityState: call.cityState || null,
            zipCode: call.zip_code || call.zipCode || null,
            totalDuration: call.call_duration ?? call.duration ?? call.callDuration ?? null,
            adjustmentTime: call.adjustment_date ?? undefined,
            adjustmentAmount: call.adjustment_amount !== undefined && call.adjustment_amount !== null ? call.adjustment_amount : undefined,
          }));

          const rawAdjustments: any[] = [];

          console.log(`[INFO] Fetched ${mappedCalls.length} calls from API`);

          const processedAdjustments = includeAdjustments ? processAdjustmentDetails(rawAdjustments) : [];
          const processedCalls = processCampaignCalls(mappedCalls);

          processedCalls.forEach((call) => {
            if (!call.category) {
              call.category = category;
            }
          });

          console.log(`[INFO] Processed ${processedCalls.length} campaign calls (category: ${category})`);
          if (processedCalls.length > 0) {
            console.log(`[INFO] Sample call category: ${processedCalls[0].category}`);
          }
          if (includeAdjustments) {
            console.log(`[INFO] Parsed ${processedAdjustments.length} adjustment rows`);
          }

          console.log('[INFO] Saving data to database...');
          console.log(`[INFO] ${category} category: Using eLocal data only (no Ringba lookups)`);
          console.log(`[INFO] Note: eLocal dates are saved as-is (no timezone conversion)`);

          if (includeAdjustments && processedAdjustments.length > 0) {
            try {
              const adjustmentsResult = await db.insertAdjustmentsBatch(processedAdjustments);
              console.log(
                `[SUCCESS] Saved ${adjustmentsResult.inserted || 0} adjustment details to adjustment_details table (${adjustmentsResult.skipped || 0} skipped as duplicates)`
              );
            } catch (error) {
              console.warn(
                '[WARN] Failed to save adjustment details to adjustment_details table:',
                (error as Error).message
              );
            }
          }

          let callsInserted = 0;
          let callsUpdated = 0;

          let callsMerged = processedCalls;

          if (!includeAdjustments) {
            callsMerged = processedCalls.map((c) => ({
              ...c,
              category: c.category || category,
            }));
            console.log(`[INFO] API category: Prepared ${callsMerged.length} calls for database (category: ${category})`);
          }

          if (callsMerged.length > 0) {
            const categoryCounts = callsMerged.reduce(
              (acc, c) => {
                acc[c.category || 'null'] = (acc[c.category || 'null'] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            );
            console.log(`[INFO] About to save ${callsMerged.length} calls with categories:`, categoryCounts);

            const callsResult = await db.insertCallsBatch(callsMerged);
            callsInserted = callsResult.inserted || 0;
            callsUpdated = callsResult.updated || 0;
            console.log(
              `[SUCCESS] Saved ${callsInserted} new campaign calls (category: ${category}), updated ${callsUpdated} existing`
            );
          } else {
            console.log(`[WARN] No calls to save for category: ${category}`);
          }

          const adjustmentsApplied = callsMerged.filter((c) => c.adjustmentAmount != null && c.adjustmentAmount !== 0).length;

          try {
            await db.updateSession(session.sessionId)({
              completed_at: new Date().toISOString(),
              status: 'completed',
              calls_scraped: processedCalls.length,
              adjustments_scraped: adjustmentsApplied,
            });
          } catch (error) {
            console.warn('[WARN] Failed to update session:', (error as Error).message);
          }

          const summary = {
            totalCalls: processedCalls.length,
            totalPayout: processedCalls.reduce((sum, call) => sum + (call.elocalPayout || 0), 0),
            uniqueCallers: new Set(processedCalls.map((call) => call.callerId)).size,
            adjustmentsApplied,
          };

          return {
            sessionId: session.sessionId,
            dateRange: getDateRangeDescription(dateRange),
            summary,
            calls: processedCalls,
            downloadedFile: { file: 'skipped', size: 0 },
            databaseResults: { callsInserted, callsUpdated },
          };
        } catch (apiError) {
          throw new Error(`eLocal API flow failed: ${(apiError as Error).message}`);
        }
      } catch (error) {
        console.error('[ERROR] Scraping failed:', (error as Error).message);

        try {
          await db.updateSession(session.sessionId)({
            completed_at: new Date().toISOString(),
            status: 'failed',
            error_message: (error as Error).message,
          });
        } catch (updateError) {
          console.warn('[WARN] Failed to update session with error:', (updateError as Error).message);
        }

        throw error;
      }
    };

/**
 * Historical data service (past 10 days, excluding today) - STATIC category
 */
export const scrapeHistoricalData = async (config: Config): Promise<ScrapingResult> => {
  const dateRange = getPast10DaysRange();
  console.log(`[INFO] Historical Data Service (STATIC): ${getDateRangeDescription(dateRange)}`);
  return await scrapeElocalDataWithDateRange(config)(dateRange)('historical')('STATIC')();
};

/**
 * Current day service (current day only) - STATIC category
 */
export const scrapeCurrentDayData = async (
  config: Config,
  dateRange: DateRange | null = null
): Promise<ScrapingResult> => {
  const finalDateRange = dateRange || getCurrentDayRangeWithTimezone();
  console.log(`[INFO] Current Day Service (STATIC): ${getDateRangeDescription(finalDateRange)}`);
  return await scrapeElocalDataWithDateRange(config)(finalDateRange)('current')('STATIC')();
};

/**
 * Historical data service for API category (past 10 days, excluding today)
 */
export const scrapeHistoricalDataAPI = async (config: Config): Promise<ScrapingResult> => {
  const dateRange = getPast10DaysRange();
  console.log(`[INFO] Historical Data Service (API): ${getDateRangeDescription(dateRange)}`);
  return await scrapeElocalDataWithDateRange(config)(dateRange)('historical')('API')();
};

/**
 * Current day service for API category (current day only)
 */
export const scrapeCurrentDayDataAPI = async (
  config: Config,
  dateRange: DateRange | null = null
): Promise<ScrapingResult> => {
  const finalDateRange = dateRange || getCurrentDayRangeWithTimezone();
  console.log(`[INFO] Current Day Service (API): ${getDateRangeDescription(finalDateRange)}`);
  return await scrapeElocalDataWithDateRange(config)(finalDateRange)('current')('API')();
};

/**
 * Get service info
 */
export const getServiceInfo = (serviceType: string) => {
  return getServiceScheduleInfo(serviceType);
};

/**
 * Export all services
 */
export const elocalServices = {
  scrapeHistoricalData,
  scrapeCurrentDayData,
  scrapeHistoricalDataAPI,
  scrapeCurrentDayDataAPI,
  getServiceInfo,
  getPast10DaysRange,
  getCurrentDayRange,
};
