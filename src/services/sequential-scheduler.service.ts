// Sequential Scheduler Service
// Runs multiple services ONE BY ONE (sequentially) to save computational resources
// Unlike parallel schedulers that run all services at once, this scheduler waits
// for each service to complete before starting the next one

import cron from 'node-cron';
import type {
  MasterSchedulerConfig,
  ScheduleConfig,
  ServiceConfig
} from '../config/scheduler-config.js';
import { DEFAULT_SCHEDULER_CONFIG } from '../config/scheduler-config.js';
import type { DateRange, Category } from '../types/index.js';

/** Service execution result */
interface ServiceExecutionResult {
  success: boolean;
  serviceName: string;
  duration: number;
  result?: any;
  error?: string;
}

/** Schedule execution result */
interface ScheduleExecutionResult {
  success: boolean;
  scheduleName: string;
  totalDuration: number;
  serviceResults: ServiceExecutionResult[];
  successCount: number;
  failureCount: number;
}

/** Job statistics */
interface JobStats {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRun: string | null;
  lastResult: ScheduleExecutionResult | null;
  averageDuration: number;
}

/**
 * Sequential Scheduler
 * Runs services one by one instead of all at once to save computational resources
 */
export class SequentialScheduler {
  private config: MasterSchedulerConfig;
  private tasks: Map<string, cron.ScheduledTask>;
  private jobStats: Map<string, JobStats>;
  private isRunning: boolean;
  private appConfig: any;
  
  constructor(config?: MasterSchedulerConfig) {
    this.config = config || DEFAULT_SCHEDULER_CONFIG;
    this.tasks = new Map();
    this.jobStats = new Map();
    this.isRunning = false;
    this.appConfig = this.buildAppConfig();
  }
  
  /**
   * Build application config from environment variables
   */
  private buildAppConfig(): any {
    return {
      elocalApiKey: process.env.ELOCAL_API_KEY,
      neonDatabaseUrl: process.env.NEON_DATABASE_URL,
      ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
      ringbaApiToken: process.env.RINGBA_API_TOKEN,
    };
  }
  
