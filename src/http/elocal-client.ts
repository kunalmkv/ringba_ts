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

        // Add query parameters (API v2 expects MM/DD/YYYY via URL encoding)
        // startDateURL and endDateURL are already in MM%2FDD%2FYYYY format
        url.searchParams.append('start_date', dateRange.startDateURL);

        // IMPORTANT: Extend end_date by one day for inclusive fetching
        // eLocal API does not include calls on the end_date itself
        // Parse from MM%2FDD%2FYYYY format
        const endDateDecoded = decodeURIComponent(dateRange.endDateURL); // "MM/DD/YYYY"
        const endDateParts = endDateDecoded.split('/'); // ["MM", "DD", "YYYY"]
        const endDateObj = new Date(
          parseInt(endDateParts[2], 10),           // year
          parseInt(endDateParts[0], 10) - 1,       // month (0-indexed)
          parseInt(endDateParts[1], 10),           // day
          0, 0, 0, 0
        );
        endDateObj.setDate(endDateObj.getDate() + 1); // Add 1 day
        
        // Format back to MM/DD/YYYY
        const extendedMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
        const extendedDay = String(endDateObj.getDate()).padStart(2, '0');
        const extendedYear = endDateObj.getFullYear();
        const extendedEndDate = `${extendedMonth}%2F${extendedDay}%2F${extendedYear}`;

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
