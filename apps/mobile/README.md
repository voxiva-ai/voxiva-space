# Voxiva Mobile

Expo / React Native companion for Voxiva Space. Shared TypeScript screens target Android and iOS; `android/` contains the generated Android project, while EAS generates the iOS project for Apple builds. Dependencies and lockfile are isolated from the desktop app.

## Develop

```powershell
cd apps/mobile
npm ci
npx expo start
```

For a local Android device with Android Studio / SDK installed, run `npx expo run:android`. Pushing a `mobile-v*` tag builds a preview APK and attaches it to a prerelease on GitHub. The preview APK is debug-signed; iOS device distribution still requires Apple signing and App Store/TestFlight setup.

## Pair

On desktop, open Settings → Mobile, enable LAN pairing, generate the QR, and scan it in the app. The phone and computer must share Wi-Fi or Tailscale. The QR carries a secret token and should only be shared with trusted devices.

Pairing details stay on the phone; Android app-data backup is disabled. The pairing token currently uses the app's local storage and is not encrypted at rest. LAN traffic is plain HTTP: pair only on a trusted Wi-Fi/Tailscale network, and treat the QR as a password. The current bridge does not include cloud relay, per-device revocation, or phone-specific terminal resizing. This is a preview build, not an App Store or Play Store release.
