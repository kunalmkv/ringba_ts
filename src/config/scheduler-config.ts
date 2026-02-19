// Sequential Scheduler Configuration
// Defines which services to run and in what order
// Each service runs one after another (sequential execution)

export interface ServiceConfig {
  name: string;
  type: 'elocal-fetch' | 'ringba-original-sync' | 'ringba-cost-sync';
  enabled: boolean;
  category?: 'STATIC' | 'API' | null; // null means all categories
  description: string;
  /** How many days back to fetch (for historical syncs) */
  daysBack?: number;
  /** Whether to sync current day only (for cost sync) */
  currentDayOnly?: boolean;
}

export interface ScheduleConfig {
  name: string;
  description: string;
  /** Cron expression (e.g., '10 21 * * *' for 9:10 PM daily) */
  cron: string;
  /** Human-readable time (e.g., '21:10') */
  time: string;
  timezone: string;
  enabled: boolean;
  /** Services to run sequentially when this schedule triggers */
  services: ServiceConfig[];
}

// Master configuration for all schedules
export interface MasterSchedulerConfig {
  timezone: string;
  schedules: ScheduleConfig[];
}

// Default configuration
export const DEFAULT_SCHEDULER_CONFIG: MasterSchedulerConfig = {
  timezone: 'Asia/Kolkata',
  schedules: [
    // Schedule 1: 9:00 PM IST - Standard Sequence
    {
      name: '9 PM Standard Sync',
      description: 'Evening data collection and sync',
      cron: '0 21 * * *',
      time: '21:00',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        // 1. Fetch eLocal Current Day - STATIC
        {
          name: 'Fetch eLocal Current Day - STATIC',
          type: 'elocal-fetch',
          enabled: true,
          category: 'STATIC',
          description: 'Fetch current day static line calls',
          daysBack: 1
        },
        // 2. Fetch eLocal Current Day - API
        {
          name: 'Fetch eLocal Current Day - API',
          type: 'elocal-fetch',
          enabled: true,
          category: 'API',
          description: 'Fetch current day API calls',
          daysBack: 1
        },
        // 3. Ringba Original Sync - Static & API (All Categories)
        {
          name: 'Ringba Original Sync - Current',
          type: 'ringba-original-sync',
          enabled: true,
          category: null, // All categories
          description: 'Sync Ringba calls for current/recent days',
          daysBack: 5 // Keeping a safe buffer
        },
        // 4. Ringba Cost Sync - Current Day
        {
          name: 'Ringba Cost Sync - Current Day',
          type: 'ringba-cost-sync',
          enabled: true,
          category: null, // All categories
          description: 'Sync cost changes for current day',
          currentDayOnly: true
        }
      ]
    },

    // Schedule 2: 12:00 AM IST (Midnight) - Historical + Standard
    {
      name: 'Midnight Historical & Standard Sync',
      description: 'Historical data backfill followed by standard sync',
      cron: '0 0 * * *',
      time: '00:00',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        // --- HISTORICAL BLOCK ---
        // 1. Historical eLocal - STATIC (10 days)
        {
          name: 'Fetch eLocal Historical - STATIC',
          type: 'elocal-fetch',
          enabled: true,
          category: 'STATIC',
          description: 'Fetch past 10 days static line calls',
          daysBack: 10
        },
        // 2. Historical eLocal - API (10 days)
        {
          name: 'Fetch eLocal Historical - API',
          type: 'elocal-fetch',
          enabled: true,
          category: 'API',
          description: 'Fetch past 10 days API calls',
          daysBack: 10
        },
        // 3. Ringba Cost Sync - Historical (10 days)
        {
          name: 'Ringba Cost Sync - Historical',
          type: 'ringba-cost-sync',
          enabled: true,
          category: null,
          description: 'Sync cost changes for past 10 days',
          daysBack: 10
        },

        // --- STANDARD BLOCK ---
        // 4. Fetch eLocal Current Day - STATIC
        {
          name: 'Fetch eLocal Current Day - STATIC',
          type: 'elocal-fetch',
          enabled: true,
          category: 'STATIC',
          description: 'Fetch current day static line calls',
          daysBack: 1
        },
        // 5. Fetch eLocal Current Day - API
        {
          name: 'Fetch eLocal Current Day - API',
          type: 'elocal-fetch',
          enabled: true,
          category: 'API',
          description: 'Fetch current day API calls',
          daysBack: 1
        },
        // 6. Ringba Original Sync - Current
        {
          name: 'Ringba Original Sync - Current',
          type: 'ringba-original-sync',
          enabled: true,
          category: null,
          description: 'Sync Ringba calls for current/recent days',
          daysBack: 5
        },
        // 7. Ringba Cost Sync - Current Day
        {
          name: 'Ringba Cost Sync - Current Day',
          type: 'ringba-cost-sync',
          enabled: true,
          category: null,
          description: 'Sync cost changes for current day',
          currentDayOnly: true
        }
      ]
    },

    // Schedule 3: 3:00 AM IST - Standard Sequence
    {
      name: '3 AM Standard Sync',
      description: 'Early morning data sync',
      cron: '0 3 * * *',
      time: '03:00',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        // 1. Fetch eLocal Current Day - STATIC
        {
          name: 'Fetch eLocal Current Day - STATIC',
          type: 'elocal-fetch',
          enabled: true,
          category: 'STATIC',
          description: 'Fetch current day static line calls',
          daysBack: 1
        },
        // 2. Fetch eLocal Current Day - API
        {
          name: 'Fetch eLocal Current Day - API',
          type: 'elocal-fetch',
          enabled: true,
          category: 'API',
          description: 'Fetch current day API calls',
          daysBack: 1
        },
        // 3. Ringba Original Sync - Current
        {
          name: 'Ringba Original Sync - Current',
          type: 'ringba-original-sync',
          enabled: true,
          category: null,
          description: 'Sync Ringba calls for current/recent days',
          daysBack: 5
        },
        // 4. Ringba Cost Sync - Current Day
        {
          name: 'Ringba Cost Sync - Current Day',
          type: 'ringba-cost-sync',
          enabled: true,
          category: null,
          description: 'Sync cost changes for current day',
          currentDayOnly: true
        }
      ]
    },

    // Schedule 4: 6:00 AM IST - Standard Sequence
    {
      name: '6 AM Standard Sync',
      description: 'Morning data sync',
      cron: '0 6 * * *',
      time: '06:00',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        // 1. Fetch eLocal Current Day - STATIC
        {
          name: 'Fetch eLocal Current Day - STATIC',
          type: 'elocal-fetch',
          enabled: true,
          category: 'STATIC',
          description: 'Fetch current day static line calls',
          daysBack: 1
        },
        // 2. Fetch eLocal Current Day - API
        {
          name: 'Fetch eLocal Current Day - API',
          type: 'elocal-fetch',
          enabled: true,
          category: 'API',
          description: 'Fetch current day API calls',
          daysBack: 1
        },
        // 3. Ringba Original Sync - Current
        {
          name: 'Ringba Original Sync - Current',
          type: 'ringba-original-sync',
          enabled: true,
          category: null,
          description: 'Sync Ringba calls for current/recent days',
          daysBack: 5
        },
        // 4. Ringba Cost Sync - Current Day
        {
          name: 'Ringba Cost Sync - Current Day',
          type: 'ringba-cost-sync',
          enabled: true,
          category: null,
          description: 'Sync cost changes for current day',
          currentDayOnly: true
        }
      ]
    }
  ]
};
