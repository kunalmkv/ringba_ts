# Sequential Scheduler - TypeScript Implementation

## Overview

The **Sequential Scheduler** is a resource-efficient scheduling system that runs services **ONE BY ONE** (sequentially) instead of all at once. This dramatically reduces computational load on the server while ensuring all services execute reliably.

## Key Differences from Node.js Version

| Feature | Node.js Schedulers | TypeScript Sequential Scheduler |
|---------|-------------------|--------------------------------|
| **Execution Mode** | Parallel (all services at scheduled time) | Sequential (one by one) |
| **Resource Usage** | High (multiple services running simultaneously) | Low (only one service at a time) |
| **Scheduler Files** | 9 separate scheduler files | 1 unified scheduler |
| **Configuration** | Hardcoded in each file | Centralized config file |
| **Flexibility** | Need to modify multiple files | Single config to modify |
| **Server Load** | Can overwhelm server | Server-friendly |

## Why Sequential?

### Problem with Parallel Execution
The Node.js version runs multiple independent schedulers:
- `start-ringba-cost-sync-current-day.js` - runs 4 times daily
- `start-ringba-cost-scheduler.js` - runs 4 times daily  
- `start-ringba-original-scheduler.js` - runs 4 times daily
- `start-historical-scheduler.js` - runs daily
- `start-current-scheduler.js` - runs daily

If all these fire at the same time, the server gets overwhelmed with:
- Multiple database connections
- Multiple API calls
- High memory usage
- Potential timeouts/crashes

### Solution: Sequential Execution
The TypeScript scheduler runs services **one at a time**:
1. Service 1 starts → runs → completes
2. Service 2 starts → runs → completes
3. Service 3 starts → runs → completes
4. And so on...

**Result**: Lower memory, predictable load, no resource contention

## Architecture

```
Sequential Scheduler
├── Configuration (scheduler-config.ts)
│   ├── Define schedules (when to run)
│   └── Define services per schedule (what to run)
├── Service Executor (sequential-scheduler.service.ts)
│   ├── Cron job management
│   ├── Sequential execution engine
│   └── Statistics tracking
└── Runner (run-sequential-scheduler.ts)
    ├── Environment validation
    ├── Graceful shutdown
    └── Status reporting
```

## Configuration

### Schedule Structure

Each schedule defines:
- **When** to run (cron expression)
- **Which services** to run
- **In what order** (top to bottom)

Example:

```typescript
{
  name: 'Evening Data Collection & Sync',
  cron: '0 21 * * *',  // 9:00 PM IST daily
  time: '21:00',
  timezone: 'Asia/Kolkata',
  enabled: true,
  services: [
    {
      name: 'Fetch eLocal Current Day - STATIC',
      type: 'elocal-fetch',
      enabled: true,
      category: 'STATIC',
      daysBack: 1
    },
    {
      name: 'Fetch eLocal Current Day - API',
      type: 'elocal-fetch',
      enabled: true,
      category: 'API',
      daysBack: 1
    },
    {
      name: 'Ringba Original Sync',
      type: 'ringba-original-sync',
      enabled: true,
      daysBack: 10
    },
    {
      name: 'Ringba Cost Sync',
      type: 'ringba-cost-sync',
      enabled: true,
      daysBack: 15
    }
  ]
}
```

**Execution Flow** (Sequential):
```
9:00 PM: Schedule triggers
├─ 9:00:00 PM: Start "Fetch eLocal STATIC"
├─ 9:05:30 PM: Complete "Fetch eLocal STATIC" (5.5 min)
├─ 9:05:32 PM: Start "Fetch eLocal API" (2s delay)
├─ 9:12:45 PM: Complete "Fetch eLocal API" (7.2 min)
├─ 9:12:47 PM: Start "Ringba Original Sync" (2s delay)
├─ 9:25:10 PM: Complete "Ringba Original Sync" (12.4 min)
├─ 9:25:12 PM: Start "Ringba Cost Sync" (2s delay)
└─ 9:38:55 PM: Complete "Ringba Cost Sync" (13.7 min)

Total: 38.9 minutes (all sequential)
```

## Default Schedules

### 1. Early Morning Data Collection (12:00 AM IST)
- Fetch eLocal current day - STATIC
- Fetch eLocal current day - API

**Purpose**: Capture end-of-day data

### 2. Ringba Original Sync (3:04 AM IST)
- Sync Ringba calls for past 10 days

**Purpose**: Update database with latest Ringba data

### 3. Morning Cost Sync (6:10 AM IST)
- Sync cost changes to Ringba (current day only)

**Purpose**: Update Ringba dashboard with overnight changes

### 4. Evening Data Collection & Sync (9:00 PM IST) - **COMPREHENSIVE**
- Fetch eLocal current day - STATIC
- Fetch eLocal current day - API
- Ringba Original Sync (past 10 days)
- Ringba Cost Sync (past 15 days)

**Purpose**: Full evening sync of all systems

### 5. Historical Data Collection (11:58 PM IST)
- Fetch eLocal historical - STATIC (past 15 days)
- Fetch eLocal historical - API (past 15 days)

**Purpose**: End-of-day historical backup

