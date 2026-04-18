# Penthouse Dispatch Mobile Packaging

This project keeps the browser app as the source of truth and uses Capacitor only as a native wrapper.

## Guardrails

- Web routes stay the same.
- Native code must remain behind platform checks.
- Capacitor files stay outside the Vercel/browser deployment flow.

## What exists now

- `capacitor.config.json`
- `ios/`
- `android/`
- package scripts for mobile build and sync
- native auth deep-link scheme: `penthousedispatch://app/...`
- initial iOS/Android permission strings for location and photo selection

## Commands

```bash
npm run build
npm run mobile:sync
npm run mobile:ios
npm run mobile:android
```

Or in one step:

```bash
npm run mobile:build
```

## Release flow

1. Keep building and testing the web app normally.
2. Run `npm run mobile:build` to compile web assets into `dist` and sync them into iOS/Android shells.
3. Open the native project:
   - `npm run mobile:ios`
   - `npm run mobile:android`
4. Test sign-in, maps, onboarding, rider tracking, driver app, and password reset on real devices.
5. Add native-only permissions and store metadata later without changing browser routes.

## Safe editing rules later

- Keep the web app as the source of truth.
- Make browser changes in `src/` first.
- Only add native code when a mobile feature truly needs it.
- Keep native-specific code behind `isNativeApp()` checks.
- After web changes that should appear in the mobile apps, run:

```bash
npm run mobile:build
```

- That rebuilds `dist` and syncs the wrapper projects without affecting the live Vercel site.

## Phase 1 hardening included

- iOS and Android app shells
- native-safe password reset / auth redirect URLs
- Capacitor deep-link listener
- starter permission strings for:
  - location
  - camera/photo selection

## Still to do before store submission

- replace placeholder app icons and splash branding
- set production bundle IDs if needed
- confirm Supabase auth behavior on real devices
- verify map/location permission prompts
- complete App Store Connect and Google Play metadata

## Do not mix with the web deploy

- Vercel continues to serve the browser app from the normal Vite build output.
- Capacitor is only for local/native packaging and store submission.
