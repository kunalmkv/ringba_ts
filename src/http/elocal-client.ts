import fetch from 'node-fetch';
import * as TE from 'fp-ts/lib/TaskEither.js';
import type { DateRange, ElocalApiResponse } from '../types/index.js';

const ELOCAL_BASE_URL = 'https://apis.elocal.com/affiliates/v2/campaign-results';

interface FetchOptions {
  sortBy?: string;
  sortOrder?: string;
}

/**
 * Fetch calls from eLocal API v2
 *
 * @param apiKey - eLocal API Key
 * @param uuid - Campaign UUID
 * @returns Function that accepts date range and options
 */
export const getElocalCalls =
  (apiKey: string, uuid: string) =>
  (dateRange: DateRange, options: FetchOptions = {}) =>
    TE.tryCatch(
      async (): Promise<ElocalApiResponse> => {
        if (!apiKey) throw new Error('eLocal API Key is required');
        if (!uuid) throw new Error('Campaign UUID is required');

        const url = new URL(`${ELOCAL_BASE_URL}/${uuid}/calls.json`);

        // Add query parameters (API v2 requires YYYY-MM-DD)
        url.searchParams.append('start_date', dateRange.startDateURL);

        // IMPORTANT: Extend end_date by one day for inclusive fetching
        // eLocal API does not include calls on the end_date itself
        const endDateParts = dateRange.endDateURL.split('-');
        const endDateObj = new Date(
          Date.UTC(
            parseInt(endDateParts[0], 10),
            parseInt(endDateParts[1], 10) - 1,
            parseInt(endDateParts[2], 10)
          )
        );
        endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);
        const extendedEndDate = endDateObj.toISOString().split('T')[0];

        url.searchParams.append('end_date', extendedEndDate);
        url.searchParams.append('sortBy', options.sortBy || 'callStartTime');
        url.searchParams.append('sortOrder', options.sortOrder || 'desc');

        console.log(`[eLocal] Fetching API: ${url.toString()}`);

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          throw new Error(`eLocal API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Handle different possible response formats
        const calls = Array.isArray(data) ? data : (data as any).calls || (data as any).results || [];

        return {
          calls,
          totalCalls: calls.length,
          raw: data,
        };
      },
      (error) => new Error(`Failed to fetch calls from eLocal API: ${(error as Error).message}`)
    );
