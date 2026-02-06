import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database, D1Result, D1Response } from './types'; // Assuming types.ts defines these

// A simple HTTP client to interact with the Corrosion agent's API
class CorrosionHttpClient {
  private baseUrl: string;

  constructor(corrosionAgentUrl: string) {
    this.baseUrl = corrosionAgentUrl;
  }

  // Executes a read query using the /v1/queries endpoint
  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    // TODO: Implement proper parameter binding for the Corrosion HTTP API.
    // The current implementation just sends the raw SQL. Corrosion's API might
    // expect parameters in a separate field or a specific format.
    const response = await fetch(`${this.baseUrl}/v1/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql, params: params }), // Assuming Corrosion API expects { query: string, params: any[] }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Corrosion query failed: ${response.status} - ${errorText}`);
    }

    // Assuming the response body is an array of results
    return (await response.json()) as T[];
  }

  // Executes a write transaction using the /v1/transactions endpoint
  async transaction(sql: string, params: any[] = []): Promise<void> {
    // TODO: Implement proper parameter binding for the Corrosion HTTP API.
    const response = await fetch(`${this.baseUrl}/v1/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction: sql, params: params }), // Assuming Corrosion API expects { transaction: string, params: any[] }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Corrosion transaction failed: ${response.status} - ${errorText}`);
    }
  }
}

// Adapts the CorrosionHttpClient to the D1Database interface
export function createCorrosionCompat(client: CorrosionHttpClient): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: any[]) {
          return {
            async first<T>(): Promise<T | null> {
              const results = await client.query<T>(sql, params);
              return results.length > 0 ? results[0] : null;
            },
            async all<T>(): Promise<D1Result<T>> {
              const results = await client.query<T>(sql, params);
              // TODO: Map Corrosion HTTP API response to D1Result structure, including meta data if available.
              return { results, success: true, meta: {} };
            },
            async run(): Promise<D1Response> {
              await client.transaction(sql, params);
              // TODO: Map Corrosion HTTP API response to D1Response structure, including meta data (e.g., changes, lastRowId).
              return { success: true, meta: {} };
            },
          };
        },
        async first<T>(): Promise<T | null> {
          const results = await client.query<T>(sql);
          return results.length > 0 ? results[0] : null;
        },
        async all<T>(): Promise<D1Result<T>> {
          const results = await client.query<T>(sql);
          return { results, success: true, meta: {} };
        },
        async run(): Promise<D1Response> {
          await client.transaction(sql);
          return { success: true, meta: {} };
        },
      } as any;
    },
  } as any;
}

// Function to initialize Corrosion and return a D1Database compatible object
export async function initCorrosionDB(corrosionAgentUrl: string): Promise<D1Database> {
  const client = new CorrosionHttpClient(corrosionAgentUrl);
  const db = createCorrosionCompat(client);

  // Apply migrations via Corrosion's HTTP API
  // This assumes the `migrations` directory is structured similarly to `db.ts`
  // and that the Corrosion agent can execute DDL statements via /v1/transactions
  try {
    const migrationsDir = join(import.meta.dir, 'migrations');
    const files = readdirSync(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    for (const file of sqlFiles) {
      const sqlContent = readFileSync(join(migrationsDir, file), 'utf-8');
      console.log(`Applying migration: ${file}`);
      await client.transaction(sqlContent);
    }
    console.log('Corrosion migrations applied successfully.');
  } catch (error) {
    console.error('Error applying Corrosion migrations:', error);
    throw error; // Re-throw to indicate a critical initialization failure
  }

  return db;
}
