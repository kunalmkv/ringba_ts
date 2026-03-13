const getEasternOffset = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    const formatter = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: 'America/New_York' });
    const parts = formatter.formatToParts(d);
    const tzPart = parts.find(p => p.type === 'timeZoneName')?.value;
    return tzPart === 'EDT' ? '-04:00' : '-05:00';
  } catch {
    return '-05:00'; // Fallback to EST
  }
};

const parseDate = (dateStr: string | Date | null | undefined, isElocalDate = false): Date | null => {
  if (!dateStr) return null;

  try {
    if (dateStr instanceof Date) return dateStr;

    // eLocal calls are already in UTC from fetcher
    if (isElocalDate) {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    }

    // --- Ringba Dates (EST/EDT) ---
    // If it already has a timezone indicator, let JS handle it.
    if (dateStr.endsWith('Z') || dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    }

    // Try Ringba "YYYY-MM-DDTHH:mm:ss" format
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (isoMatch) {
      const offset = getEasternOffset(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00Z`);
      const dateWithTz = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${isoMatch[4]}:${isoMatch[5]}:${isoMatch[6]}${offset}`;
      console.log('isoMatch constructed string:', dateWithTz);
      const d = new Date(dateWithTz);
      return isNaN(d.getTime()) ? null : d;
    }

    // Try Ringba format: MM/DD/YYYY HH:MM:SS AM/PM (e.g., "11/18/2025 06:29:34 PM")
    const ringbaFormat = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
    if (ringbaFormat) {
      const month = ringbaFormat[1].padStart(2, '0');
      const day = ringbaFormat[2].padStart(2, '0');
      const year = ringbaFormat[3];
      let hours = parseInt(ringbaFormat[4], 10);
      const minutes = ringbaFormat[5].padStart(2, '0');
      const seconds = ringbaFormat[6].padStart(2, '0');
      const ampm = ringbaFormat[7].toUpperCase();

      if (ampm === 'PM' && hours !== 12) hours += 12;
      else if (ampm === 'AM' && hours === 12) hours = 0;

      const hrs = String(hours).padStart(2, '0');
      const dateStringIso = `${year}-${month}-${day}T${hrs}:${minutes}:${seconds}`;
      
      const offset = getEasternOffset(`${year}-${month}-${day}T12:00:00Z`);
      const d = new Date(`${dateStringIso}${offset}`);
      return isNaN(d.getTime()) ? null : d;
    }

    // Fallback: Just parse it directly
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;

  } catch (error) {
    return null;
  }
};

const elocalDateStr = "2026-03-12T08:35:46.000Z";
const ringbaDateStr = "2026-03-12T10:05:46";

const parsedElocal = parseDate(elocalDateStr, true);
const parsedRingba = parseDate(ringbaDateStr, false);

console.log("Parsed eLocal:", parsedElocal?.toISOString());
console.log("Parsed Ringba:", parsedRingba?.toISOString());

const diff = Math.abs(parsedElocal!.getTime() - parsedRingba!.getTime()) / (1000 * 60);
console.log(`Difference in minutes: ${diff}`);
