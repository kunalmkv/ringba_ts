/**
 * Fetch calls from Ringba API filtered by target ID.
 * Used by Ringba Original Sync service.
 */
import fetch from 'node-fetch';
import * as TE from 'fp-ts/lib/TaskEither.js';

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

export const TARGET_IDS: Record<string, string> = {
  TA48aa3e3f5a0544af8549703f76a24faa: 'Elocal - Appliance repair - Static Line',
  PI1175ac62aa1c4748b21216666b398135: 'Elocal - Appliance Repair',
};

export const getTargetName = (targetId: string): string =>
  TARGET_IDS[targetId] ?? targetId;

export const getCategoryFromTargetId = (targetId: string): 'STATIC' | 'API' => {
  const name = getTargetName(targetId);
  if (name && name.toLowerCase().includes('static')) return 'STATIC';
  return 'API';
};

export interface RingbaCallRecord {
  inboundCallId: string | null;
  callDate: string | null;
  targetId: string;
  targetName: string;
  revenue: number;
  payout: number;
  ringbaCost: number;
  callDuration: number;
  inboundPhoneNumber: string | null;
  callerId: string | null;
  campaignName: string | null;
  publisherName: string | null;
}

export interface GetCallsByTargetIdOptions {
  startDate?: string | Date;
  endDate?: string | Date;
  pageSize?: number;
}

export interface GetCallsByTargetIdResult {
  targetId: string;
  targetName: string;
  calls: RingbaCallRecord[];
  summary: {
    targetId: string;
    targetName: string;
    totalCalls: number;
    totalRevenue: number;
    totalPayout: number;
    totalRingbaCost: number;
    dateRange: { start: string; end: string };
  };
}

export const getCallsByTargetId =
  (accountId: string, apiToken: string) =>
  (targetId: string, options: GetCallsByTargetIdOptions = {}) =>
    TE.tryCatch(
      async (): Promise<GetCallsByTargetIdResult> => {
        if (!targetId) throw new Error('targetId is required');
        if (!accountId || !apiToken) throw new Error('Ringba accountId and apiToken are required');

        const targetName = getTargetName(targetId);
        let startDate: Date;
        let endDate: Date;
        if (options.startDate) {
          startDate = options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
          endDate = options.endDate
            ? options.endDate instanceof Date
              ? options.endDate
              : new Date(options.endDate)
            : new Date();
        } else {
          endDate = new Date();
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 30);
        }
        if (options.endDate && !options.startDate) {
          endDate = options.endDate instanceof Date ? options.endDate : new Date(options.endDate);
        }

        const pageSize = Math.min(options.pageSize ?? 100, 1000);
        const allCalls: RingbaCallRecord[] = [];
        let offset = 0;
        let hasMore = true;
        let totalRecords = 0;

        while (hasMore) {
          const url = `${RINGBA_BASE_URL}/${accountId}/calllogs`;
          const body = {
            reportStart: startDate!.toISOString(),
            reportEnd: endDate!.toISOString(),
            offset,
            size: pageSize,
            orderByColumns: [{ column: 'callDt', direction: 'desc' as const }],
            valueColumns: [
              { column: 'inboundCallId' },
              { column: 'callDt' },
              { column: 'targetName' },
              { column: 'targetId' },
              { column: 'conversionAmount' },
              { column: 'payoutAmount' },
              { column: 'callLengthInSeconds' },
              { column: 'inboundPhoneNumber' },
              { column: 'tag:InboundNumber:Number' },
              { column: 'campaignName' },
              { column: 'publisherName' },
            ],
            filters: [
              {
                anyConditionToMatch: [
                  {
                    column: 'targetId',
                    comparisonType: 'EQUALS' as const,
                    value: targetId,
                    isNegativeMatch: false,
                  },
                ],
              },
            ],
            formatDateTime: true,
          };

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Token ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error response');
            throw new Error(`Ringba API error ${response.status}: ${errorText}`);
          }

          const data = (await response.json()) as {
            report?: { records?: unknown[]; totalCount?: number; total?: number };
          };
          const records = data.report?.records ?? [];
          const totalCount = data.report?.totalCount ?? data.report?.total ?? records.length;

          for (const record of records as Array<Record<string, unknown>>) {
            const revenue =
              record.conversionAmount !== undefined && record.conversionAmount !== null
                ? Number(record.conversionAmount)
                : 0;
            const payout =
              record.payoutAmount !== undefined && record.payoutAmount !== null
                ? Number(record.payoutAmount)
                : 0;
            const callDuration =
              record.callLengthInSeconds !== undefined && record.callLengthInSeconds !== null
                ? parseInt(String(record.callLengthInSeconds), 10)
                : 0;
            allCalls.push({
              inboundCallId: (record.inboundCallId as string) ?? null,
              callDate: (record.callDt as string) ?? null,
              targetId: (record.targetId as string) ?? targetId,
              targetName: (record.targetName as string) ?? targetName,
              revenue,
              payout,
              ringbaCost: payout,
              callDuration,
              inboundPhoneNumber: (record.inboundPhoneNumber as string) ?? null,
              callerId: (record['tag:InboundNumber:Number'] as string) ?? null,
              campaignName: (record.campaignName as string) ?? null,
              publisherName: (record.publisherName as string) ?? null,
            });
          }

          totalRecords = totalCount;
          if (records.length < pageSize || allCalls.length >= totalRecords) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
          if (hasMore) {
            await new Promise((r) => setTimeout(r, 100));
          }
        }

        return {
          targetId,
          targetName,
          calls: allCalls,
          summary: {
            targetId,
            targetName,
            totalCalls: allCalls.length,
            totalRevenue: allCalls.reduce((s, c) => s + c.revenue, 0),
            totalPayout: allCalls.reduce((s, c) => s + c.payout, 0),
            totalRingbaCost: allCalls.reduce((s, c) => s + (c.ringbaCost ?? 0), 0),
            dateRange: { start: startDate!.toISOString(), end: endDate!.toISOString() },
          },
        };
      },
      (e) => new Error(`Failed to fetch calls by target: ${(e as Error).message}`)
    );
