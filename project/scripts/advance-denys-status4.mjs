#!/usr/bin/env node
/** @deprecated Use `advance-denys-trip-status.mjs --status=4` */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const main = path.join(dir, 'advance-denys-trip-status.mjs');
const forwarded = process.argv.slice(2).filter((a) => !a.startsWith('--status=') && !a.startsWith('--step='));
const r = spawnSync(process.execPath, [main, ...forwarded, '--status=4'], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
