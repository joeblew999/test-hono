import type { BroadcastConfig } from '../types';

// Type for CR-SQLite change record, based on Corrosion's 'change' event data
interface CrSqlChange {
  table: string;
  pk: string;
  cid: string;
  val: string;
  col_version: number;
  db_version: number;
  site_id: string;
}

let lastChangeId: string | null = null;
let currentBroadcastConfig: BroadcastConfig;

function broadcastCorrosionChange(change: CrSqlChange) {
  if (!currentBroadcastConfig) {
    console.error('Broadcast config not initialized yet.');
    return;
  }
  console.log('Broadcasting Corrosion change:', change);
  currentBroadcastConfig.broadcast({ type: 'corrosion_change', payload: change });
  lastChangeId = `${change.site_id}:${change.db_version}`;
}

// Establishes and manages the long-lived subscription stream
export async function startCorrosionSyncManager(db: D1Database, broadcastConfig: BroadcastConfig, corrosionAgentUrl: string) {
  console.log('Starting Corrosion Sync Manager...');
  currentBroadcastConfig = broadcastConfig;

  // Initialize lastChangeId from database if possible
  try {
    const lastChange = await db.prepare('SELECT site_id, MAX(db_version) as max_db_version FROM crsql_changes GROUP BY site_id ORDER BY max_db_version DESC LIMIT 1').first<{ site_id: string, max_db_version: number }>();
    if (lastChange?.site_id && lastChange?.max_db_version) {
      lastChangeId = `${lastChange.site_id}:${lastChange.max_db_version}`;
      console.log(`Initialized Corrosion Sync Manager with lastChangeId: ${lastChangeId}`);
    }
  } catch (error) {
    console.warn('Error initializing lastChangeId from crsql_changes, starting from beginning:', error);
  }

  const subscribeToCorrosionChanges = async () => {
    let url = `${corrosionAgentUrl}/v1/subscriptions`;
    const queryBody = { query: 'SELECT * FROM crsql_changes' };

    if (lastChangeId) {
      url += `?from=${lastChangeId}`;
    }

    try {
      console.log(`Subscribing to Corrosion changes from ${url}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryBody),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to subscribe to Corrosion: ${response.status} - ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Corrosion subscription stream closed.');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'change') {
              broadcastCorrosionChange(event.data as CrSqlChange);
              lastChangeId = `${(event.data as CrSqlChange).site_id}:${(event.data as CrSqlChange).db_version}`;
            }
          } catch (e) {
            console.error('Error parsing NDJSON line:', e, 'Line:', line);
          }
        }
      }
    } catch (error) {
      console.error('Corrosion subscription error:', error);
      console.log('Attempting to re-subscribe to Corrosion in 5 seconds...');
      await Bun.sleep(5000);
      subscribeToCorrosionChanges();
    }
  };

  subscribeToCorrosionChanges();
}
