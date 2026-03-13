import { createNeonClient } from './src/config/database.js';
import dotenv from 'dotenv';
import { join } from 'path';
import { getCategoryFromTargetId } from './src/http/ringba-client.js';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });

// The exact logic from parseDate
const parseDate = (dateRaw: any, isElocalEST = false): Date | null => {
  if (!dateRaw) return null;
  const d = new Date(dateRaw);
  if (isNaN(d.getTime())) return null;
  return d;
};

// Simplified matcher just for debugging one call
const testMatchCall = (elocalCall: any, ringbaCall: any) => {
  console.log('--- Matching ---');
  let reason = '';
  
  const ringbaCategory = getCategoryFromTargetId(ringbaCall.target_id);
  const elocalCategory = elocalCall.category || 'STATIC';
  console.log(`1. Category: eLocal=${elocalCategory}, Ringba=${ringbaCategory}`);
  if (ringbaCategory !== elocalCategory) { reason = 'Category mismatch'; return { match: false, reason }; }

  const elocalCallerE164 = elocalCall.caller_id;
  const ringbaCallerE164 = ringbaCall.caller_id_e164;
  console.log(`2. Caller: eLocal=${elocalCallerE164}, Ringba=${ringbaCallerE164}`);
  if (elocalCallerE164 !== ringbaCallerE164) { reason = 'Caller mismatch'; return { match: false, reason }; }

  const elocalDate = parseDate(elocalCall.date_of_call, true); 
  const ringbaDate = parseDate(ringbaCall.call_date_time, false);
  console.log(`3. Dates: eLocal=${elocalDate?.toISOString()}, Ringba=${ringbaDate?.toISOString()}`);
  if (!elocalDate || !ringbaDate) { reason = 'Invalid dates'; return { match: false, reason }; }

  const elocalDateStr = elocalDate.toISOString().split('T')[0];
  const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
  const elocalDateOnly = new Date(elocalDateStr);
  const ringbaDateOnly = new Date(ringbaDateStr);
  const daysDiff = Math.abs((elocalDateOnly.getTime() - ringbaDateOnly.getTime()) / (1000 * 60 * 60 * 24));
  console.log(`4. Days Diff: ${daysDiff}`);
  if (daysDiff > 1) { reason = 'Days diff > 1'; return { match: false, reason }; }

  const timeDiff = Math.abs(elocalDate.getTime() - ringbaDate.getTime()) / (1000 * 60);
  const effectiveWindow = daysDiff === 0 ? 30 : (24 * 60);
  console.log(`5. Time Diff: ${timeDiff} minutes (Window: ${effectiveWindow})`);
  if (timeDiff > effectiveWindow) { reason = 'Time diff too large'; return { match: false, reason }; }

  const elocalDuration = Number(elocalCall.elocal_duration || 0);
  const ringbaDuration = Number(ringbaCall.ringba_duration || 0);
  const durationDiff = Math.abs(elocalDuration - ringbaDuration);
  console.log(`6. Duration: eLocal=${elocalDuration}, Ringba=${ringbaDuration}, Diff=${durationDiff}`);
  if (elocalDuration > 0 && ringbaDuration > 0 && durationDiff > 30) {
    reason = 'Duration mismatch'; return { match: false, reason }; 
  }

  return { match: true, reason: 'Matched perfectly!' };
};

async function main() {
  const sql = createNeonClient();
  
  // Get the problem eLocal call
  const eCall = await sql`
     SELECT id, caller_id, call_timestamp as date_of_call, category, call_duration as elocal_duration 
     FROM public.ringba_call_data 
     WHERE caller_id = '+14072565548' AND DATE(call_timestamp) = '2026-03-12' LIMIT 1
  `;
  
  // Get Ringba candidates
  const rCalls = await sql`
     SELECT id, caller_id as caller_id_e164, call_timestamp as call_date_time, target_id, call_duration as ringba_duration 
     FROM public.ringba_original_sync 
     WHERE caller_id = '+14072565548' AND DATE(call_timestamp) = '2026-03-12'
  `;

  console.log('eLocal Call:', eCall[0]);
  console.log('Ringba Calls:', rCalls);

  if (eCall.length > 0 && rCalls.length > 0) {
     for (const rc of rCalls) {
        console.log(testMatchCall(eCall[0], rc));
     }
  } else {
     console.log('Missing either eLocal or Ringba call in the database for this caller on this date.');
  }

  process.exit(0);
}

main().catch(console.error);
