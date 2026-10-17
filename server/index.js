#!/usr/bin/env node
// Entry point: `npm start` (PORT, HOST, BOTS, MAX_PLAYERS, DATA_DIR, STATIC_DIR, WORLD_SEED env vars).
import { startServer } from './app.js';

const srv = await startServer();
let closing = false;
async function shutdown(sig) {
  if (closing) return;
  closing = true;
  console.log(`[aetherion] ${sig}: saving characters and shutting down`);
  const force = setTimeout(() => process.exit(1), 8000);
  try { await srv.close(); } finally { clearTimeout(force); process.exit(0); }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
