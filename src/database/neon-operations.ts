import { createNeonClient } from '../config/database.js';
import type {
  Session,
  SessionUpdate,
  ElocalCall,
  AdjustmentDetail,
  DatabaseCallRecord,
  InsertResult,
  Category,
  RingbaCallForSync,
} from '../types/index.js';

/**
 * Standardize phone number to E.164 format
 * @param raw - Raw phone number (e.g., "+1 (555) 123-4567" or "(555) 123-4567")
 * @returns Normalized phone number (e.g., "+15551234567") or null if invalid
 */
const toE164 = (raw: string | null | undefined): string | null => {
  if (!raw) return null;

  // Remove all non-digit characters
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  // If it already starts with +, assume it's mostly correct but clean non-digits
  if (String(raw).startsWith('+')) {
    return `+${digits}`;
  }

  // US/Canada numbers
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Default fallback for other lengths (prepend + if not present)
  return digits.length > 0 ? `+${digits}` : null;
};

export const createNeonDbOps = () => {
  const sql = createNeonClient();

  return {
    /**
     * Create a new scraping session
     */
    async createSession(session: Session): Promise<{ session_id: string }> {
      try {
        const result = await sql`
          INSERT INTO public.scraping_sessions (session_id, started_at, status)
          VALUES (${session.sessionId}, ${session.startedAt || new Date().toISOString()}, ${session.status || 'running'})
          ON CONFLICT (session_id) DO NOTHING
          RETURNING session_id
        `;
        const row = result[0] as { session_id: string } | undefined;
        return row || { session_id: session.sessionId };
      } catch (error) {
        console.error('[ERROR] Failed to create session:', error);
        throw error;
      }
    },

    /**
     * Update session with completion status
     * Neon serverless only supports tagged template; run one UPDATE per field.
     */
    updateSession: (sessionId: string) => async (updates: SessionUpdate) => {
      try {
        let updated = 0;
        if (updates.completed_at) {
          const result = await sql`
            UPDATE public.scraping_sessions SET completed_at = ${updates.completed_at}
            WHERE session_id = ${sessionId} RETURNING session_id
          `;
          if (result.length) updated = 1;
        }
        if (updates.status) {
          const result = await sql`
            UPDATE public.scraping_sessions SET status = ${updates.status}
            WHERE session_id = ${sessionId} RETURNING session_id
          `;
          if (result.length) updated = 1;
        }
        if (updates.calls_scraped !== undefined) {
          const result = await sql`
            UPDATE public.scraping_sessions SET calls_scraped = ${updates.calls_scraped}
            WHERE session_id = ${sessionId} RETURNING session_id
          `;
          if (result.length) updated = 1;
        }
        if (updates.adjustments_scraped !== undefined) {
          const result = await sql`
            UPDATE public.scraping_sessions SET adjustments_scraped = ${updates.adjustments_scraped}
            WHERE session_id = ${sessionId} RETURNING session_id
          `;
          if (result.length) updated = 1;
        }
        if (updates.error_message) {
          const result = await sql`
            UPDATE public.scraping_sessions SET error_message = ${updates.error_message}
            WHERE session_id = ${sessionId} RETURNING session_id
          `;
          if (result.length) updated = 1;
        }
        return { updated };
      } catch (error) {
        console.error('[ERROR] Failed to update session:', error);
        throw error;
      }
    },

    /**
     * Insert or update eLocal campaign calls in batch.
     * Timestamps from eLocal API are in EST — we convert to UTC (+5h standard / +4h DST)
     * so they align with existing UTC data in ringba_call_data.
     * Uses ON CONFLICT (caller_id, call_timestamp, category) UPSERT:
     *   - If a row already exists (e.g. from a CSV import), we fill in the eLocal-specific
     *     columns without overwriting downstream data (ringba_id, ringba_original_payout, etc.)
     */
    async insertCallsBatch(calls: ElocalCall[]): Promise<InsertResult> {
      if (!calls || calls.length === 0) {
        return { inserted: 0, updated: 0 };
      }

      /**
       * Convert an eLocal EST timestamp string to a UTC ISO string.
       * eLocal returns timestamps like "2026-03-11T12:30:28" (no tz suffix) in EST.
       * EST = UTC-5  (standard time, Nov–Mar)
       * EDT = UTC-4  (daylight saving, Mar–Nov)
       * We detect DST by checking if the date falls in the DST window for the US Eastern zone.
       */
      const estToUtc = (estStr: string | null | undefined): string | null => {
        if (!estStr) return null;
        // Only convert bare ISO strings (no tz offset already present)
        const match = estStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return estStr; // already has offset or different format — leave as-is

        const [, yr, mo, dy, hr, mn, sc] = match.map(Number);
        // Determine EST vs EDT offset.
        // DST in the US: second Sunday in March to first Sunday in November.
        // Simple but accurate check: create Date at UTC and see if it falls in DST window.
        const utcGuess = new Date(Date.UTC(yr, mo - 1, dy, hr, mn, sc));
        // Eastern Time: isDST when UTC offset is -4 (EDT). We check via Intl API.
        const easternOffset = (() => {
          try {
            // Get Eastern offset in minutes at the guessed UTC time
            const parts = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              timeZoneName: 'shortOffset',
            }).formatToParts(utcGuess);
            const tzPart = parts.find(p => p.type === 'timeZoneName');
            // e.g. "GMT-4" or "GMT-5"
            const offsetHrs = tzPart ? parseInt(tzPart.value.replace('GMT', '') || '-5', 10) : -5;
            return offsetHrs; // negative means behind UTC
          } catch {
            return -5; // fallback to EST
          }
        })();

        // Shift to UTC: subtract the eastern offset (which is negative, so add abs)
        const utcMs = Date.UTC(yr, mo - 1, dy, hr - easternOffset, mn, sc);
        return new Date(utcMs).toISOString().replace('Z', ''); // store without Z for Postgres TIMESTAMP WITHOUT TIME ZONE
      };

      try {
        let inserted = 0;
        let updated = 0;

        for (const call of calls) {
          const normalizedCallerId = toE164(call.callerId) || call.callerId;
          // Convert eLocal EST timestamp to UTC
          const utcTimestamp = estToUtc(call.dateOfCall);
          if (!utcTimestamp || !normalizedCallerId) {
            console.warn(`[DB SKIP] Missing caller_id or timestamp for call: ${call.callerId}`);
            continue;
          }

          const category = call.category || 'STATIC';

          // Fuzzy match: Look for an existing call from this caller within ±10 minutes
          const existing = await sql`
            SELECT id FROM public.ringba_call_data
            WHERE caller_id = ${normalizedCallerId}
              AND call_timestamp >= ${utcTimestamp}::timestamp - interval '10 minutes'
              AND call_timestamp <= ${utcTimestamp}::timestamp + interval '10 minutes'
            LIMIT 1
          `;

          if (existing.length > 0) {
            // Update the existing fuzzy-matched call
            // NOTE: ringba_revenue is the authoritative eLocal payout column — it always overwrites.
            await sql`
              UPDATE public.ringba_call_data
              SET
                category            = ${category},
                ringba_revenue      = ${call.elocalPayout ?? 0},
                call_duration       = COALESCE(public.ringba_call_data.call_duration, ${call.totalDuration || null}),
                adjustment_time     = COALESCE(${call.adjustmentTime || null}, public.ringba_call_data.adjustment_time),
                adjustment_amount   = COALESCE(${call.adjustmentAmount ?? 0}, public.ringba_call_data.adjustment_amount),
                unmatched           = ${call.unmatched || false},
                ringba_id           = COALESCE(public.ringba_call_data.ringba_id, ${call.ringbaInboundCallId || null}),
                ringba_original_payout = COALESCE(public.ringba_call_data.ringba_original_payout, ${call.ringbaOriginalPayout !== undefined ? call.ringbaOriginalPayout : null}),
                updated_at          = NOW()
              WHERE id = ${existing[0].id}
            `;
            updated++;
          } else {
            // No fuzzy match found, insert new (with ON CONFLICT fallback for exact matches)
            // NOTE: elocalPayout is written to ringba_revenue (the authoritative column).
            const result = await sql`
              INSERT INTO public.ringba_call_data (
                caller_id, call_timestamp, category,
                call_duration,
                adjustment_time, adjustment_amount, unmatched,
                ringba_id, ringba_original_payout, ringba_revenue,
                created_at, updated_at
              )
              VALUES (
                ${normalizedCallerId},
                ${utcTimestamp},
                ${category},
                ${call.totalDuration || null},
                ${call.adjustmentTime || null},
                ${call.adjustmentAmount ?? 0},
                ${call.unmatched || false},
                ${call.ringbaInboundCallId || null},
                ${call.ringbaOriginalPayout !== undefined ? call.ringbaOriginalPayout : null},
                ${call.elocalPayout ?? 0},
                NOW(), NOW()
              )
              ON CONFLICT (caller_id, call_timestamp)
              DO UPDATE SET
                category            = EXCLUDED.category,
                ringba_revenue      = EXCLUDED.ringba_revenue,
                call_duration       = COALESCE(public.ringba_call_data.call_duration, EXCLUDED.call_duration),
                adjustment_time     = COALESCE(EXCLUDED.adjustment_time, public.ringba_call_data.adjustment_time),
                adjustment_amount   = COALESCE(EXCLUDED.adjustment_amount, public.ringba_call_data.adjustment_amount),
                unmatched           = EXCLUDED.unmatched,
                ringba_id           = COALESCE(public.ringba_call_data.ringba_id, EXCLUDED.ringba_id),
                ringba_original_payout = COALESCE(public.ringba_call_data.ringba_original_payout, EXCLUDED.ringba_original_payout),
                updated_at          = NOW()
              RETURNING (xmax = 0) AS was_inserted
            `;
  
            if (result.length > 0) {
              if ((result[0] as any).was_inserted) inserted++;
              else updated++;
            }
          }
        }

        console.log(`[DB] UPSERT complete: ${inserted} inserted, ${updated} updated (matched existing rows)`);
        return { inserted, updated };
      } catch (error) {
        console.error('[ERROR] Failed to insert/update calls batch:', error);
        throw error;
      }
    },

    /**
     * Insert adjustment details in batch
     */
    async insertAdjustmentsBatch(
      adjustments: AdjustmentDetail[]
    ): Promise<{ inserted: number; skipped: number }> {
      if (!adjustments || adjustments.length === 0) {
        return { inserted: 0, skipped: 0 };
      }

      try {
        let inserted = 0;
        let skipped = 0;

        for (const adj of adjustments) {
          // Check if adjustment already exists
          const existing = await sql`
            SELECT id FROM public.adjustment_details
            WHERE call_sid = ${adj.callSid || ''}
              OR (
                caller_id = ${adj.callerId}
                AND time_of_call = ${adj.timeOfCall}
                AND adjustment_time = ${adj.adjustmentTime}
              )
            LIMIT 1
          `;

          if (existing.length > 0) {
            skipped++;
            continue;
          }

          // Insert new adjustment
          await sql`
            INSERT INTO public.adjustment_details (
              time_of_call, adjustment_time, campaign_phone, caller_id,
              duration, call_sid, amount, classification, created_at
            )
            VALUES (
              ${adj.timeOfCall},
              ${adj.adjustmentTime},
              ${adj.campaignPhone || '(877) 834-1273'},
              ${adj.callerId},
              ${adj.duration || 0},
              ${adj.callSid || null},
              ${adj.amount || 0},
              ${adj.classification || null},
              NOW()
            )
          `;
          inserted++;
        }

        return { inserted, skipped };
      } catch (error) {
        console.error('[ERROR] Failed to insert adjustments batch:', error);
        throw error;
      }
    },

    /**
     * Get calls from database for a date range.
     * Boundaries use UTC dates since call_timestamp is stored in UTC.
     * We cast to DATE and compare directly — no string slicing.
     */
    async getCallsForDateRange(
      startDate: Date,
      endDate: Date,
      category: Category | null = null
    ): Promise<DatabaseCallRecord[]> {
      try {
        // Build UTC date strings (YYYY-MM-DD) for the full range, with ±1 day buffer
        // to catch calls near midnight that might shift a day when converting EST→UTC.
        const startStr = new Date(startDate.getTime() - 86_400_000).toISOString().slice(0, 10);
        const endStr   = new Date(endDate.getTime()   + 86_400_000).toISOString().slice(0, 10);

        let result;
        if (category) {
          result = await sql`
            SELECT
              id, caller_id, call_timestamp, category,
              ringba_original_payout, ringba_revenue, ringba_id, unmatched,
              adjustment_amount, adjustment_time
            FROM public.ringba_call_data
            WHERE DATE(call_timestamp) BETWEEN ${startStr}::date AND ${endStr}::date
              AND category = ${category}
            ORDER BY caller_id, call_timestamp
          `;
        } else {
          result = await sql`
            SELECT
              id, caller_id, call_timestamp, category,
              ringba_original_payout, ringba_revenue, ringba_id, unmatched,
              adjustment_amount, adjustment_time
            FROM public.ringba_call_data
            WHERE DATE(call_timestamp) BETWEEN ${startStr}::date AND ${endStr}::date
            ORDER BY caller_id, call_timestamp
          `;
        }

        return result as DatabaseCallRecord[];
      } catch (error) {
        console.error('[ERROR] Failed to get calls for date range:', error);
        throw error;
      }
    },

    /**
     * Get Ringba call by ringba_id (for debugging).
     */
    async getRingbaCallByRingbaId(ringbaId: string): Promise<{
      id: number;
      ringba_id: string;
      call_timestamp: string;
      caller_id: string | null;
      target_id: string | null;
      ringba_payout: number;
    } | null> {
      try {
        const result = await sql`
          SELECT id, ringba_id, call_timestamp, caller_id, target_id, ringba_payout
          FROM public.ringba_original_sync
          WHERE ringba_id = ${ringbaId}
          LIMIT 1
        `;
        return (result[0] as any) || null;
      } catch (error) {
        console.error('[ERROR] Failed to get Ringba call:', error);
        throw error;
      }
    },

    /**
     * Get eLocal calls by caller (match caller_id containing digits; for debugging).
     */
    async getElocalCallsByCallerDigits(digits: string): Promise<DatabaseCallRecord[]> {
      try {
        const pattern = `%${digits.slice(-10)}%`;
        const result = await sql`
          SELECT
            id, caller_id, call_timestamp, category,
            ringba_original_payout, ringba_revenue, ringba_id, unmatched,
            adjustment_amount, adjustment_time
          FROM public.ringba_call_data
          WHERE caller_id LIKE ${pattern}
          ORDER BY call_timestamp
        `;
        return result as DatabaseCallRecord[];
      } catch (error) {
        console.error('[ERROR] Failed to get eLocal calls by caller:', error);
        throw error;
      }
    },

    /**
     * Get call by ID
     */
    async getCallById(callId: number): Promise<DatabaseCallRecord | null> {
      try {
        const result = await sql`
          SELECT id, caller_id, call_timestamp, category, unmatched,
                 adjustment_amount, adjustment_time
          FROM public.ringba_call_data
          WHERE id = ${callId}
        `;
        return (result[0] as DatabaseCallRecord) || null;
      } catch (error) {
        console.error('[ERROR] Failed to get call by ID:', error);
        throw error;
      }
    },

    /**
     * Update existing call with adjustment
     */
    async updateCallWithAdjustment(
      callId: number,
      adjustmentData: {
        elocalPayout: number;
        adjustmentTime?: string | null;
        adjustmentAmount?: number | null;
      }
    ): Promise<{ updated: number }> {
      try {
        const result = await sql`
          UPDATE public.ringba_call_data
          SET
            ringba_revenue = ${adjustmentData.elocalPayout ?? 0},
            adjustment_time = ${adjustmentData.adjustmentTime || null},
            adjustment_amount = ${adjustmentData.adjustmentAmount ?? 0},
            unmatched = ${false},
            updated_at = NOW()
          WHERE id = ${callId}
          RETURNING id
        `;
        return { updated: result.length };
      } catch (error) {
        console.error('[ERROR] Failed to update call with adjustment:', error);
        throw error;
      }
    },

    /**
     * Update ringba_original_payout for an eLocal call (Ringba Original Sync).
     * NOTE: ringba_revenue is owned exclusively by the eLocal fetch service and is NOT updated here.
     * Only ringba_original_payout (the Ringba source-of-truth) and ringba_id are updated.
     */
    async updateOriginalPayout(
      callId: number,
      originalPayout: number,
      _originalRevenue: number, // No longer written — ringba_revenue is owned by eLocal fetch service
      ringbaInboundCallId: string | null
    ): Promise<{ updated: number }> {
      try {
        const result = await sql`
          UPDATE public.ringba_call_data
          SET
            ringba_original_payout = COALESCE(ringba_original_payout, ${originalPayout}),
            ringba_id = COALESCE(ringba_id, ${ringbaInboundCallId}),
            updated_at = NOW()
          WHERE id = ${callId}
            AND NOT EXISTS (
              SELECT 1 FROM public.ringba_call_data 
              WHERE ringba_id = ${ringbaInboundCallId} AND id != ${callId}
            )
          RETURNING id
        `;
        return { updated: result.length };
      } catch (error) {
        console.error('[ERROR] Failed to update original payout:', error);
        throw error;
      }
    },

    /**
     * Insert or update Ringba calls in ringba_original_sync table (by ringba_id).
     */
    async insertRingbaCallsBatch(
      ringbaCalls: RingbaCallForSync[]
    ): Promise<{ inserted: number; updated: number; skipped: number }> {
      if (!ringbaCalls || ringbaCalls.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0 };
      }
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      for (const call of ringbaCalls) {
        try {
          const existing = await sql`
            SELECT id FROM public.ringba_original_sync WHERE ringba_id = ${call.inboundCallId} LIMIT 1
          `;
          if (existing.length > 0) {
            await sql`
              UPDATE public.ringba_original_sync
              SET
                call_timestamp = ${call.callDt || ''},
                caller_id = ${call.callerId ?? null},
                ringba_payout = ${call.payout ?? 0},
                ringba_revenue_amount = ${call.revenue ?? 0},
                call_duration = ${call.callDuration ?? 0},
                target_id = ${call.targetId ?? null},
                target_name = ${call.targetName ?? null},
                campaign_name = ${call.campaignName ?? null},
                publisher_name = ${call.publisherName ?? null},
                updated_at = NOW()
              WHERE ringba_id = ${call.inboundCallId}
            `;
            updated++;
          } else {
            await sql`
              INSERT INTO public.ringba_original_sync (
                ringba_id, call_timestamp, caller_id, ringba_payout, ringba_revenue_amount,
                call_duration, target_id, target_name, campaign_name, publisher_name
              )
              VALUES (
                ${call.inboundCallId},
                ${call.callDt || ''},
                ${call.callerId ?? null},
                ${call.payout ?? 0},
                ${call.revenue ?? 0},
                ${call.callDuration ?? 0},
                ${call.targetId ?? null},
                ${call.targetName ?? null},
                ${call.campaignName ?? null},
                ${call.publisherName ?? null}
              )
            `;
            inserted++;
          }
        } catch (err) {
          console.warn(`[WARN] Ringba call ${call.inboundCallId}:`, (err as Error).message);
          skipped++;
        }
      }
      return { inserted, updated, skipped };
    },

    /**
     * Get eLocal calls for cost sync (from ringba_call_data table)
     * Uses DATE() BETWEEN so UTC-stored timestamps are correctly compared.
     */
    async getElocalCallsForSync(
      startDate: Date,
      endDate: Date,
      category: Category | null = null
    ): Promise<any[]> {
      try {
        // Buffer ±1 day to catch cross-midnight boundary calls.
        const startStr = new Date(startDate.getTime() - 86_400_000).toISOString().slice(0, 10);
        const endStr   = new Date(endDate.getTime()   + 86_400_000).toISOString().slice(0, 10);

        if (category) {
          const result = await sql`
            SELECT 
              id, caller_id, call_timestamp as date_of_call,
              ringba_revenue as payout,
              category, ringba_original_payout as original_payout, 
              ringba_revenue as original_revenue, call_duration as total_duration
            FROM public.ringba_call_data
            WHERE DATE(call_timestamp) BETWEEN ${startStr}::date AND ${endStr}::date
              AND category = ${category}
            ORDER BY caller_id, call_timestamp
          `;
          return result as any[];
        } else {
          const result = await sql`
            SELECT 
              id, caller_id, call_timestamp as date_of_call,
              ringba_revenue as payout,
              category, ringba_original_payout as original_payout, 
              ringba_revenue as original_revenue, call_duration as total_duration
            FROM public.ringba_call_data
            WHERE DATE(call_timestamp) BETWEEN ${startStr}::date AND ${endStr}::date
            ORDER BY caller_id, call_timestamp
          `;
          return result as any[];
        }
      } catch (error) {
        console.error('[ERROR] Failed to get eLocal calls for sync:', error);
        throw error;
      }
    },

    /**
     * Get Ringba calls for matching (from ringba_original_sync table)
     * Used by ringba-cost-sync to compare with eLocal payouts
     */
    async getRingbaCallsForMatching(
      startDate: Date,
      endDate: Date
    ): Promise<any[]> {
      try {
        const formatDateForQuery = (date: Date): string => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const startStr = formatDateForQuery(startDate);
        const endStr = formatDateForQuery(endDate);

        console.log(`[Ringba Cost Sync] Querying ringba_original_sync table for dates: ${startStr} to ${endStr}`);

        const result = await sql`
          SELECT 
            id, ringba_id as inbound_call_id, call_timestamp as call_date_time, 
            caller_id, caller_id as caller_id_e164,
            ringba_payout as payout_amount, ringba_revenue_amount as revenue_amount, 
            target_id, call_duration
          FROM public.ringba_original_sync
          WHERE DATE(call_timestamp) BETWEEN ${startStr}::date AND ${endStr}::date
          ORDER BY caller_id, call_timestamp
        `;

        console.log(`[Ringba Cost Sync] Retrieved ${result.length} Ringba calls from database`);
        return result as any[];
      } catch (error) {
        console.error('[ERROR] Failed to get Ringba calls for matching:', error);
        throw error;
      }
    },

    /**
     * Update ringba_inbound_call_id (ringba_id) for multiple calls
     * Used by ringba-cost-sync to link eLocal calls to Ringba calls
     */
    async updateRingbaInboundCallId(
      matches: Array<{ elocalCallId: number; ringbaInboundCallId: string }>
    ): Promise<{ updated: number }> {
      if (!matches || matches.length === 0) {
        return { updated: 0 };
      }

      try {
        let updated = 0;
        for (const match of matches) {
          const result = await sql`
            UPDATE public.ringba_call_data
            SET
              ringba_id = ${match.ringbaInboundCallId},
              updated_at = NOW()
            WHERE id = ${match.elocalCallId}
            RETURNING id
          `;
          if (result.length > 0) {
            updated++;
          }
        }
        return { updated };
      } catch (error) {
        console.error('[ERROR] Failed to update ringba_inbound_call_id:', error);
        throw error;
      }
    },
  };
};

export type NeonDbOps = ReturnType<typeof createNeonDbOps>;
