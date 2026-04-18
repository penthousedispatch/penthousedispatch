# Penthouse Dispatch App Store Phase 2 Checklist

This checklist assumes the browser app remains the source of truth and Capacitor only wraps the built web app.

## What is already done

- Capacitor config and native shells are added
- iOS and Android wrappers build from `dist`
- native-safe auth/password-reset redirects use `penthousedispatch://app/...`
- starter location/photo permissions are present
- branded icon and splash source assets are in the native wrappers

## Before device testing

1. Run:

```bash
cd "/Users/penthouse/Documents/New project/project"
npm run mobile:build
```

2. Open native projects:

```bash
npm run mobile:ios
npm run mobile:android
```

## Real-device test pass

### Auth

- sign in
- sign out
- password reset
- temporary password first-login change flow

### Core app

- admin dashboard
- company dashboard
- driver app login
- rider preview
- maps render correctly
- company preview works

### Mobile-specific

- location permission prompt
- photo picker for driver photos
- copy/share actions
- app reopens correctly from password reset email link

## App Store Connect prep

### Apple

1. Create app in App Store Connect
2. Set bundle identifier to match Xcode target
3. Add:
   - app name
   - subtitle
   - privacy policy URL
   - support URL
4. Prepare screenshots:
   - iPhone
   - iPad if supported
5. Fill:
   - age rating
   - export compliance
   - privacy nutrition labels
6. Upload first build through Xcode / Organizer
7. Test with TestFlight
8. Submit for review

## Google Play prep

1. Create app in Play Console
2. Confirm package name matches Android app
3. Prepare:
   - app icon
   - feature graphic
   - screenshots
   - privacy policy URL
4. Fill:
   - Data Safety
   - content rating
   - app access if needed
5. Upload `.aab`
6. Test in internal track
7. Roll out production

## Safe workflow for later edits

- Keep editing the web app in `src/`
- Rebuild and resync wrappers with `npm run mobile:build`
- Do not put browser-only assumptions into auth redirects
- Keep native-only logic behind platform checks
- Do not change Vercel deployment flow for mobile packaging