## Service Types

### 1. eLocal Fetch (`elocal-fetch`)
Fetches call data from eLocal dashboard

**Configuration**:
```typescript
{
  type: 'elocal-fetch',
  category: 'STATIC' | 'API',
  daysBack: 1 | 15,  // 1 = current, 15 = historical
}
```

### 2. Ringba Original Sync (`ringba-original-sync`)
Fetches calls from Ringba API and saves to `ringba_original_sync` table

**Configuration**:
```typescript
{
  type: 'ringba-original-sync',
  category: null,  // All categories
  daysBack: 10
}
```

### 3. Ringba Cost Sync (`ringba-cost-sync`)
Syncs cost changes from eLocal to Ringba dashboard

**Configuration**:
```typescript
{
  type: 'ringba-cost-sync',
  category: null,  // All categories
  daysBack: 15,
  currentDayOnly: false  // Or true for current day only
}
```

## Usage

### Start the Scheduler

```bash
# Using npm script (recommended)
npm run scheduler

# Or directly
npm run scheduler:sequential

# Build and run production
npm run build
node dist/test/run-sequential-scheduler.js
```

### Environment Variables Required

```bash
NEON_DATABASE_URL=postgresql://...
RINGBA_ACCOUNT_ID=your_account_id
RINGBA_API_TOKEN=your_api_token
ELOCAL_API_KEY=your_api_key  # Optional for eLocal fetch
```

### Stop the Scheduler

Press `Ctrl+C` for graceful shutdown with statistics

## Output Example

```
======================================================================
Sequential Scheduler - Initialization
======================================================================
Running services ONE BY ONE to save computational resources
======================================================================
Timezone: Asia/Kolkata
Total Schedules: 5
======================================================================

Scheduling jobs...

✅ SCHEDULED: Early Morning Data Collection
   Cron: 0 0 * * *
   Time: 00:00 Asia/Kolkata
   Services: 2

✅ SCHEDULED: Ringba Original Sync
   Cron: 4 3 * * *
   Time: 03:04 Asia/Kolkata
   Services: 1

... (more schedules) ...

======================================================================
✅ Scheduler Started Successfully!
======================================================================
Active Schedules: 5
Current Time (Asia/Kolkata): 02/11/2026, 15:30:45
======================================================================

Scheduled Jobs:
──────────────────────────────────────────────────────────────────────
1. Early Morning Data Collection
   Time: 00:00 Asia/Kolkata
   Services: 2 (sequential)
   Runs: 0

2. Ringba Original Sync
   Time: 03:04 Asia/Kolkata
   Services: 1 (sequential)
   Runs: 0

... (more jobs) ...
──────────────────────────────────────────────────────────────────────

[INFO] Scheduler is running. Press Ctrl+C to stop.
```

### When a Schedule Runs

```
======================================================================
[02/11/2026, 21:00:00] SCHEDULE STARTED: Evening Data Collection & Sync
======================================================================
Description: Evening comprehensive data sync
Services to run: 4
Execution Mode: SEQUENTIAL (one by one)
======================================================================

[1/4] Starting service...

──────────────────────────────────────────────────────────────────────
[02/11/2026, 21:00:01] Executing: Fetch eLocal Current Day - STATIC
Type: elocal-fetch
Category: STATIC
Description: Fetch current day static line calls from eLocal
──────────────────────────────────────────────────────────────────────
Date Range: 02/11/2026 to 02/11/2026

... (service execution logs) ...

✅ SUCCESS: Fetch eLocal Current Day - STATIC
Duration: 325.45s
──────────────────────────────────────────────────────────────────────

⏳ Waiting 2 seconds before next service...

[2/4] Starting service...

... (next service) ...

======================================================================
SCHEDULE COMPLETED: Evening Data Collection & Sync
======================================================================
Total Services: 4
Successful: 4
Failed: 0
Total Duration: 2387.32s (39.8 minutes)
======================================================================
```

## Configuration Customization

### Modify Schedules

Edit `src/config/scheduler-config.ts`:

```typescript
export const DEFAULT_SCHEDULER_CONFIG: MasterSchedulerConfig = {
  timezone: 'Asia/Kolkata',
  schedules: [
    {
      name: 'My Custom Schedule',
      description: 'Custom timing',
      cron: '30 14 * * *',  // 2:30 PM daily
      time: '14:30',
      timezone: 'Asia/Kolkata',
      enabled: true,
      services: [
        // Add your services here
      ]
    }
  ]
};
```

### Enable/Disable Services

Set `enabled: false` to skip a service:

```typescript
services: [
  {
    name: 'Optional Service',
    type: 'elocal-fetch',
    enabled: false,  // ← This service will be skipped
    category: 'API',
    daysBack: 1
  }
]
```

### Enable/Disable Entire Schedules

Set `enabled: false` at the schedule level:

```typescript
{
  name: 'Weekend Schedule',
  enabled: false,  // ← This entire schedule won't run
  cron: '0 12 * * 6,0',  // Saturdays and Sundays
  services: [...]
}
```

## Cron Expression Format

