// Ringba API client for payment updates

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

/** Payload for Ringba payment override API */
export interface RingbaPaymentOverridePayload {
  newConversionAmount: number;
  newPayoutAmount: number;
  reason: string;
  targetId?: string | null;
}

/** Result from Ringba payment update */
export interface RingbaPaymentUpdateResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Update call payment in Ringba dashboard
 * Uses the /calls/payments/override endpoint
 * 
 * @param accountId - Ringba account ID
 * @param apiToken - Ringba API token
 * @param inboundCallId - The inbound call ID to update
 * @param payload - Payment update payload
 * @returns Promise with update result
 */
export const updateCallPayment = async (
  accountId: string,
  apiToken: string,
  inboundCallId: string,
  payload: RingbaPaymentOverridePayload
): Promise<RingbaPaymentUpdateResult> => {
  try {
    if (!inboundCallId) {
      throw new Error('inboundCallId is required');
    }

    if (payload.newConversionAmount === undefined && payload.newPayoutAmount === undefined) {
      throw new Error('At least one of newConversionAmount or newPayoutAmount must be provided');
    }

    // Use the correct /calls/payments/override endpoint
    const url = `${RINGBA_BASE_URL}/${accountId}/calls/payments/override`;
    const headers = {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    };

    const body: any = {
      inboundCallId,
      reason: payload.reason || 'Call payments adjusted by eLocal sync service.'
    };

    // Include targetId if provided (required by Ringba API for some accounts)
    if (payload.targetId) {
      body.targetId = payload.targetId;
    }

    // Set adjustConversion and adjustPayout flags based on what we're updating
    if (payload.newConversionAmount !== undefined) {
      body.adjustConversion = true;
      body.newConversionAmount = typeof payload.newConversionAmount === 'string'
        ? parseFloat(payload.newConversionAmount)
        : Number(payload.newConversionAmount);
    } else {
      body.adjustConversion = false;
    }

    if (payload.newPayoutAmount !== undefined) {
      body.adjustPayout = true;
      body.newPayoutAmount = typeof payload.newPayoutAmount === 'string'
        ? parseFloat(payload.newPayoutAmount)
        : Number(payload.newPayoutAmount);
    } else {
      body.adjustPayout = false;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const text = await response.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`Ringba API error ${response.status}: ${text}`);
    }

    return {
      success: true,
      data: json
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Get category from Ringba target ID
 * Based on target name: "Static Line" -> STATIC, otherwise -> API
 */
export const getCategoryFromTargetId = (targetId: string | null): 'STATIC' | 'API' => {
  if (!targetId) return 'API';
  
  // Define known target IDs
  const TARGET_IDS: Record<string, string> = {
    'TA48aa3e3f5a0544af8549703f76a24faa': 'Elocal - Appliance repair - Static Line',
    'PI1175ac62aa1c4748b21216666b398135': 'Elocal - Appliance Repair'
  };
  
  const targetName = TARGET_IDS[targetId] || targetId;
  if (targetName && targetName.toLowerCase().includes('static')) {
    return 'STATIC';
  }
  return 'API';
};
