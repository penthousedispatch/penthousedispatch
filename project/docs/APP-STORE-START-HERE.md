# Penthouse Dispatch App Store Start Here

This is the simple checklist to finish App Store and Google Play submission without losing progress.

## What is already done

- Mobile wrapper added with Capacitor
- iOS shell created
- Android shell created
- Branded icon and splash assets added
- Mobile auth/password-reset deep links prepared
- App Store and Google Play runbooks written
- Screenshot plan written
- Privacy policy outline written
- Store listing text written

## Important files

- Apple runbook:
  - `docs/apple-submission-runbook.md`
- Google runbook:
  - `docs/google-play-runbook.md`
- Store listing text:
  - `docs/app-store-submission-pack.md`
- Apple field worksheet:
  - `docs/app-store-connect-fields.md`
- Google field worksheet:
  - `docs/google-play-fields.md`
- Screenshot plan:
  - `docs/app-store-screenshot-plan.md`
- Screenshot captions:
  - `docs/store-screenshot-captions.md`
- Privacy policy outline:
  - `docs/privacy-policy-outline.md`
- Privacy/data worksheet:
  - `docs/store-privacy-data-worksheet.md`
- Mobile device QA:
  - `docs/mobile-device-qa-checklist.md`

## Step by step for dummies

### Step 1. Do not change the live browser app

Keep using the normal web app exactly as you have been.

If you change app code later:

1. edit the web app in `src/`
2. run:

```bash
cd "/Users/penthouse/Documents/New project/project"
npm run mobile:build
```

That updates the mobile wrappers without changing the Vercel site.

### Step 2. Open the mobile projects

From:

```bash
cd "/Users/penthouse/Documents/New project/project"
```

Open iPhone project:

```bash
npm run mobile:ios
```

Open Android project:

```bash
npm run mobile:android
```

### Step 3. Test on real devices

Use:

- `docs/mobile-device-qa-checklist.md`

Minimum things to test:
- sign in
- sign out
- password reset
- company dashboard
- driver app
- rider preview
- maps
- photo upload

### Step 4. Create Apple app record

Use:

- `docs/apple-submission-runbook.md`
- `docs/app-store-connect-fields.md`

Basic values:
- App name: `Penthouse Dispatch`
- Bundle ID: `com.penthousedispatch.app`
- SKU: `PD-IOS-001`

### Step 5. Create Google Play app record

Use:

- `docs/google-play-runbook.md`
- `docs/google-play-fields.md`

Basic values:
- App name: `Penthouse Dispatch`
- Package name: `com.penthousedispatch.app`

### Step 6. Make screenshots

Use:

- `docs/app-store-screenshot-plan.md`
- `docs/store-screenshot-captions.md`

Capture in this order:
1. Admin Ops Center
2. Company Dispatch Dashboard
3. Company Drivers
4. Driver App
5. Rider Tracking
6. AI Settings
7. Driver Pay
8. Marketplace

### Step 7. Finish privacy policy

Use:

- `docs/privacy-policy-outline.md`
- `docs/store-privacy-data-worksheet.md`

Before submission:
- host the final privacy policy on your real website
- use that public link in Apple and Google

### Step 8. Upload the first builds

#### Apple

1. open Xcode
2. open `ios/App/App.xcodeproj`
3. archive build
4. upload to App Store Connect
5. test in TestFlight first

#### Android

1. open Android Studio
2. open the `android` project
3. generate signed App Bundle
4. upload to internal testing first
5. test before production

## What is left

- Run full real-device QA pass
- Capture final screenshots
- Publish privacy policy page
- Create Apple app record
- Create Google Play app record
- Upload iOS build to TestFlight
- Upload Android build to internal testing
- Verify password reset deep link on mobile
- Verify map/location permissions on mobile

## Best next action

If you only do one thing next:

1. open the iPhone app with `npm run mobile:ios`
2. test sign in + password reset + driver app + rider app

That will tell you whether the app is truly ready to submit.