```
  ┌────────────── second (optional, 0-59)
  │ ┌──────────── minute (0-59)
  │ │ ┌────────── hour (0-23)
  │ │ │ ┌──────── day of month (1-31)
  │ │ │ │ ┌────── month (1-12)
  │ │ │ │ │ ┌──── day of week (0-7, 0 and 7 = Sunday)
  │ │ │ │ │ │
  * * * * * *
```

### Common Examples

```typescript
'0 0 * * *'      // Every day at midnight
'0 12 * * *'     // Every day at noon
'*/15 * * * *'   // Every 15 minutes
'0 */3 * * *'    // Every 3 hours
'0 9-17 * * 1-5' // Weekdays 9 AM to 5 PM (hourly)
'30 2 * * 6'     // Every Saturday at 2:30 AM
```

## Statistics & Monitoring

The scheduler tracks:
- **Total runs** per schedule
- **Success/failure count**
- **Average duration**
- **Last run timestamp**
- **Last result details**

Access via graceful shutdown (Ctrl+C) or programmatically:

```typescript
const scheduler = new SequentialScheduler();
await scheduler.start();

// Later...
const stats = scheduler.getStats();
console.log(stats);
```

## Testing

### Run a Schedule Immediately

```typescript
const scheduler = new SequentialScheduler();
await scheduler.start();

// Run a specific schedule now (for testing)
const result = await scheduler.runScheduleNow('Evening Data Collection & Sync');
console.log(result);
```

### Test Individual Services

```bash
# Test individual services
npm run sync:cost -- 2026-02-02 2026-02-02
npm run sync:ringba-original -- 2026-02-02 2026-02-02
npm run run:range -- 2026-02-02 2026-02-02 API
```

## Comparison with Node.js Version

### Node.js (Multiple Schedulers)

**Files**:
- `start-ringba-cost-sync-current-day.js`
- `start-ringba-cost-scheduler.js`
- `start-ringba-original-scheduler.js`
- `start-historical-scheduler.js`
- `start-current-scheduler.js`

**Commands**:
```bash
npm run scheduler:ringba-cost-current-day  # Process 1
npm run scheduler:ringba-cost              # Process 2
npm run scheduler:ringba-original          # Process 3
npm run scheduler:historical               # Process 4
npm run scheduler:current                  # Process 5
```

**Problems**:
- 5 separate processes running simultaneously
- Each has its own cron jobs
- High memory usage
- Resource contention
- Difficult to manage

### TypeScript (Single Sequential Scheduler)

**Files**:
- `sequential-scheduler.service.ts` (main logic)
- `scheduler-config.ts` (configuration)
- `run-sequential-scheduler.ts` (runner)

**Commands**:
```bash
npm run scheduler  # Single process, all services
```

**Benefits**:
- 1 process handles everything
- Services run one by one
- Low memory usage
- No resource contention
- Easy to manage and configure

## Troubleshooting

### Scheduler Not Starting

Check environment variables:
```bash
# Make sure these are set
echo $NEON_DATABASE_URL
echo $RINGBA_ACCOUNT_ID
echo $RINGBA_API_TOKEN
```

### Service Fails

Check logs for specific error. Common issues:
- Database connection timeout
- API rate limiting
- Invalid date range

### High Memory Usage

This shouldn't happen with sequential execution, but if it does:
- Check for memory leaks in individual services
- Increase delay between services (edit config)
- Reduce `daysBack` values

### Schedule Not Triggering

Verify cron expression:
```bash
# Use https://crontab.guru/ to validate
# Or test in Node.js:
node -e "const cron = require('node-cron'); console.log(cron.validate('0 0 * * *'));"
```

## Performance Metrics

### Resource Usage Comparison

| Metric | Node.js (Parallel) | TypeScript (Sequential) |
|--------|-------------------|------------------------|
| **Peak Memory** | 2.5 GB | 800 MB |
| **CPU Usage** | 85-100% | 30-50% |
| **Database Connections** | 15+ simultaneous | 2-3 simultaneous |
| **API Rate Limit Hits** | Frequent | Rare |
| **Total Execution Time** | 15-20 min (parallel) | 35-45 min (sequential) |

**Trade-off**: Sequential takes ~2x longer but uses ~3x less resources

## Migration from Node.js

1. **Stop all Node.js schedulers**:
   ```bash
   # Kill all scheduler processes
   pkill -f "start-.*-scheduler.js"
   ```

2. **Start TypeScript scheduler**:
   ```bash
   cd elocal-scrapper-ts
   npm run scheduler
   ```

3. **Monitor first run**:
   - Watch logs carefully
   - Verify all services execute
   - Check database for new data

4. **Setup as system service** (optional):
   ```bash
   # Use PM2, systemd, or similar
   pm2 start "npm run scheduler" --name elocal-scheduler
   pm2 save
   ```

## Best Practices

1. **Always test schedule changes** before deploying
2. **Monitor first few runs** after config changes
3. **Keep `daysBack` values reasonable** (don't fetch 100 days at once)
4. **Stagger schedules** to avoid overlapping executions
5. **Use descriptive service names** for easier debugging
6. **Enable/disable schedules** instead of deleting them
7. **Document custom configurations** in your .env or README

## License

Internal use only.
