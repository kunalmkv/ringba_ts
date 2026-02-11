// Core type definitions for the elocal scrapper service

export interface DateRange {
  startDate: Date;
  endDate: Date;
  startDateFormatted: string;
  endDateFormatted: string;
  startDateURL: string;
  endDateURL: string;
}

export type ServiceType = 'historical' | 'current' | 'custom' | 'unknown';
export type Category = 'STATIC' | 'API';
export type SessionStatus = 'running' | 'completed' | 'failed';

export interface Session {
  sessionId: string;
  startedAt: string;
  status: SessionStatus;
}

export interface ElocalCall {
  callerId: string;
  dateOfCall: string;
  elocalPayout: number;
  ringbaOriginalPayout?: number | null;
  ringbaOriginalRevenue?: number | null;
  category: Category;
  cityState?: string | null;
  zipCode?: string | null;
  totalDuration?: number | null;
  adjustmentTime?: string | null;
  adjustmentAmount?: number | null;
  unmatched?: boolean;
  ringbaInboundCallId?: string | null;
  originalDateOfCall?: string;
}

export interface AdjustmentDetail {
  callerId: string;
  timeOfCall: string;
  adjustmentTime: string;
  campaignPhone: string;
  amount: number;
  duration?: number;
  callSid?: string | null;
  classification?: string | null;
}

export interface RawApiCall {
  caller_phone?: string;
  callerPhoneNumber?: string;
  callerId?: string;
  phone?: string;
  call_date?: string;
  callStartTime?: string;
  date?: string;
  did_phone?: string;
  campaignPhoneNumber?: string;
  final_payout?: number;
  payout?: number;
  original_payout?: number;
  original_revenue?: number;
  cityState?: string;
  zip_code?: string;
  zipCode?: string;
  call_duration?: number;
  duration?: number;
  callDuration?: number;
  classification?: string;
  /** eLocal API v2: adjustment fields per call */
  adjustment_amount?: number | null;
  adjustment_date?: string | null;
  adjustment_category?: string | null;
}

export interface ElocalApiResponse {
  calls: RawApiCall[];
  totalCalls: number;
  raw: unknown;
}

export interface ScrapingResult {
  sessionId: string;
  dateRange: string;
  summary: {
    totalCalls: number;
    totalPayout: number;
    uniqueCallers: number;
    adjustmentsApplied: number;
  };
  calls: ElocalCall[];
  downloadedFile: {
    file: string;
    size: number;
  };
  databaseResults: {
    callsInserted: number;
    callsUpdated: number;
  };
}

export interface Config {
  elocalApiKey?: string;
  neonDatabaseUrl?: string;
}

export interface SessionUpdate {
  completed_at?: string;
  status?: SessionStatus;
  calls_scraped?: number;
  adjustments_scraped?: number;
  error_message?: string;
}

export interface DatabaseCallRecord {
  id: number;
  caller_id: string;
  call_timestamp: string;
  elocal_payout: string | number;
  category: string;
  ringba_id?: string | null;
  ringba_original_payout?: string | number | null;
  ringba_original_revenue?: string | number | null;
  unmatched?: boolean;
  adjustment_amount?: string | number | null;
  adjustment_time?: string | null;
  hasAdjustment?: boolean;
  adjustmentAmount?: number | null;
  adjustmentTime?: string | null;
}

export interface InsertResult {
  inserted: number;
  updated: number;
  skippedDuplicates?: number;
}

/** Config for Ringba Original Sync (Neon DB + Ringba API) */
export interface RingbaOriginalSyncConfig {
  ringbaAccountId?: string;
  ringbaApiToken?: string;
  neonDatabaseUrl?: string;
}

/** Ringba call as returned by API and stored in ringba_original_sync */
export interface RingbaCallForSync {
  inboundCallId: string;
  callDt: string;
  callDtOriginal?: string;
  callerId: string | null;
  callerIdE164: string | null;
  inboundPhoneNumber: string | null;
  payout: number;
  revenue: number;
  callDuration: number;
  targetId: string;
  targetName: string;
  campaignName: string | null;
  publisherName: string | null;
}

/** Result of Ringba Original Sync */
export interface RingbaOriginalSyncSummary {
  dateRange: { start: string; end: string };
  category: string;
  ringbaCalls: number;
  inserted: number;
  updated: number;
  skipped: number; /** Ringba save errors */
  elocalCalls: number;
  matched: number;
  updatedOriginal: number;
  failed: number;
  unmatched: number;
  skippedPreserved: number; /** eLocal rows already had original_payout/revenue */
}
