# Penthouse Mobile App Variants

This repo now supports three separate native mobile apps built from the same codebase:

1. `Penthouse Dispatch`
   Admin and company operations app
2. `Penthouse Driver`
   Driver-only app
3. `Penthouse Rider`
   Rider-only app

## What changed

- Browser deployment stays on the same web routes and Vercel flow.
- Mobile builds now use app variants:
  - `ops`
  - `driver`
  - `rider`
- Each variant has its own:
  - app name
  - bundle ID / application ID
  - deep-link URL scheme
  - iOS shell folder
  - Android shell folder

## Variant identities

### Ops
- App name: `Penthouse Dispatch`
- iOS bundle ID: `com.penthousedispatch.app`
- Android application ID: `com.penthousedispatch.app`
- Deep link scheme: `penthousedispatch`
- iOS path: `ios/App`
- Android path: `android`

### Driver
- App name: `Penthouse Driver`
- iOS bundle ID: `com.penthousedispatch.driver`
- Android application ID: `com.penthousedispatch.driver`
- Deep link scheme: `penthousedriver`
- iOS path: `ios-driver/App`
- Android path: `android-driver`

### Rider
- App name: `Penthouse Rider`
- iOS bundle ID: `com.penthousedispatch.rider`
- Android application ID: `com.penthousedispatch.rider`
- Deep link scheme: `penthouserider`
- iOS path: `ios-rider/App`
- Android path: `android-rider`

## Build commands

### Web bundles
- Ops: `npm run build:ops`
- Driver: `npm run build:driver`
- Rider: `npm run build:rider`

### Native sync
- Ops: `npm run mobile:sync`
- Driver: `npm run mobile:sync:driver`
- Rider: `npm run mobile:sync:rider`

### Full native rebuild + sync
- Ops: `npm run mobile:build`
- Driver: `npm run mobile:build:driver`
- Rider: `npm run mobile:build:rider`

### Open in Xcode
- Ops: `npm run mobile:ios`
- Driver: `npm run mobile:ios:driver`
- Rider: `npm run mobile:ios:rider`

### Open in Android Studio
- Ops: `npm run mobile:android`
- Driver: `npm run mobile:android:driver`
- Rider: `npm run mobile:android:rider`

## User experience by app

### Penthouse Dispatch
- Intended users: `admin`, `company`
- Keeps the full operations/admin experience

### Penthouse Driver
- Intended users: `driver`
- Opens directly into the Driver app flow
- Uses the existing driver login flow
- Does not expose company or admin dashboards

### Penthouse Rider
- Intended users: `rider`
- Riders can create an account or sign in
- Includes a Rider home screen for reopening ride links
- Still supports direct tracking links like `/rider?trip=...`

## Icon replacement

When you send the new Driver or Rider icons, replace the native app icon assets in:

- Ops iOS icons:
  - `ios/App/App/Assets.xcassets/AppIcon.appiconset`
- Driver iOS icons:
  - `ios-driver/App/App/Assets.xcassets/AppIcon.appiconset`
- Rider iOS icons:
  - `ios-rider/App/App/Assets.xcassets/AppIcon.appiconset`

- Ops Android icons:
  - `android/app/src/main/res/mipmap-*`
- Driver Android icons:
  - `android-driver/app/src/main/res/mipmap-*`
- Rider Android icons:
  - `android-rider/app/src/main/res/mipmap-*`

## Important note

The generated `capacitor.config.json` is rewritten automatically by the mobile scripts before each sync/open command. Always use the npm scripts above instead of running raw `npx cap sync` by hand.
