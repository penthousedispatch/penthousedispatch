# Penthouse Mobile Store Submission Suite

This is the master submission sheet for the three native mobile apps:

1. `Penthouse Dispatch`
   Admin and company operations app
2. `Penthouse Driver`
   Driver-only app
3. `Penthouse Rider`
   Rider-only app

Use this file together with:

- [/Users/penthouse/Documents/New project/project/docs/app-store-connect-all-apps.md](/Users/penthouse/Documents/New%20project/project/docs/app-store-connect-all-apps.md)
- [/Users/penthouse/Documents/New project/project/docs/google-play-all-apps.md](/Users/penthouse/Documents/New%20project/project/docs/google-play-all-apps.md)
- [/Users/penthouse/Documents/New project/project/docs/store-screenshot-manifest-all-apps.md](/Users/penthouse/Documents/New%20project/project/docs/store-screenshot-manifest-all-apps.md)

## App identities

### 1. Penthouse Dispatch

- App purpose: Admin and company operations
- iOS bundle ID: `com.penthousedispatch.app`
- Android package: `com.penthousedispatch.app`
- SKU: `PD-OPS-IOS-001`
- Deep link scheme: `penthousedispatch`

### 2. Penthouse Driver

- App purpose: Driver sign-in, work shift, navigation, trip status, schedule
- iOS bundle ID: `com.penthousedispatch.driver`
- Android package: `com.penthousedispatch.driver`
- SKU: `PD-DRIVER-IOS-001`
- Deep link scheme: `penthousedriver`

### 3. Penthouse Rider

- App purpose: Rider tracking, trip progress, live ETA, simple account access
- iOS bundle ID: `com.penthousedispatch.rider`
- Android package: `com.penthousedispatch.rider`
- SKU: `PD-RIDER-IOS-001`
- Deep link scheme: `penthouserider`

## Shared company information

- Primary domain: `https://www.penthousedps.com`
- Support email: `support@penthousedps.com`
- Support URL: `https://www.penthousedps.com`
- Marketing URL: `https://www.penthousedps.com`
- Privacy policy URL: publish a final public page on `penthousedps.com` before submission

## What is already done in code

- Separate iOS wrappers exist for ops, driver, and rider
- Separate Android wrappers exist for ops, driver, and rider
- Driver and rider icons are updated
- Mobile build commands exist for all three apps
- Driver scheduling now stores pickup and dropoff timing more cleanly
- Scheduler now supports traffic-aware weighting and traffic buffer settings

## Required manual store-account steps still outside the repo

1. Create Apple app records in App Store Connect
2. Create Google Play app records in Play Console
3. Publish the final privacy policy page
4. Capture final device screenshots in the order from the screenshot manifest
5. Upload first iOS archives to TestFlight
6. Upload first Android app bundles to Internal Testing

## Exact build commands

Run from:

```bash
cd "/Users/penthouse/Documents/New project/project"
```

### Admin / Company app

```bash
npm run mobile:build
npm run mobile:ios
npm run mobile:android
```

### Driver app

```bash
npm run mobile:build:driver
npm run mobile:ios:driver
npm run mobile:android:driver
```

### Rider app

```bash
npm run mobile:build:rider
npm run mobile:ios:rider
npm run mobile:android:rider
```

## Current known non-blocking issue

- The main JavaScript bundle is still large after minification.
- This is not an App Store Connect blocker by itself.
- It is a performance polish item for a later chunk-splitting pass.

## Best next action

1. Open the three App Store Connect records
2. Open the three Play Console records
3. Use the all-app field sheets to fill every listing
4. Capture the screenshot set in the order from the screenshot manifest
5. Upload builds to TestFlight and Internal Testing
