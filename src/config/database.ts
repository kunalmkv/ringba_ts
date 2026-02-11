import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load secrets from env file: .env first (cwd), then .env.neon (cwd + project root)
dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.neon') });
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env.neon') });

export interface DatabaseConfig {
  connectionString: string;
}

export const getDatabaseConfig = (): DatabaseConfig => {
  const connectionString = process.env.NEON_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'NEON_DATABASE_URL is not set. Set it in .env or .env.neon.'
    );
  }

  return {
    connectionString,
  };
};

export const createNeonClient = () => {
  const config = getDatabaseConfig();
  return neon(config.connectionString, {
    fetchOptions: {
      cache: 'no-store',
    },
    fullResults: false,
    arrayMode: false,
  });
};
