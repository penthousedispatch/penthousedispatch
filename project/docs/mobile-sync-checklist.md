# Mobile Sync Checklist

Use this every time the web app changes and you want the native apps to match.

Run from:

```bash
cd "/Users/penthouse/Documents/New project/project"
```

## Admin / Company app

```bash
npm run mobile:build
```

## Driver app

```bash
npm run mobile:build:driver
```

## Rider app

```bash
npm run mobile:build:rider
```

## What these do

Each command:

1. writes the correct Capacitor config for that app
2. rebuilds the matching web bundle
3. syncs the latest web code into the native iOS and Android wrapper

## Important rule

If you change the web app and do not run the matching mobile build, the phone app can lag behind the website.

## Tonight's state

After the latest work, re-run all three before device testing or archive upload:

```bash
npm run mobile:build
npm run mobile:build:driver
npm run mobile:build:rider
```
