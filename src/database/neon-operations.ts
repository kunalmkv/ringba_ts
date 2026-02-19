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
     * Insert or update campaign calls in batch
     */
    async insertCallsBatch(calls: ElocalCall[]): Promise<InsertResult> {
      if (!calls || calls.length === 0) {
        return { inserted: 0, updated: 0 };
      }

      try {
        let inserted = 0;
        let updated = 0;
        let timestampCorrected = 0;
        let skippedDuplicates = 0;

        // Process calls one by one (Neon doesn't support traditional transactions)
        for (const call of calls) {
          // Normalize caller ID to E.164 to prevent duplicate formats
          const normalizedCallerId = toE164(call.callerId) || call.callerId;

          const lookupTimestamp = call.originalDateOfCall || call.dateOfCall;
          let correctedTimestamp = call.dateOfCall;
          let isTimestampCorrection = !!(
            call.originalDateOfCall &&
            call.originalDateOfCall !== call.dateOfCall
          );

          // If this is a timestamp correction, check if the corrected timestamp would cause a duplicate
          if (isTimestampCorrection) {
            const duplicateCheck = await sql`
              SELECT id FROM public.elocal_call_data
              WHERE caller_id = ${normalizedCallerId}
                AND call_timestamp = ${correctedTimestamp}
                AND category = ${call.category || 'STATIC'}
              LIMIT 1
            `;

            if (duplicateCheck.length > 0) {
              console.log(
                `[DB SKIP] Timestamp correction would cause duplicate for caller ${normalizedCallerId.substring(0, 10)}...`
              );
              correctedTimestamp = lookupTimestamp;
              isTimestampCorrection = false;
              skippedDuplicates++;
            }
          }

          // Check if call exists
          const existingCall = await sql`
            SELECT id FROM public.elocal_call_data
            WHERE caller_id = ${normalizedCallerId}
              AND call_timestamp = ${lookupTimestamp || ''}
              AND category = ${call.category || 'STATIC'}
            LIMIT 1
          `;

          if (existingCall.length > 0) {
            // Update existing call
            await sql`
              UPDATE public.elocal_call_data
              SET
                call_timestamp = ${correctedTimestamp},
                elocal_payout = ${call.elocalPayout ?? 0},
                category = ${call.category || 'STATIC'},
                city_state = ${call.cityState || null},
                zip_code = ${call.zipCode || null},
                call_duration = ${call.totalDuration || null},
                adjustment_time = ${call.adjustmentTime ?? ''},
                adjustment_amount = ${call.adjustmentAmount ?? 0},
                unmatched = ${call.unmatched || false},
                ringba_id = ${call.ringbaInboundCallId || null},
                ringba_original_payout = ${call.ringbaOriginalPayout !== undefined ? call.ringbaOriginalPayout : null},
                ringba_original_revenue = ${call.ringbaOriginalRevenue !== undefined ? call.ringbaOriginalRevenue : null},
                updated_at = NOW()
              WHERE caller_id = ${normalizedCallerId}
                AND call_timestamp = ${lookupTimestamp || ''}
                AND category = ${call.category || 'STATIC'}
            `;
            updated++;

            if (isTimestampCorrection) {
              timestampCorrected++;
            }
          } else {
            // Check if a record with the corrected timestamp already exists
            const existsWithCorrectedTimestamp = await sql`
              SELECT id FROM public.elocal_call_data
              WHERE caller_id = ${normalizedCallerId}
                AND call_timestamp = ${correctedTimestamp}
                AND category = ${call.category || 'STATIC'}
              LIMIT 1
            `;

            if (existsWithCorrectedTimestamp.length > 0) {
              // Update the existing record
              await sql`
                UPDATE public.elocal_call_data
                SET
                  elocal_payout = ${call.elocalPayout ?? 0},
                  city_state = ${call.cityState || null},
                  zip_code = ${call.zipCode || null},
                  call_duration = ${call.totalDuration || null},
                  adjustment_time = ${call.adjustmentTime ?? ''},
                  adjustment_amount = ${call.adjustmentAmount ?? 0},
                  unmatched = ${call.unmatched || false},
                  ringba_id = ${call.ringbaInboundCallId || null},
                  ringba_original_payout = ${call.ringbaOriginalPayout !== undefined ? call.ringbaOriginalPayout : null},
                  ringba_original_revenue = ${call.ringbaOriginalRevenue !== undefined ? call.ringbaOriginalRevenue : null},
                  updated_at = NOW()
                WHERE caller_id = ${normalizedCallerId}
                  AND call_timestamp = ${correctedTimestamp}
                  AND category = ${call.category || 'STATIC'}
              `;
              updated++;
            } else {
              // Insert new call
              await sql`
                INSERT INTO public.elocal_call_data (
                  caller_id, call_timestamp, elocal_payout, category,
                  city_state, zip_code, call_duration,
                  adjustment_time, adjustment_amount, unmatched, ringba_id,
                  ringba_original_payout, ringba_original_revenue, created_at
                )
                VALUES (
                  ${normalizedCallerId},
                  ${correctedTimestamp},
                  ${call.elocalPayout ?? 0},
                  ${call.category || 'STATIC'},
                  ${call.cityState || null},
                  ${call.zipCode || null},
                  ${call.totalDuration || null},
                  ${call.adjustmentTime ?? ''},
                  ${call.adjustmentAmount ?? 0},
                  ${call.unmatched || false},
                  ${call.ringbaInboundCallId || null},
                  ${call.ringbaOriginalPayout !== undefined ? call.ringbaOriginalPayout : null},
                  ${call.ringbaOriginalRevenue !== undefined ? call.ringbaOriginalRevenue : null},
                  NOW()
                )
              `;
              inserted++;
            }
          }
        }

        if (timestampCorrected > 0) {
          console.log(
            `[DB] Timestamp corrections applied to ${timestampCorrected} existing records`
          );
        }
        if (skippedDuplicates > 0) {
          console.log(
            `[DB] Skipped ${skippedDuplicates} timestamp corrections (would cause duplicates)`
          );
        }

        return { inserted, updated, skippedDuplicates };
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
     * Get calls from database for a date range
     */
    async getCallsForDateRange(
      startDate: Date,
      endDate: Date,
      category: Category | null = null
    ): Promise<DatabaseCallRecord[]> {
      try {
        // Use UTC so calendar dates match the sync's intended day (e.g. Feb 3 05:00 UTC = Feb 3 EST)
        const formatDateUTC = (date: Date): string => {
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const datesInRange: string[] = [];
        const current = new Date(startDate);
        const end = new Date(endDate);
        // Include one UTC day before and after so boundary calls (e.g. eLocal stored in Eastern)
        // are not missed when sync uses UTC date boundaries.
        current.setUTCDate(current.getUTCDate() - 1);
        end.setUTCDate(end.getUTCDate() + 1);

        while (current <= end) {
          datesInRange.push(formatDateUTC(new Date(current)));
          current.setUTCDate(current.getUTCDate() + 1);
        }

        let result;
        if (category) {
          result = await sql`
            SELECT
              id, caller_id, call_timestamp, elocal_payout, category,
              ringba_original_payout, ringba_original_revenue, ringba_id, unmatched,
              adjustment_amount, adjustment_time
            FROM public.elocal_call_data
            WHERE SUBSTRING(call_timestamp, 1, 10) = ANY(${datesInRange})
              AND category = ${category}
            ORDER BY caller_id, call_timestamp
          `;
        } else {
          result = await sql`
            SELECT
              id, caller_id, call_timestamp, elocal_payout, category,
              ringba_original_payout, ringba_original_revenue, ringba_id, unmatched,
              adjustment_amount, adjustment_time
            FROM public.elocal_call_data
            WHERE SUBSTRING(call_timestamp, 1, 10) = ANY(${datesInRange})
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
            id, caller_id, call_timestamp, elocal_payout, category,
            ringba_original_payout, ringba_original_revenue, ringba_id, unmatched,
            adjustment_amount, adjustment_time
          FROM public.elocal_call_data
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
          SELECT id, caller_id, call_timestamp, elocal_payout, category, unmatched,
                 adjustment_amount, adjustment_time
          FROM public.elocal_call_data
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
          UPDATE public.elocal_call_data
          SET
            elocal_payout = ${adjustmentData.elocalPayout ?? 0},
            adjustment_time = ${adjustmentData.adjustmentTime ?? ''},
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
     * Update ringba_original_payout and ringba_original_revenue for an eLocal call (Ringba Original Sync).
     * Uses COALESCE to preserve existing values (don't overwrite if already set).
     */
    async updateOriginalPayout(
      callId: number,
      originalPayout: number,
      originalRevenue: number,
      ringbaInboundCallId: string | null
    ): Promise<{ updated: number }> {
      try {
        const result = await sql`
          UPDATE public.elocal_call_data
          SET
            ringba_original_payout = COALESCE(ringba_original_payout, ${originalPayout}),
            ringba_original_revenue = COALESCE(ringba_original_revenue, ${originalRevenue}),
            ringba_id = COALESCE(ringba_id, ${ringbaInboundCallId}),
            updated_at = NOW()
          WHERE id = ${callId}
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
     * Get eLocal calls for cost sync (from elocal_call_data table)
     * Used by ringba-cost-sync to match and update Ringba payouts
     */
    async getElocalCallsForSync(
      startDate: Date,
      endDate: Date,
      category: Category | null = null
    ): Promise<any[]> {
      try {
        const formatDate = (date: Date): string => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const datesInRange: string[] = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
          datesInRange.push(formatDate(new Date(current)));
          current.setDate(current.getDate() + 1);
        }

        if (category) {
          const result = await sql`
            SELECT 
              id, caller_id, call_timestamp as date_of_call, elocal_payout as payout, 
              category, ringba_original_payout as original_payout, 
              ringba_original_revenue as original_revenue, call_duration as total_duration
            FROM public.elocal_call_data
            WHERE SUBSTRING(call_timestamp::text, 1, 10) = ANY(${datesInRange})
              AND category = ${category}
            ORDER BY caller_id, call_timestamp
          `;
          return result as any[];
        } else {
          const result = await sql`
            SELECT 
              id, caller_id, call_timestamp as date_of_call, elocal_payout as payout, 
              category, ringba_original_payout as original_payout, 
              ringba_original_revenue as original_revenue, call_duration as total_duration
            FROM public.elocal_call_data
            WHERE SUBSTRING(call_timestamp::text, 1, 10) = ANY(${datesInRange})
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

        const datesInRange: string[] = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
          datesInRange.push(formatDateForQuery(new Date(current)));
          current.setDate(current.getDate() + 1);
        }

        console.log(`[Ringba Cost Sync] Querying ringba_original_sync table for dates: ${datesInRange.join(', ')}`);

        const result = await sql`
          SELECT 
            id, ringba_id as inbound_call_id, call_timestamp as call_date_time, 
            caller_id, caller_id as caller_id_e164,
            ringba_payout as payout_amount, ringba_revenue_amount as revenue_amount, 
            target_id, call_duration
          FROM public.ringba_original_sync
          WHERE SUBSTRING(call_timestamp::text, 1, 10) = ANY(${datesInRange})
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
            UPDATE public.elocal_call_data
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
