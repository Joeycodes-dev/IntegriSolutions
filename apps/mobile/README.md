# Integriscan Mobile

React Native (Expo) mobile app used by traffic officers for roadside DUI testing.

## Getting Started

1. Install dependencies:
   `npm install`

2. Start the Expo dev server:
   `npx expo start`

3. Run on Android:
   `npm run android`

4. Run on iOS:
   `npm run ios`

## Build Installable APK (No Expo Dev Server)

You can build an Android APK that installs directly on devices and does not require running `expo start`.

1. Sign in to Expo/EAS (one time):
   `npx eas login`

2. Build APK in the cloud:
   `npm run apk`

3. View recent Android builds:
   `npm run apk:list`

4. Download and install the APK from the build URL shown in the terminal.

Optional local APK build (requires Android SDK, Java, and local native toolchain):
`npm run apk:local`

From the repository root, use:
- `npm run mobile:apk`
- `npm run mobile:apk:list`

## Notes

- The app uses React Navigation for native screen navigation.
- Make sure the backend API is running before testing on-device features.
