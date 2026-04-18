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

## Do not mix with the web deploy

- Vercel continues to serve the browser app from the normal Vite build output.
- Capacitor is only for local/native packaging and store submission.
