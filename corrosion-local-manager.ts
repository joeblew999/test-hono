// corrosion-local-manager.ts
import { spawn } from 'bun';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Define constants for Corrosion management
const CORROSION_BIN_PATH = './bin/corrosion';
const CORROSION_DATA_DIR = './corrosion_data';
const CORROSION_AGENT_URL = 'http://localhost:8080';
const CORROSION_PORT = '8080';
const CORROSION_LOG_FILE = '.wrangler/corrosion.log';

let corrosionProcess: ReturnType<typeof spawn> | null = null;

async function isCorrosionAgentRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${CORROSION_AGENT_URL}/health`, { signal: AbortSignal.timeout(500) });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function startLocalCorrosionAgent(): Promise<string> {
  if (await isCorrosionAgentRunning()) {
    console.log(`Corrosion agent already running at ${CORROSION_AGENT_URL}`);
    return CORROSION_AGENT_URL;
  }

  if (!existsSync(CORROSION_BIN_PATH)) {
    throw new Error(`Corrosion binary not found at ${CORROSION_BIN_PATH}. Please run 'task corrosion:install'.`);
  }

  mkdirSync(CORROSION_DATA_DIR, { recursive: true });
  mkdirSync(join(import.meta.dir, '.wrangler'), { recursive: true });

  console.log('Starting local Corrosion agent...');
  corrosionProcess = spawn({
    cmd: [
      CORROSION_BIN_PATH,
      '-http-addr', `:${CORROSION_PORT}`,
      '-data-dir', CORROSION_DATA_DIR
    ],
    stdout: Bun.file(CORROSION_LOG_FILE),
    stderr: 'inherit',
  });

  // Wait for the agent to be ready
  let attempts = 0;
  const maxAttempts = 30; // 30 * 200ms = 6 seconds
  while (!(await isCorrosionAgentRunning()) && attempts < maxAttempts) {
    await Bun.sleep(200);
    attempts++;
  }

  if (!(await isCorrosionAgentRunning())) {
    throw new Error('Failed to start local Corrosion agent within the timeout.');
  }

  console.log(`Corrosion agent started and ready at ${CORROSION_AGENT_URL}`);
  return CORROSION_AGENT_URL;
}

export function stopLocalCorrosionAgent() {
  if (corrosionProcess) {
    console.log('Stopping local Corrosion agent...');
    corrosionProcess.kill();
    corrosionProcess = null;
    console.log('Local Corrosion agent stopped.');
  }
}

// Ensure Corrosion process is stopped on application exit
process.on('beforeExit', () => {
  stopLocalCorrosionAgent();
});

process.on('SIGINT', () => {
  stopLocalCorrosionAgent();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopLocalCorrosionAgent();
  process.exit(0);
});
