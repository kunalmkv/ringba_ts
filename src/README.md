# eLocal Scrapper Service - TypeScript Version

This directory contains the TypeScript conversion of the elocal scrapper service, using **Neon DB** (serverless Postgres) instead of traditional PostgreSQL.

## 📁 Directory Structure

```
src-ts/
├── config/
│   └── database.ts          # Neon DB configuration
├── database/
│   └── neon-operations.ts   # Neon DB operations (replaces postgres-operations.js)
├── http/
│   └── elocal-client.ts     # eLocal API client
├── services/
│   └── fetch-elocal-calls.service.ts  # Fetch eLocal Calls service
├── types/
│   └── index.ts             # TypeScript type definitions
├── utils/
│   ├── date-normalizer.ts   # Date normalization utilities
│   ├── date-utils.ts        # Date range utilities
│   └── helpers.ts           # Helper functions
├── test/
│   └── test-service.ts      # Test runner
└── README.md
```

## 🚀 Setup

### 1. Install Dependencies

```bash
npm install --save-dev typescript @types/node tsx
npm install @neondatabase/serverless
```

### 2. Configure Neon Database

Create or update `.env.neon` file:

```env
NEON_DATABASE_URL=postgresql://user:password@ep-xxxxx.region.aws.neon.tech/dbname?sslmode=require
ELOCAL_API_KEY=your_elocal_api_key
```

### 3. Compile TypeScript

```bash
# Compile TypeScript to JavaScript
npx tsc

# Or use watch mode during development
npx tsc --watch
```

### 4. Run the Service

```bash
# Using tsx (TypeScript executor - no compilation needed)
npx tsx src-ts/test/test-service.ts current

# Or compile first, then run
npx tsc
node dist/test/test-service.js current

# Test different service types
npx tsx src-ts/test/test-service.ts historical
npx tsx src-ts/test/test-service.ts current
npx tsx src-ts/test/test-service.ts historical-api
npx tsx src-ts/test/test-service.ts current-api
```

## 🔧 Key Changes from JavaScript Version

### 1. **Neon DB Instead of PostgreSQL**
- Uses `@neondatabase/serverless` package
- Connection via connection string (no pool configuration needed)
- Serverless-friendly queries with Neon's query builder
- Tagged template literals for SQL queries

**Before (postgres-operations.js):**
```javascript
const pool = new Pool({
  host: config.dbHost,
  port: config.dbPort,
  database: config.dbName,
  // ...
});
```

**After (neon-operations.ts):**
```typescript
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.NEON_DATABASE_URL);
```

### 2. **TypeScript Type Safety**
- Comprehensive type definitions in `types/index.ts`
- Type-safe function parameters and return values
- IntelliSense support in IDEs
- Compile-time error checking

### 3. **Modern ES Modules**
- Full ESM support with `.js` extensions in imports
- `import` instead of `require`
- Type-safe exports

## 📊 Available Services

### STATIC Category (Main Campaign)
- `scrapeHistoricalData` - Past 10 days (excluding today)
- `scrapeCurrentDayData` - Current day only (timezone-aware)

### API Category (Secondary Campaign)
- `scrapeHistoricalDataAPI` - Past 10 days (API campaign)
- `scrapeCurrentDayDataAPI` - Current day (API campaign)

## 🔑 Configuration

The service uses environment variables from `.env.neon`:

- `NEON_DATABASE_URL` - Neon database connection string (required)
- `ELOCAL_API_KEY` - eLocal API key (required)

## 📝 Database Schema

The service expects the following tables in your Neon database:

1. **scraping_sessions** - Session tracking
2. **elocal_call_data** - Call data storage
3. **adjustment_details** - Adjustment details (STATIC category only)

See the original schema in the JavaScript version or use the existing PostgreSQL schema (Neon is PostgreSQL-compatible).

## 🧪 Testing

```bash
# Test current day service
npx tsx src-ts/test/test-service.ts current

# Test historical service
npx tsx src-ts/test/test-service.ts historical

# Test API category services
npx tsx src-ts/test/test-service.ts current-api
npx tsx src-ts/test/test-service.ts historical-api
```

## 🔄 Migration Strategy

This TypeScript version runs **independently** from the JavaScript version. You can:

1. **Run both in parallel** (test TypeScript while JavaScript is in production)
2. **Gradually migrate** other services one by one
3. **Switch entirely** once tested and validated

## 📦 NPM Scripts (Add to package.json)

```json
{
  "scripts": {
    "ts:build": "tsc",
    "ts:watch": "tsc --watch",
    "ts:test": "npx tsx src-ts/test/test-service.ts",
    "ts:test:current": "npx tsx src-ts/test/test-service.ts current",
    "ts:test:historical": "npx tsx src-ts/test/test-service.ts historical"
  }
}
```

## 🎯 Benefits of This Migration

1. **Type Safety** - Catch errors at compile time
2. **Better IDE Support** - IntelliSense, auto-completion
3. **Serverless Ready** - Neon DB works great with serverless environments
4. **Modern Syntax** - Latest TypeScript features
5. **Maintainability** - Easier to understand and modify
6. **Scalability** - Neon DB auto-scales based on usage

## 🔮 Next Steps

1. ✅ **elocal.scrapper** - Converted (this directory)
2. ⬜ **auth-refresh** - Not yet converted
3. ⬜ **ringba-campaign-summary** - Not yet converted
4. ⬜ **Other services** - To be converted one by one

## 💡 Tips

- Use `tsx` during development for instant TypeScript execution
- Use `tsc` to compile for production
- Keep both versions running during transition period
- Test thoroughly before switching production traffic

## 🐛 Troubleshooting

**"Cannot find module" errors:**
- Make sure you include `.js` extensions in imports (TypeScript requirement for ESM)
- Check that `tsconfig.json` has `"module": "ESNext"`

**Neon connection errors:**
- Verify `NEON_DATABASE_URL` is set correctly
- Check that your Neon project is active
- Ensure SSL mode is included in connection string

**Type errors:**
- Run `npx tsc --noEmit` to check for type errors without compiling
- Use `// @ts-ignore` sparingly for edge cases

## 📚 Resources

- [Neon Documentation](https://neon.tech/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [fp-ts Documentation](https://gcanti.github.io/fp-ts/)
