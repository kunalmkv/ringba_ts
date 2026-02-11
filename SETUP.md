# Setup Guide

## Complete Setup Instructions

Follow these steps to set up the TypeScript eLocal Scrapper project from scratch.

### Step 1: Navigate to Project Directory

```bash
cd /Users/rajeev/Desktop/adstia/elocal-scrapper/elocal-scrapper-ts
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install:
- **Runtime Dependencies:**
  - `@neondatabase/serverless` - Neon DB client
  - `dotenv` - Environment variable management
  - `fp-ts` - Functional programming utilities
  - `node-fetch` - HTTP client

- **Dev Dependencies:**
  - `typescript` - TypeScript compiler
  - `@types/node` - Node.js type definitions
  - `tsx` - TypeScript executor (no compilation needed)

### Step 3: Configure Environment

Secrets are loaded from **`.env`** first, then **`.env.neon`** (in the project directory). Create either file:

```bash
cp .env.neon.example .env.neon
# or use .env with the same variable names
```

Edit `.env.neon` (or `.env`) with your credentials:

```env
NEON_DATABASE_URL=postgresql://your-user:your-password@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
ELOCAL_API_KEY=your_elocal_api_key_here
```

#### Getting Neon Database URL:

1. Go to [Neon Console](https://console.neon.tech/)
2. Select your project
3. Go to "Connection Details"
4. Copy the connection string (make sure `?sslmode=require` is included)

#### Getting eLocal API Key:

Contact your eLocal account manager or check your eLocal dashboard.

### Step 4: Set Up Database Schema

Connect to your Neon database and run the following SQL:

```sql
-- Table: scraping_sessions
CREATE TABLE IF NOT EXISTS scraping_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(50),
  calls_scraped INTEGER,
  adjustments_scraped INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table: elocal_call_data
CREATE TABLE IF NOT EXISTS elocal_call_data (
  id SERIAL PRIMARY KEY,
  caller_id VARCHAR(50) NOT NULL,
  date_of_call VARCHAR(50) NOT NULL,
  campaign_phone VARCHAR(50),
  payout DECIMAL(10, 2),
  category VARCHAR(20),
  city_state VARCHAR(100),
  zip_code VARCHAR(20),
  screen_duration INTEGER,
  post_screen_duration INTEGER,
  total_duration INTEGER,
  assessment VARCHAR(100),
  classification VARCHAR(100),
  adjustment_time VARCHAR(50),
  adjustment_amount DECIMAL(10, 2),
  adjustment_classification VARCHAR(100),
  adjustment_duration INTEGER,
  unmatched BOOLEAN DEFAULT FALSE,
  ringba_inbound_call_id VARCHAR(100),
  original_payout DECIMAL(10, 2),
  original_revenue DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caller_date_category ON elocal_call_data(caller_id, date_of_call, category);
CREATE INDEX IF NOT EXISTS idx_date_of_call ON elocal_call_data(date_of_call);
CREATE INDEX IF NOT EXISTS idx_category ON elocal_call_data(category);

-- Table: adjustment_details
CREATE TABLE IF NOT EXISTS adjustment_details (
  id SERIAL PRIMARY KEY,
  time_of_call VARCHAR(50),
  adjustment_time VARCHAR(50),
  campaign_phone VARCHAR(50),
  caller_id VARCHAR(50),
  duration INTEGER,
  call_sid VARCHAR(100),
  amount DECIMAL(10, 2),
  classification VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adjustment_caller ON adjustment_details(caller_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_call_sid ON adjustment_details(call_sid);
```

### Step 5: Verify Installation

Check TypeScript compilation:

```bash
npm run build
```

Run a quick smoke test (no DB/API required):

```bash
npm run test:smoke
```

You should see: `✓ Smoke test passed (no DB/API used).`

### Step 6: Run Tests

Test the service with different modes:

```bash
# Test current day service (STATIC category)
npm run test:current

# Test historical service (past 10 days)
npm run test:historical

# Test API category services
npm run test:current-api
npm run test:historical-api
```

### Step 7: Development Workflow

For active development:

```bash
# Terminal 1: Watch and compile TypeScript
npm run watch

# Terminal 2: Run with tsx (instant execution, no compilation)
npm run dev
```

Or simply use tsx directly:

```bash
npx tsx src/test/test-service.ts current
```

## Verification Checklist

- [ ] Dependencies installed (`node_modules` folder exists)
- [ ] `.env.neon` file created with valid credentials
- [ ] Neon database schema created
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] Test runs successfully (`npm run test:current`)

## Troubleshooting

### Issue: "Cannot find module" errors

**Solution:** Make sure all imports use `.js` extensions:
```typescript
import { something } from './module.js'; // Correct
import { something } from './module';    // Wrong
```

### Issue: "NEON_DATABASE_URL is not set"

**Solution:**
1. Verify `.env.neon` file exists
2. Check the file contains `NEON_DATABASE_URL=...`
3. Restart your terminal/IDE

### Issue: TypeScript compilation errors

**Solution:**
```bash
# Clean and rebuild
npm run clean
npm run build
```

### Issue: Database connection errors

**Solution:**
1. Verify Neon project is active (not suspended)
2. Check connection string includes `?sslmode=require`
3. Test connection using psql:
   ```bash
   psql "postgresql://user:pass@host/db?sslmode=require"
   ```

## Next Steps

Once setup is complete:

1. **Review the code** in `src/services/fetch-elocal-calls.service.ts`
2. **Understand the types** in `src/types/index.ts`
3. **Customize as needed** for your specific use case
4. **Deploy** to your production environment

## Support

- Check `README.md` for detailed documentation
- Review Neon documentation: https://neon.tech/docs
- Review TypeScript handbook: https://www.typescriptlang.org/docs/

---

Happy coding! 🚀
