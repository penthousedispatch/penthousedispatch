import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseUrl = process.env.STORE_SHOT_BASE_URL || 'http://127.0.0.1:4174';
const outputRoot = process.env.STORE_SHOT_OUTPUT_DIR || path.join(process.cwd(), 'marketing', 'screenshots');

const sizes = [
  { label: 'ios-6.7', width: 1290, height: 2796 },
  { label: 'ios-6.5', width: 1242, height: 2688 },
];

const appShots = {
  dispatch: ['ops', 'dispatch', 'drivers', 'ai', 'payouts', 'marketplace'],
  driver: ['driver-home', 'driver-nav', 'driver-trip', 'driver-schedule', 'driver-history'],
  rider: ['rider-map', 'rider-details', 'rider-status', 'rider-share'],
};

const prefixes = {
  dispatch: 'dispatch',
  driver: 'driver',
  rider: 'rider',
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function captureScreenshot({ shot, width, height, outFile }) {
  const url = `${baseUrl}/?store-shot=${encodeURIComponent(shot)}`;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--virtual-time-budget=2500',
    `--window-size=${width},${height}`,
    `--screenshot=${outFile}`,
    url,
  ];

  const result = spawnSync(chromePath, args, {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Screenshot capture failed for ${shot}.`,
        result.stderr?.trim(),
        result.stdout?.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

function main() {
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome not found at ${chromePath}`);
  }

  for (const size of sizes) {
    for (const [app, shots] of Object.entries(appShots)) {
      const appDir = path.join(outputRoot, size.label, app);
      ensureDir(appDir);

      shots.forEach((shot, index) => {
        const outFile = path.join(
          appDir,
          `${String(index + 1).padStart(2, '0')}-${prefixes[app]}-${shot}.png`
        );

        captureScreenshot({
          shot,
          width: size.width,
          height: size.height,
          outFile,
        });

        console.log(`${size.label}/${app}: ${path.basename(outFile)}`);
      });
    }
  }
}

main();
