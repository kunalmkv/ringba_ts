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
    // Schedule 1: Early Morning (12:00 AM IST) - Data Collection
    {
      name: 'Early Morning Data Collection',
      description: 'Midnight data fetch and sync',
      cron: '0 0 * * *',
      time: '00:00',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        {
          name: 'Fetch eLocal Current Day - STATIC',
          type: 'elocal-fetch',
          enabled: true,
          category: 'STATIC',
          description: 'Fetch current day static line calls from eLocal',
          daysBack: 1
        },
        {
          name: 'Fetch eLocal Current Day - API',
          type: 'elocal-fetch',
          enabled: true,
          category: 'API',
          description: 'Fetch current day API calls from eLocal',
          daysBack: 1
        }
      ]
    },
    
    // Schedule 2: 3:00 AM IST - Ringba Original Sync
    {
      name: 'Ringba Original Sync',
      description: 'Fetch calls from Ringba and sync to database',
      cron: '4 3 * * *',
      time: '03:04',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        {
          name: 'Ringba Original Sync - Past 10 Days',
          type: 'ringba-original-sync',
          enabled: true,
          category: null, // All categories
          description: 'Sync Ringba calls for past 10 days',
          daysBack: 10
        }
      ]
    },
    
    // Schedule 3: 6:00 AM IST - Cost Sync
    {
      name: 'Morning Cost Sync',
      description: 'Sync cost changes from eLocal to Ringba',
      cron: '10 6 * * *',
      time: '06:10',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        {
          name: 'Ringba Cost Sync - Current Day',
          type: 'ringba-cost-sync',
          enabled: true,
          category: null, // All categories
          description: 'Sync eLocal cost changes to Ringba for current day',
          currentDayOnly: true
        }
      ]
    },
    
    // Schedule 4: 9:00 PM IST - Evening Data Collection & Full Sync
    {
      name: 'Evening Data Collection & Sync',
      description: 'Evening comprehensive data sync',
      cron: '0 21 * * *',
      time: '21:00',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        {
          name: 'Fetch eLocal Current Day - STATIC',
          type: 'elocal-fetch',
          enabled: true,
          category: 'STATIC',
          description: 'Fetch current day static line calls from eLocal',
          daysBack: 1
        },
        {
          name: 'Fetch eLocal Current Day - API',
          type: 'elocal-fetch',
          enabled: true,
          category: 'API',
          description: 'Fetch current day API calls from eLocal',
          daysBack: 1
        },
        {
          name: 'Ringba Original Sync - Past 10 Days',
          type: 'ringba-original-sync',
          enabled: true,
          category: null,
          description: 'Sync Ringba calls for past 10 days',
          daysBack: 10
        },
        {
          name: 'Ringba Cost Sync - Past 15 Days',
          type: 'ringba-cost-sync',
          enabled: true,
          category: null,
          description: 'Sync eLocal cost changes to Ringba for past 15 days',
          daysBack: 15
        }
      ]
    },
    
    // Schedule 5: 11:58 PM IST - Historical Data Collection
    {
      name: 'Historical Data Collection',
      description: 'Daily historical data scraping',
      cron: '58 23 * * *',
      time: '23:58',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        {
          name: 'Fetch eLocal Historical - STATIC',
          type: 'elocal-fetch',
          enabled: true,
          category: 'STATIC',
          description: 'Fetch past 15 days static line calls from eLocal',
          daysBack: 15
        },
        {
          name: 'Fetch eLocal Historical - API',
          type: 'elocal-fetch',
          enabled: true,
          category: 'API',
          description: 'Fetch past 15 days API calls from eLocal',
          daysBack: 15
        }
      ]
    }
  ]
};
