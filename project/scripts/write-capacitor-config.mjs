import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const variant = String(process.env.APP_VARIANT || 'ops').trim().toLowerCase();

const selected = {
  ops: {
    appId: 'com.penthousedispatch.app',
    appName: 'Penthouse Dispatch',
    webDir: 'dist',
    scheme: 'penthousedispatch',
    iosPath: 'ios',
    androidPath: 'android',
  },
  driver: {
    appId: 'com.penthousedispatch.driver',
    appName: 'Penthouse Driver',
    webDir: 'dist-driver',
    scheme: 'penthousedriver',
    iosPath: 'ios-driver',
    androidPath: 'android-driver',
  },
  rider: {
    appId: 'com.penthousedispatch.rider',
    appName: 'Penthouse Rider',
    webDir: 'dist-rider',
    scheme: 'penthouserider',
    iosPath: 'ios-rider',
    androidPath: 'android-rider',
  },
}[variant] || {
  appId: 'com.penthousedispatch.app',
  appName: 'Penthouse Dispatch',
  webDir: 'dist',
  scheme: 'penthousedispatch',
  iosPath: 'ios',
  androidPath: 'android',
};

const config = {
  appId: selected.appId,
  appName: selected.appName,
  webDir: selected.webDir,
  ios: {
    path: selected.iosPath,
    scheme: selected.scheme,
  },
  android: {
    path: selected.androidPath,
  },
};

fs.writeFileSync(
  path.join(root, 'capacitor.config.json'),
  `${JSON.stringify(config, null, 2)}\n`,
  'utf8'
);

console.log(`Wrote capacitor.config.json for ${variant}.`);
