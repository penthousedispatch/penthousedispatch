# Apple App Store Submission Runbook

Use this after your iOS wrapper has been tested on a real device or TestFlight-ready simulator flow.

## Current app values

- App name: `Penthouse Dispatch`
- Bundle identifier: `com.penthousedispatch.app`
- Domain: `https://www.penthousedps.com`

## 1. Create the app record

1. Open [App Store Connect](https://appstoreconnect.apple.com/).
2. Go to `Apps`.
3. Click the `+` button, then `New App`.
4. Fill:
   - Platform: `iOS`
   - Name: `Penthouse Dispatch`
   - Primary language: `English (U.S.)`
   - Bundle ID: `com.penthousedispatch.app`
   - SKU: `PD-IOS-001`
5. Click `Create`.

## 2. Fill the app listing

Use these files:

- [/Users/penthouse/Documents/New project/project/docs/app-store-connect-fields.md](/Users/penthouse/Documents/New%20project/project/docs/app-store-connect-fields.md)
- [/Users/penthouse/Documents/New project/project/docs/app-store-submission-pack.md](/Users/penthouse/Documents/New%20project/project/docs/app-store-submission-pack.md)

You will need:
- subtitle
- description
- keywords
- support URL
- marketing URL
- privacy policy URL
- screenshots

## 3. Set versioning in Xcode

In Xcode for the iOS app:

1. Open:
   - `/Users/penthouse/Documents/New project/project/ios/App/App.xcodeproj`
2. Select the `App` target.
3. Under `General`, confirm:
   - Display Name = `Penthouse Dispatch`
   - Bundle Identifier = `com.penthousedispatch.app`
4. Under `Identity`, set:
   - Version = `1.0.0`
   - Build = `1`

Use a new build number for each upload after that:
- `2`
- `3`
- `4`

## 4. Test locally on iPhone

Before upload, confirm:
- sign in
- sign out
- password reset
- company dashboard
- driver app
- rider tracking
- maps and location permissions
- photo picker

Use:

- [/Users/penthouse/Documents/New project/project/docs/mobile-device-qa-checklist.md](/Users/penthouse/Documents/New%20project/project/docs/mobile-device-qa-checklist.md)

## 5. Archive and upload

1. In Xcode, select:
   - Any iPhone Device (or a connected device)
2. Go to `Product -> Archive`
3. When Organizer opens, select the new archive
4. Click `Distribute App`
5. Choose `App Store Connect`
6. Choose `Upload`
7. Continue through signing/export screens
8. Upload the build

## 6. TestFlight

1. Wait for the build to process in App Store Connect
2. Add yourself as an internal tester
3. Install through TestFlight
4. Run the full QA checklist again on a real phone

## 7. App review prep

Before submission, complete:
- age rating
- export compliance
- privacy nutrition labels
- app review contact info
- sign-in instructions if Apple asks for reviewer access

## 8. Don’t submit until these are true

- mobile auth reset flow works
- map permissions work
- company and driver flows work
- privacy policy URL is live
- screenshots are final

## Notes

- This mobile wrapper does not replace the browser app
- Vercel continues serving the web app normally
- iOS uses the same app code, synced from `dist`
