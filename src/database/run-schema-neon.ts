#!/usr/bin/env node
/**
 * Run schema.sql on Neon DB.
 * Loads NEON_DATABASE_URL from .env / .env.neon and executes schema.sql.
 *
 * Usage: npx tsx src/database/run-schema-neon.ts
 *    or: npm run schema:neon
 */
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createNeonClient } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env.neon') });

function loadSchemaPath(): string {
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(process.cwd(), 'src', 'database', 'schema.sql'),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, 'utf8');
      return p;
    } catch {
      continue;
    }
  }
  throw new Error('schema.sql not found');
}

function splitStatements(content: string): string[] {
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const statements: string[] = [];
  let current = '';
  let inParens = 0;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === '(') inParens++;
    else if (c === ')') inParens--;
    else if (c === ';' && inParens === 0) {
      const stmt = current.replace(/^\s*--[^\n]*\n/gm, '').trim();
      if (stmt.length > 0) statements.push(stmt);
      current = '';
      continue;
    }
    current += c;
  }
  const stmt = current.replace(/^\s*--[^\n]*\n/gm, '').trim();
  if (stmt.length > 0) statements.push(stmt);
  return statements;
}

async function main() {
  console.log('[schema:neon] Loading schema...');
  const schemaPath = loadSchemaPath();
  const content = readFileSync(schemaPath, 'utf8');
  const statements = splitStatements(content);
  console.log(`[schema:neon] Found ${statements.length} statements.`);

  const sql = createNeonClient();
  let ok = 0;
  let err = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 60).replace(/\s+/g, ' ') + (stmt.length > 60 ? '...' : '');
    try {
      await sql.query(stmt, []);
      ok++;
      console.log(`[schema:neon] OK (${i + 1}/${statements.length}): ${preview}`);
    } catch (e) {
      err++;
      console.error(`[schema:neon] FAIL (${i + 1}/${statements.length}): ${preview}`);
      console.error((e as Error).message);
    }
  }
  console.log(`[schema:neon] Done. ${ok} succeeded, ${err} failed.`);
  process.exit(err > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[schema:neon]', (e as Error).message);
  process.exit(1);
});