  /**
   * Get current IST time string
   */
  private getISTTime(): string {
    const now = new Date();
    return now.toLocaleString('en-US', {
      timeZone: this.config.timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  /**
   * Calculate date range for a service
   */
  private calculateDateRange(service: ServiceConfig): DateRange {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    
    let startDate: Date;
    
    if (service.currentDayOnly) {
      // Current day only
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (service.daysBack) {
      // Go back N days
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - service.daysBack);
      startDate.setHours(0, 0, 0, 0);
    } else {
      // Default: current day
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    }
    
    // Format dates
    const formatDate = (date: Date): string => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };
    
    const formatDateURL = (date: Date): string => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}%2F${day}%2F${year}`;
    };
    
    return {
      startDate,
      endDate,
      startDateFormatted: formatDate(startDate),
      endDateFormatted: formatDate(endDate),
      startDateURL: formatDateURL(startDate),
      endDateURL: formatDateURL(endDate),
    };
  }
  
  /**
   * Execute a single service
   */
  private async executeService(service: ServiceConfig): Promise<ServiceExecutionResult> {
    const startTime = Date.now();
    
    console.log('');
    console.log('─'.repeat(70));
    console.log(`[${this.getISTTime()}] Executing: ${service.name}`);
    console.log(`Type: ${service.type}`);
    console.log(`Category: ${service.category || 'All'}`);
    console.log(`Description: ${service.description}`);
    console.log('─'.repeat(70));
    
    try {
      // Calculate date range
      const dateRange = this.calculateDateRange(service);
      
      console.log(`Date Range: ${dateRange.startDateFormatted} to ${dateRange.endDateFormatted}`);
      console.log('');
      
      let result: any;
      
      // Execute based on service type
      switch (service.type) {
        case 'elocal-fetch':
          result = await this.executeElocalFetch(dateRange, service.category || null);
          break;
          
        case 'ringba-original-sync':
          result = await this.executeRingbaOriginalSync(dateRange, service.category || null);
          break;
          
        case 'ringba-cost-sync':
          result = await this.executeRingbaCostSync(dateRange, service.category || null);
          break;
          
        default:
          throw new Error(`Unknown service type: ${service.type}`);
      }
      
      const duration = (Date.now() - startTime) / 1000;
      
      console.log('');
      console.log(`✅ SUCCESS: ${service.name}`);
      console.log(`Duration: ${duration.toFixed(2)}s`);
      console.log('─'.repeat(70));
      
      return {
        success: true,
        serviceName: service.name,
        duration,
        result
      };
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('');
      console.error(`❌ FAILED: ${service.name}`);
      console.error(`Error: ${errorMessage}`);
      console.error(`Duration: ${duration.toFixed(2)}s`);
      console.error('─'.repeat(70));
      
      return {
        success: false,
        serviceName: service.name,
        duration,
        error: errorMessage
      };
    }
  }
  
  /**
   * Execute eLocal fetch service
   */
  private async executeElocalFetch(dateRange: DateRange, category: Category | null): Promise<any> {
    // Dynamic import to avoid circular dependencies
    const module = await import('./fetch-elocal-calls.service.js');
    // The function is curried: config => dateRange => serviceType => category => async
    const serviceType = dateRange.startDate.getTime() === dateRange.endDate.getTime() ? 'current' : 'historical';
    const actualCategory: Category = category || 'STATIC';
    return await module.scrapeElocalDataWithDateRange(this.appConfig)(dateRange)(serviceType)(actualCategory)();
  }
  
  /**
   * Execute Ringba Original Sync service
   */
  private async executeRingbaOriginalSync(dateRange: DateRange, category: Category | null): Promise<any> {
    // Dynamic import to avoid circular dependencies
    const module = await import('./ringba-original-sync.service.js');
    // Use the correct export name
    return await module.syncRingbaOriginalPayout(this.appConfig, dateRange, category);
  }
  
  /**
   * Execute Ringba Cost Sync service
   */
  private async executeRingbaCostSync(dateRange: DateRange, category: Category | null): Promise<any> {
    // Dynamic import to avoid circular dependencies
    const { syncCostToRingba } = await import('./ringba-cost-sync.service.js');
    return await syncCostToRingba(this.appConfig, dateRange, category);
  }
  
  /**
   * Execute a schedule (run all services sequentially)
   */
  private async executeSchedule(schedule: ScheduleConfig): Promise<ScheduleExecutionResult> {
    const startTime = Date.now();
    const istTime = this.getISTTime();
    
    console.log('');
    console.log('='.repeat(70));
    console.log(`[${istTime}] SCHEDULE STARTED: ${schedule.name}`);
    console.log('='.repeat(70));
    console.log(`Description: ${schedule.description}`);
    console.log(`Services to run: ${schedule.services.filter(s => s.enabled).length}`);
    console.log(`Execution Mode: SEQUENTIAL (one by one)`);
    console.log('='.repeat(70));
    
    const serviceResults: ServiceExecutionResult[] = [];
    let successCount = 0;
    let failureCount = 0;
    
    // Execute services ONE BY ONE
    const enabledServices = schedule.services.filter(s => s.enabled);
    
    for (let i = 0; i < enabledServices.length; i++) {
      const service = enabledServices[i];
      
      console.log('');
      console.log(`[${i + 1}/${enabledServices.length}] Starting service...`);
      
      // Execute service and wait for completion
      const result = await this.executeService(service);
      serviceResults.push(result);
      
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
      
      // Small delay between services
      if (i < enabledServices.length - 1) {
        console.log('');
        console.log('⏳ Waiting 2 seconds before next service...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const totalDuration = (Date.now() - startTime) / 1000;
    
    console.log('');
    console.log('='.repeat(70));
    console.log(`SCHEDULE COMPLETED: ${schedule.name}`);
    console.log('='.repeat(70));
    console.log(`Total Services: ${enabledServices.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Total Duration: ${totalDuration.toFixed(2)}s`);
    console.log('='.repeat(70));
    console.log('');
    
    return {
      success: failureCount === 0,
      scheduleName: schedule.name,
      totalDuration,
      serviceResults,
      successCount,
      failureCount
    };
  }
  
  /**
   * Schedule a job
   */
  private scheduleJob(schedule: ScheduleConfig): void {
    // Initialize job stats
    this.jobStats.set(schedule.name, {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRun: null,
      lastResult: null,
      averageDuration: 0
    });
    
    // Create cron task
    const task = cron.schedule(
      schedule.cron,
      async () => {
        const stats = this.jobStats.get(schedule.name)!;
        stats.totalRuns++;
        stats.lastRun = new Date().toISOString();
        
        const result = await this.executeSchedule(schedule);
        
        stats.lastResult = result;
        if (result.success) {
          stats.successfulRuns++;
        } else {
          stats.failedRuns++;
        }
        
        // Update average duration
        const prevAvg = stats.averageDuration;
        const prevCount = stats.totalRuns - 1;
        stats.averageDuration = (prevAvg * prevCount + result.totalDuration) / stats.totalRuns;
      },
      {
        scheduled: false,
        timezone: schedule.timezone
      }
    );
    
    this.tasks.set(schedule.name, task);
    
    console.log(`✅ SCHEDULED: ${schedule.name}`);
    console.log(`   Cron: ${schedule.cron}`);
    console.log(`   Time: ${schedule.time} ${schedule.timezone}`);
    console.log(`   Services: ${schedule.services.filter(s => s.enabled).length}`);
    console.log('');
  }
  
  /**
   * Initialize scheduler
   */
  async initialize(): Promise<void> {
    console.log('');
    console.log('='.repeat(70));
    console.log('Sequential Scheduler - Initialization');
    console.log('='.repeat(70));
    console.log('Running services ONE BY ONE to save computational resources');
    console.log('='.repeat(70));
    console.log(`Timezone: ${this.config.timezone}`);
    console.log(`Total Schedules: ${this.config.schedules.filter(s => s.enabled).length}`);
    console.log('='.repeat(70));
    console.log('');
    
    // Validate required config
    const requiredVars = [
      'NEON_DATABASE_URL',
      'RINGBA_ACCOUNT_ID',
      'RINGBA_API_TOKEN',
    ];
    
    const missingVars = requiredVars.filter(env => !process.env[env]);
    
    if (missingVars.length > 0) {
      console.error('[ERROR] Missing required environment variables:');
      missingVars.forEach(env => console.error(`  - ${env}`));
      throw new Error('Missing required environment variables');
    }
    
    console.log('[INFO] All required environment variables are configured');
    console.log('');
  }
  
  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[WARN] Scheduler is already running');
      return;
    }
    
    await this.initialize();
    
    // Schedule all enabled schedules
    const enabledSchedules = this.config.schedules.filter(s => s.enabled);
    
    console.log('Scheduling jobs...');
    console.log('');
    
    enabledSchedules.forEach(schedule => {
      this.scheduleJob(schedule);
    });
    
    // Start all tasks
    this.tasks.forEach((task) => {
      task.start();
    });
    
    this.isRunning = true;
    
    console.log('='.repeat(70));
    console.log('✅ Scheduler Started Successfully!');
    console.log('='.repeat(70));
    console.log(`Active Schedules: ${this.tasks.size}`);
    console.log(`Current Time (${this.config.timezone}): ${this.getISTTime()}`);
    console.log('='.repeat(70));
    console.log('');
    
    this.displaySchedules();
    
    console.log('[INFO] Scheduler is running. Press Ctrl+C to stop.');
    console.log('');
  }
  
  /**
   * Display all schedules
   */
  displaySchedules(): void {
    console.log('Scheduled Jobs:');
    console.log('─'.repeat(70));
    
    this.config.schedules.filter(s => s.enabled).forEach((schedule, index) => {
      const stats = this.jobStats.get(schedule.name);
      const serviceCount = schedule.services.filter(s => s.enabled).length;
      console.log(`${index + 1}. ${schedule.name}`);
      console.log(`   Time: ${schedule.time} ${schedule.timezone}`);
      console.log(`   Services: ${serviceCount} (sequential)`);
      console.log(`   Runs: ${stats?.totalRuns || 0}`);
      console.log('');
    });
    
    console.log('─'.repeat(70));
    console.log('');
  }
  
  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.warn('[WARN] Scheduler is not running');
      return;
    }
    
    console.log('[INFO] Stopping scheduler...');
    
    this.tasks.forEach((task) => {
      task.stop();
    });
    
    this.isRunning = false;
    console.log('[INFO] Scheduler stopped');
  }
  
  /**
   * Get statistics
   */
  getStats(): Record<string, JobStats> {
    const stats: Record<string, JobStats> = {};
    
    this.jobStats.forEach((jobStats, name) => {
      stats[name] = {
        ...jobStats,
      };
    });
    
    return stats;
  }
  
  /**
   * Run a schedule immediately (for testing)
   */
  async runScheduleNow(scheduleName: string): Promise<ScheduleExecutionResult> {
    const schedule = this.config.schedules.find(s => s.name === scheduleName);
    
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleName}`);
    }
    
    if (!schedule.enabled) {
      throw new Error(`Schedule is disabled: ${scheduleName}`);
    }
    
    return await this.executeSchedule(schedule);
  }
}
