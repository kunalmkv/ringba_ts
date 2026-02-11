import type { DateRange } from '../types/index.js';

/**
 * Format date for eLocal display (MM/DD/YY)
 */
const formatDateForElocal = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).substring(2);
  return `${month}/${day}/${year}`;
};

/**
 * Format date for URL parameters (YYYY-MM-DD)
 */
const formatDateForURL = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get past 10 days range (excluding today)
 */
export const getPast10DaysRange = (): DateRange => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1); // Yesterday

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 9); // 10 days ago

  return {
    startDate,
    endDate,
    startDateFormatted: formatDateForElocal(startDate),
    endDateFormatted: formatDateForElocal(endDate),
    startDateURL: formatDateForURL(startDate),
    endDateURL: formatDateForURL(endDate),
  };
};

/**
 * Get current day range
 */
export const getCurrentDayRange = (): DateRange => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    startDate: today,
    endDate: today,
    startDateFormatted: formatDateForElocal(today),
    endDateFormatted: formatDateForElocal(today),
    startDateURL: formatDateForURL(today),
    endDateURL: formatDateForURL(today),
  };
};

/**
 * Get current day range with timezone awareness (IST)
 */
export const getCurrentDayRangeWithTimezone = (): DateRange => {
  const now = new Date();
  const istDateString = now.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const istParts = istDateString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!istParts) {
    return getCurrentDayRange();
  }

  const monthIST = parseInt(istParts[1], 10);
  const dayIST = parseInt(istParts[2], 10);
  const yearIST = parseInt(istParts[3], 10);
  let hoursIST = parseInt(istParts[4], 10);

  if (hoursIST === 24) {
    hoursIST = 0;
  }

  let targetDate: Date;

  if (hoursIST >= 0 && hoursIST < 12) {
    // Before noon IST - use previous day
    const prevDay = new Date(yearIST, monthIST - 1, dayIST - 1);
    targetDate = prevDay;
  } else {
    // After noon IST - use current day
    targetDate = new Date(yearIST, monthIST - 1, dayIST);
  }

  targetDate.setHours(0, 0, 0, 0);

  return {
    startDate: targetDate,
    endDate: targetDate,
    startDateFormatted: formatDateForElocal(targetDate),
    endDateFormatted: formatDateForElocal(targetDate),
    startDateURL: formatDateForURL(targetDate),
    endDateURL: formatDateForURL(targetDate),
  };
};

/**
 * Get custom date range (inclusive start and end)
 */
export const getCustomDateRange = (startDate: Date, endDate: Date): DateRange => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return {
    startDate: start,
    endDate: end,
    startDateFormatted: formatDateForElocal(start),
    endDateFormatted: formatDateForElocal(end),
    startDateURL: formatDateForURL(start),
    endDateURL: formatDateForURL(end),
  };
};

/**
 * Get date range for Ringba sync (IST-aware: before noon IST = previous day, else current day).
 */
export const getRingbaSyncDateRange = (): DateRange => {
  const now = new Date();
  const istDateString = now.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const istParts = istDateString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!istParts) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    return {
      startDate: today,
      endDate,
      startDateFormatted: formatDateForElocal(today),
      endDateFormatted: formatDateForElocal(today),
      startDateURL: formatDateForURL(today),
      endDateURL: formatDateForURL(today),
    };
  }
  const monthIST = parseInt(istParts[1], 10);
  const dayIST = parseInt(istParts[2], 10);
  const yearIST = parseInt(istParts[3], 10);
  let hoursIST = parseInt(istParts[4], 10);
  if (hoursIST === 24) hoursIST = 0;
  let targetYear: number, targetMonth: number, targetDay: number;
  if (hoursIST >= 0 && hoursIST < 12) {
    if (dayIST > 1) {
      targetYear = yearIST;
      targetMonth = monthIST;
      targetDay = dayIST - 1;
    } else {
      if (monthIST > 1) {
        targetYear = yearIST;
        targetMonth = monthIST - 1;
        targetDay = new Date(Date.UTC(yearIST, monthIST - 1, 0)).getUTCDate();
      } else {
        targetYear = yearIST - 1;
        targetMonth = 12;
        targetDay = new Date(Date.UTC(yearIST - 1, 12, 0)).getUTCDate();
      }
    }
  } else {
    targetYear = yearIST;
    targetMonth = monthIST;
    targetDay = dayIST;
  }
  const targetDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 23, 59, 59, 999));
  const monthPad = String(targetMonth).padStart(2, '0');
  const dayPad = String(targetDay).padStart(2, '0');
  const yearShort = String(targetYear).substring(2);
  const startDateFormatted = `${monthPad}/${dayPad}/${yearShort}`;
  const startDateURL = `${targetYear}-${monthPad}-${dayPad}`;
  return {
    startDate: targetDate,
    endDate,
    startDateFormatted,
    endDateFormatted: startDateFormatted,
    startDateURL,
    endDateURL: startDateURL,
  };
};

/**
 * Get date range description for logging
 */
export const getDateRangeDescription = (dateRange: DateRange): string => {
  return `${dateRange.startDateFormatted} to ${dateRange.endDateFormatted}`;
};

/**
 * Get service schedule info
 */
export const getServiceScheduleInfo = (serviceType: string): any => {
  const schedules: Record<string, any> = {
    historical: {
      name: 'Historical Data Service (STATIC)',
      description: 'Fetches past 10 days of call data (excluding today)',
      schedule: 'Runs once daily',
      dateRange: 'Past 10 days',
    },
    current: {
      name: 'Current Day Service (STATIC)',
      description: 'Fetches current day call data with timezone awareness',
      schedule: 'Runs every 30 minutes',
      dateRange: 'Current day only',
    },
    'historical-api': {
      name: 'Historical Data Service (API)',
      description: 'Fetches past 10 days of API category call data',
      schedule: 'Runs once daily',
      dateRange: 'Past 10 days',
    },
    'current-api': {
      name: 'Current Day Service (API)',
      description: 'Fetches current day API category call data',
      schedule: 'Runs every 30 minutes',
      dateRange: 'Current day only',
    },
  };

  return schedules[serviceType] || { name: 'Unknown Service' };
};
