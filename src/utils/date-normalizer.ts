/**
 * Normalize date+time string to ISO format (YYYY-MM-DDTHH:mm:ss)
 *
 * Handles various input formats:
 * - "11/18/25 04:38 PM EST" -> "2025-11-18T16:38:00"
 * - "2025-11-18 16:38" -> "2025-11-18T16:38:00"
 * - "11/18/2025 4:38 PM" -> "2025-11-18T16:38:00"
 *
 * IMPORTANT: Does NOT convert timezones - preserves the time as-is
 * Only converts 12-hour format to 24-hour format
 */
export const normalizeDateTime = (dateTimeStr: string): string | null => {
  if (!dateTimeStr) return null;

  try {
    // Remove timezone abbreviations (EST, CST, PST, etc.)
    let cleaned = dateTimeStr.replace(/\s+(EST|CST|PST|MST|EDT|CDT|PDT|MDT)$/i, '').trim();

    // Pattern 1: MM/DD/YY HH:mm AM/PM (e.g., "11/18/25 04:38 PM")
    const pattern1 = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i;
    const match1 = cleaned.match(pattern1);

    if (match1) {
      let [, month, day, year, hours, minutes, period] = match1;

      // Convert 2-digit year to 4-digit
      if (year.length === 2) {
        const yearNum = parseInt(year, 10);
        year = yearNum >= 0 && yearNum <= 30 ? `20${year}` : `19${year}`;
      }

      // Convert to 24-hour format if AM/PM is present
      let hour24 = parseInt(hours, 10);
      if (period) {
        const periodUpper = period.toUpperCase();
        if (periodUpper === 'PM' && hour24 !== 12) {
          hour24 += 12;
        } else if (periodUpper === 'AM' && hour24 === 12) {
          hour24 = 0;
        }
      }

      const monthPad = month.padStart(2, '0');
      const dayPad = day.padStart(2, '0');
      const hourPad = String(hour24).padStart(2, '0');
      const minPad = minutes.padStart(2, '0');

      return `${year}-${monthPad}-${dayPad}T${hourPad}:${minPad}:00`;
    }

    // Pattern 2: YYYY-MM-DD HH:mm:ss or YYYY-MM-DD HH:mm
    const pattern2 = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/;
    const match2 = cleaned.match(pattern2);

    if (match2) {
      const [, year, month, day, hours, minutes, seconds] = match2;
      const sec = seconds || '00';
      return `${year}-${month}-${day}T${hours}:${minutes}:${sec}`;
    }

    // Pattern 3: ISO format (already normalized)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(cleaned)) {
      return cleaned.split('.')[0]; // Remove milliseconds if present
    }

    console.warn(`[normalizeDateTime] Could not parse date: ${dateTimeStr}`);
    return null;
  } catch (error) {
    console.warn(`[normalizeDateTime] Error parsing date: ${dateTimeStr}`, error);
    return null;
  }
};

/**
 * Check if a date is in US Eastern DST (daylight saving time).
 * DST: second Sunday in March 2 AM to first Sunday in November 2 AM.
 */
const isDateInDST = (date: Date): boolean => {
  const year = date.getUTCFullYear();
  const march1 = new Date(Date.UTC(year, 2, 1));
  const march1Day = march1.getUTCDay();
  const daysToSecondSunday = ((7 - march1Day) % 7) + 7;
  const dstStart = new Date(Date.UTC(year, 2, 1 + daysToSecondSunday, 7, 0, 0));
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const nov1Day = nov1.getUTCDay();
  const daysToFirstSunday = (7 - nov1Day) % 7;
  const dstEnd = new Date(Date.UTC(year, 10, 1 + daysToFirstSunday, 7, 0, 0));
  return date >= dstStart && date < dstEnd;
};

/**
 * Convert Ringba date to EST timezone.
 * Ringba API returns dates in UTC when formatDateTime: true. Converts to EST to match eLocal data.
 * @param ringbaDateStr - MM/DD/YYYY HH:MM:SS AM/PM (UTC)
 * @returns YYYY-MM-DDTHH:mm:ss in EST, or null
 */
export const convertRingbaDateToEST = (ringbaDateStr: string): string | null => {
  if (!ringbaDateStr) return null;
  try {
    const ringbaFormat = ringbaDateStr.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i
    );
    if (!ringbaFormat) {
      return normalizeDateTime(ringbaDateStr);
    }
    const month = parseInt(ringbaFormat[1], 10) - 1;
    const day = parseInt(ringbaFormat[2], 10);
    const year = parseInt(ringbaFormat[3], 10);
    let hours = parseInt(ringbaFormat[4], 10);
    const minutes = parseInt(ringbaFormat[5], 10);
    const seconds = parseInt(ringbaFormat[6], 10);
    const ampm = ringbaFormat[7].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    else if (ampm === 'AM' && hours === 12) hours = 0;
    const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    const estOffsetHours = isDateInDST(utcDate) ? 4 : 5;
    const estDate = new Date(utcDate.getTime() - estOffsetHours * 60 * 60 * 1000);
    const y = estDate.getUTCFullYear();
    const m = String(estDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(estDate.getUTCDate()).padStart(2, '0');
    const h = String(estDate.getUTCHours()).padStart(2, '0');
    const min = String(estDate.getUTCMinutes()).padStart(2, '0');
    const s = String(estDate.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}:${s}`;
  } catch {
    return normalizeDateTime(ringbaDateStr);
  }
};

/**
 * Parse a date string as Eastern time (EST/EDT).
 * Use for eLocal and Ringba dates that are stored/sent in Eastern so matching is timezone-consistent.
 * Handles: YYYY-MM-DDTHH:mm:ss, YYYY-MM-DDTHH:mm:ss.sss, with or without trailing Z.
 */
export const parseDateAsEastern = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  try {
    const cleaned = dateStr.trim().split('.')[0]; // drop milliseconds
    const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    const [, y, month, day, h, min, sec] = match;
    const year = parseInt(y!, 10);
    const m = parseInt(month!, 10) - 1;
    const d = parseInt(day!, 10);
    const hour = parseInt(h!, 10);
    const minute = parseInt(min!, 10);
    const second = parseInt(sec || '0', 10);
    const noonUtc = new Date(Date.UTC(year, m, d, 12, 0, 0));
    const offset = isDateInDST(noonUtc) ? '-04:00' : '-05:00';
    const iso = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}${offset}`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

/**
 * Return calendar date part (YYYY-MM-DD) in Eastern time for a given Date (UTC moment).
 */
export const getEasternDatePart = (date: Date): string => {
  const utc = date.getTime();
  const offsetHours = isDateInDST(date) ? 4 : 5;
  const eastern = new Date(utc - offsetHours * 60 * 60 * 1000);
  const y = eastern.getUTCFullYear();
  const m = String(eastern.getUTCMonth() + 1).padStart(2, '0');
  const d = String(eastern.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
