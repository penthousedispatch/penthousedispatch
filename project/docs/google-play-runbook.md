# Google Play Submission Runbook

Use this after Android is tested on at least one real device.

## Current app values

- App name: `Penthouse Dispatch`
- Package name: `com.penthousedispatch.app`
- Android versionCode: `1`
- Android versionName: `1.0`
- Domain: `https://www.penthousedps.com`

## 1. Create the app record

1. Open [Google Play Console](https://play.google.com/console/).
2. Click `Create app`.
3. Fill:
   - App name: `Penthouse Dispatch`
   - Default language: `English (United States)`
   - App or game: `App`
   - Free or paid: `Free`
4. Create the app.

## 2. Fill store listing

Use:

- [/Users/penthouse/Documents/New project/project/docs/google-play-fields.md](/Users/penthouse/Documents/New%20project/project/docs/google-play-fields.md)
- [/Users/penthouse/Documents/New project/project/docs/app-store-submission-pack.md](/Users/penthouse/Documents/New%20project/project/docs/app-store-submission-pack.md)

You will need:
- short description
- full description
- screenshots
- privacy policy URL
- support email

## 3. Build Android release

Open:

- `/Users/penthouse/Documents/New project/project/android`

Current defaults:
- `applicationId "com.penthousedispatch.app"`
- `versionCode 1`
- `versionName "1.0"`

Before the first production release, keep:
- versionCode = `1`
- versionName = `1.0`

For each later release:
- increment `versionCode`
- update `versionName` when appropriate

## 4. Generate release build

In Android Studio:

1. Open the `android` project
2. Set up the signing key
3. Build:
   - `Build -> Generate Signed Bundle / APK`
4. Choose:
   - `Android App Bundle`
5. Save the `.aab`

## 5. Internal testing first

1. In Play Console, go to `Testing -> Internal testing`
2. Create a release
3. Upload the `.aab`
4. Add test users
5. Install and verify:
   - sign in
   - password reset
   - driver app
   - rider preview
   - company dashboard
   - map permissions

## 6. Complete required console sections

Before production, finish:
- App content
- Privacy policy
- Data Safety
- Content rating
- Target audience
- Ads declaration

## 7. Production rollout

Once internal testing passes:
1. Create production release
2. Upload the approved `.aab`
3. Review rollout notes
4. Start rollout

## Don’t publish until these are true

- Android permissions behave correctly
- password reset deep link works
- sign-in is stable
- screenshots are final
- privacy answers are accurate

## Notes

- Android is just a wrapper around the same browser app build
- this does not change Vercel or the live website
