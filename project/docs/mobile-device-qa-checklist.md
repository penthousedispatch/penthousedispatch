# Penthouse Dispatch Mobile Device QA Checklist

Use this after `npm run mobile:build`.

## Auth

- open app from cold start
- sign in as admin
- sign out
- sign in as company
- trigger password reset
- open reset link on device
- confirm app returns to change-password screen

## Admin

- Ops Center loads
- Companies loads
- open company preview
- AI Settings loads
- Bot Team loads
- Security loads

## Company

- company dashboard map loads
- drivers list loads
- import/load drivers works
- company AI Settings save successfully
- Driver Pay tab loads

## Driver

- driver sign in works
- admin test-driver mode works
- location prompt appears
- trip preference buttons work
- onboarding audio works when uploaded

## Rider

- rider preview opens
- map resizes correctly
- copy/share tracking link works
- guide audio works when uploaded

## Permissions

- location
- photo library
- camera if later enabled

## Regressions to watch

- browser routes must still behave exactly the same on web
- Vercel deploy flow must remain unchanged
- no mobile-only code should break desktop browser behavior
