/** Read-only verification: no regeneration, source writes, network, or GPU. */
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--test','tests/migration-integrity.test.mjs','tests/ability-adapter.test.mjs'], { stdio:'inherit', cwd:new URL('..',import.meta.url) });
process.exit(result.status ?? 1);
