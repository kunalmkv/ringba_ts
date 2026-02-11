// Type definitions for Ringba Cost Sync service

/** Config for Ringba Cost Sync */
export interface RingbaCostSyncConfig {
  ringbaAccountId?: string;
  ringbaApiToken?: string;
  neonDatabaseUrl?: string;
}

/** eLocal call from database for cost matching */
export interface ElocalCallForCostSync {
  id: number;
  caller_id: string;
  date_of_call: string; // Will be called call_timestamp in DB
  payout: number | string;
  category: string;
  original_payout?: number | string | null;
  original_revenue?: number | string | null;
  total_duration?: number | string | null; // Will be called call_duration in DB
}

/** Ringba call from database for cost matching */
export interface RingbaCallForCostSync {
  id: number;
  inbound_call_id: string;
  call_date_time: string; // Will be called call_timestamp in DB
  caller_id: string | null;
  caller_id_e164: string | null;
  payout_amount: number | string;
  revenue_amount: number | string;
  target_id: string | null;
  call_duration?: number | string | null;
}

/** Match result between eLocal and Ringba call */
export interface CallMatch {
  elocalCall: ElocalCallForCostSync;
  ringbaCall: RingbaCallForCostSync;
  matchScore: number;
  timeDiff: number;
  durationDiff: number;
  durationMatch: boolean;
}

/** Update payload for Ringba API */
export interface RingbaPaymentUpdate {
  elocalCallId: number;
  ringbaInboundCallId: string;
  targetId: string | null;
  currentPayout: number;
  currentRevenue: number;
  newPayout: number;
  newRevenue: number;
  payoutDiff: number;
  revenueDiff: number;
  matchInfo: {
    timeDiff: number;
    durationMatch: boolean;
  };
}

/** Unmatched call result */
export interface UnmatchedCall {
  elocalCall: ElocalCallForCostSync;
  reason: string;
}

/** Matched call for ringba_inbound_call_id update */
export interface MatchedCallForIdUpdate {
  elocalCallId: number;
  ringbaInboundCallId: string;
}

/** Result from updating a single call in Ringba */
export interface RingbaUpdateResult {
  success: boolean;
  elocalCallId: number;
  ringbaInboundCallId: string;
  result?: any;
  error?: string;
}

/** Summary of cost sync operation */
export interface RingbaCostSyncSummary {
  dateRange: {
    start: string;
    end: string;
  };
  category: string;
  elocalCalls: number;
  ringbaCalls: number;
  updates: number;
  updated: number;
  failed: number;
  unmatched: number;
}

/** Payload for Ringba payment override API */
export interface RingbaPaymentApiPayload {
  newConversionAmount: number;
  newPayoutAmount: number;
  reason: string;
  targetId?: string | null;
}
