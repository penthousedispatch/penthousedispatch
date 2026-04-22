import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const variant = String(process.env.APP_VARIANT || 'ops').trim().toLowerCase();

const targetsByVariant = {
  ops: [
    path.join(root, 'ios', 'App', 'App', 'public'),
    path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public'),
  ],
  driver: [
    path.join(root, 'ios-driver', 'App', 'App', 'public'),
    path.join(root, 'android-driver', 'app', 'src', 'main', 'assets', 'public'),
  ],
  rider: [
    path.join(root, 'ios-rider', 'App', 'App', 'public'),
    path.join(root, 'android-rider', 'app', 'src', 'main', 'assets', 'public'),
  ],
};

const targets = targetsByVariant[variant] || targetsByVariant.ops;

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed stale native web bundle: ${target}`);
}
