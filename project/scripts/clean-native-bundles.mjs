import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const targets = [
  path.join(root, 'ios', 'App', 'App', 'public'),
  path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public'),
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed stale native web bundle: ${target}`);
}
