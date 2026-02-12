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

        // eLocal API v2 expects dates as yyyy-MM-dd (per API error message)
        const toYYYYMMDD = (value: string): string => {
          const decoded = decodeURIComponent(value);
          // Already yyyy-MM-dd
          if (/^\d{4}-\d{2}-\d{2}$/.test(decoded)) return decoded;
          // MM/DD/YYYY or MM%2FDD%2FYYYY
          const parts = decoded.split('/');
          if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
            const y = parts[2];
            const m = parts[0].padStart(2, '0');
            const d = parts[1].padStart(2, '0');
            return `${y}-${m}-${d}`;
          }
          throw new Error(`Unsupported date format for eLocal API: ${value}`);
        };

        const startDateAPI = toYYYYMMDD(dateRange.startDateURL);
        url.searchParams.set('start_date', startDateAPI);

        // Extend end_date by one day for inclusive fetching (API does not include end_date day)
        const endDecoded = decodeURIComponent(dateRange.endDateURL);
        let endDateObj: Date;
        if (/^\d{4}-\d{2}-\d{2}$/.test(endDecoded)) {
          const [y, m, d] = endDecoded.split('-').map(Number);
          endDateObj = new Date(y, m - 1, d, 0, 0, 0, 0);
        } else {
          const endParts = endDecoded.split('/');
          endDateObj = new Date(
            parseInt(endParts[2], 10),
            parseInt(endParts[0], 10) - 1,
            parseInt(endParts[1], 10),
            0, 0, 0, 0
          );
        }
        endDateObj.setDate(endDateObj.getDate() + 1);
        const extendedEndDateAPI =
          `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;
        url.searchParams.set('end_date', extendedEndDateAPI);
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
