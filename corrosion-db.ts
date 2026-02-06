import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A simple HTTP client to interact with the Corrosion agent's API
export class CorrosionHttpClient {
  private baseUrl: string;

  constructor(corrosionAgentUrl: string) {
    this.baseUrl = corrosionAgentUrl;
  }

  // Executes a read query using the /v1/queries endpoint
  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    // TODO: Implement proper parameter binding for the Corrosion HTTP API.
    // The current implementation assumes { query: sql, params: params }
    const response = await fetch(`${this.baseUrl}/v1/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql, params: params }),
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
    // The current implementation assumes { transaction: sql, params: params }
    const response = await fetch(`${this.baseUrl}/v1/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction: sql, params: params }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Corrosion transaction failed: ${response.status} - ${errorText}`);
    }
  }
}

// Adapts the CorrosionHttpClient to the D1Database interface (same pattern as db.ts)
export function createCorrosionCompat(client: CorrosionHttpClient): D1Database {
  return {
    prepare(sql: string) {
      let currentParams: any[] = [];

      return {
        bind(...params: any[]) {
          currentParams = params;
          return this;
        },
        async first<T>(): Promise<T | null> {
          const results = await client.query<T>(sql, currentParams);
          return results.length > 0 ? results[0]! : null;
        },
        async all<T>(): Promise<D1Result<T>> {
          const results = await client.query<T>(sql, currentParams);
          return { results, success: true, meta: {} } as D1Result<T>;
        },
        async run() {
          await client.transaction(sql, currentParams);
          return {} as D1Response;
        },
      } as any;
    },
    async exec(query: string) {
      await client.transaction(query);
      return {} as D1Response;
    },
  } as any;
}

// Utility function to apply a CR-SQLite changeset to the Corrosion agent
export async function applyCrSqlChanges(db: D1Database, changeset: any[]): Promise<void> {
  for (const change of changeset) {
    const sql = `INSERT INTO crsql_changes ("table", pk, cid, val, col_version, db_version, site_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await db.prepare(sql).bind(
      change.table,
      change.pk,
      change.cid,
      change.val,
      change.col_version,
      change.db_version,
      change.site_id
    ).run();
  }
}

// Function to initialize Corrosion and return a D1Database compatible object
export async function initCorrosionDB(corrosionAgentUrl: string): Promise<D1Database> {
  const client = new CorrosionHttpClient(corrosionAgentUrl);
  const db = createCorrosionCompat(client);

  // Apply migrations via Corrosion's HTTP API
  try {
    const migrationsDir = join(import.meta.dir, 'migrations');
    const files = readdirSync(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    for (const file of sqlFiles) {
      const sqlContent = readFileSync(join(migrationsDir, file), 'utf-8');
      console.log(`Applying migration: ${file}`);
      await db.exec(sqlContent);
    }
    console.log('Corrosion migrations applied successfully.');
  } catch (error) {
    console.error('Error applying Corrosion migrations:', error);
    throw error;
  }

  return db;
}
