# eLocal Scrapper - TypeScript + Neon DB

A complete TypeScript rewrite of the eLocal scrapper service using **Neon DB** (serverless Postgres).

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd elocal-scrapper-ts
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your credentials:

```bash
cp .env.neon.example .env.neon
```

Edit `.env.neon`:
```env
NEON_DATABASE_URL=postgresql://user:password@ep-xxxxx.region.aws.neon.tech/dbname?sslmode=require
ELOCAL_API_KEY=your_elocal_api_key
```

### 3. Run Tests

```bash
# Test current day service (STATIC category)
npm run test:current

# Test historical service (past 10 days)
npm run test:historical

# Test API category services
npm run test:current-api
npm run test:historical-api
```

### 4. Build for Production

```bash
# Compile TypeScript to JavaScript
npm run build

# Run compiled version
npm start
```

## 📁 Project Structure

```
elocal-scrapper-ts/
├── src/
│   ├── config/
│   │   └── database.ts          # Neon DB configuration
│   ├── database/
│   │   └── neon-operations.ts   # Database operations
│   ├── http/
│   │   └── elocal-client.ts     # eLocal API client
│   ├── services/
│   │   └── fetch-elocal-calls.service.ts  # Fetch eLocal Calls service
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   ├── utils/
│   │   ├── date-normalizer.ts   # Date normalization
│   │   ├── date-utils.ts        # Date utilities
│   │   └── helpers.ts           # Helper functions
│   └── test/
│       └── test-service.ts      # Test runner
├── dist/                         # Compiled output (generated)
├── package.json
├── tsconfig.json
├── .env.neon                     # Your config (create this)
├── .env.neon.example
├── .gitignore
└── README.md
```

## 🔧 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch mode for development |
| `npm run dev` | Run with tsx (no compilation needed) |
| `npm run test:current` | Test current day service |
| `npm run test:historical` | Test historical service (10 days) |
| `npm run test:current-api` | Test API category current day |
| `npm run test:historical-api` | Test API category historical |
| `npm start` | Run compiled version |
| `npm run clean` | Remove dist folder |

## 🎯 Features

### ✅ Type Safety
- Full TypeScript with strict mode enabled
- Comprehensive type definitions
- IntelliSense support in IDEs
- Compile-time error checking

### ✅ Neon DB Integration
- Serverless PostgreSQL database
- Connection via connection string
- Tagged template literals for SQL safety
- Auto-scaling based on usage

### ✅ Service Categories

**STATIC Category (Main Campaign)**
- UUID: `dce224a6-f813-4cab-a8c6-972c5a1520ab`
- Includes adjustment processing
- Historical and current day services

**API Category (Secondary Campaign)**
- UUID: `4534924c-f52b-4124-981b-9d2670b2af3e`
- No adjustments
- Historical and current day services

### ✅ Date Handling
- Timezone-aware date ranges (IST)
- Automatic date normalization
- Multiple date format support
- No timezone conversion (preserves eLocal times)

## 🗄️ Database Schema

The service expects these tables in your Neon database:

### 1. scraping_sessions
```sql
CREATE TABLE scraping_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(50),
  calls_scraped INTEGER,
  adjustments_scraped INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. elocal_call_data
```sql
CREATE TABLE elocal_call_data (
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

CREATE INDEX idx_caller_date_category ON elocal_call_data(caller_id, date_of_call, category);
CREATE INDEX idx_date_of_call ON elocal_call_data(date_of_call);
```

### 3. adjustment_details
```sql
CREATE TABLE adjustment_details (
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

CREATE INDEX idx_adjustment_caller ON adjustment_details(caller_id);
```

## 📊 Usage Example

```typescript
import { scrapeCurrentDayData } from './services/fetch-elocal-calls.service.js';

const config = {
  elocalApiKey: process.env.ELOCAL_API_KEY,
  neonDatabaseUrl: process.env.NEON_DATABASE_URL,
};

const result = await scrapeCurrentDayData(config);

console.log('Total Calls:', result.summary.totalCalls);
console.log('Total Payout:', result.summary.totalPayout);
console.log('Unique Callers:', result.summary.uniqueCallers);
```

## 🔄 Migration from JavaScript Version

This is a **complete standalone project**. You can:

1. Run both versions in parallel
2. Gradually switch traffic from JS to TS version
3. Test thoroughly before deprecating JS version

## 🐛 Troubleshooting

**Cannot find module errors:**
- Ensure `.js` extensions in imports (required for ESM)
- Check `tsconfig.json` has `"module": "ESNext"`

**Neon connection errors:**
- Verify `NEON_DATABASE_URL` is correctly set
- Check SSL mode is included: `?sslmode=require`
- Ensure Neon project is active

**Type errors during development:**
```bash
# Check types without compiling
npx tsc --noEmit
```

## 📚 Tech Stack

- **TypeScript 5.7+** - Type safety and modern JavaScript
- **Neon DB** - Serverless PostgreSQL
- **fp-ts** - Functional programming utilities
- **Node Fetch** - HTTP client
- **tsx** - TypeScript executor for development

## 🔐 Security

- Environment variables for sensitive data
- SQL injection prevention via parameterized queries
- No credentials in code
- `.gitignore` prevents accidental commits

## 📝 Next Steps

1. ✅ eLocal Scrapper - Converted (this project)
2. ⬜ Auth Refresh Service - TODO
3. ⬜ Ringba Campaign Summary - TODO
4. ⬜ Other services - TODO

## 💡 Development Tips

```bash
# Development with auto-reload
npm run watch

# In another terminal
npm run dev

# Or use tsx directly
npx tsx src/test/test-service.ts current
```

## 📞 Support

For issues or questions:
- Check the troubleshooting section
- Review Neon DB documentation
- Verify environment variables are set correctly

---

Built with ❤️ using TypeScript and Neon DB
