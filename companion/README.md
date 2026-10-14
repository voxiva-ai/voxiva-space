# Mobile companion

The mobile app lives at [`apps/mobile`](../apps/mobile). It is a separate Expo / React Native app with its own dependency lockfile and native Android project. Desktop and mobile share the LAN bridge contract, not a UI runtime.

Pairing uses the local network bridge on port `17847`. Enable it under Settings → Mobile, then scan the QR from Voxiva Mobile. The QR contains an access token; share it only with devices you trust.

Android APK downloads are served by the separate Voxiva Web project. iOS is configured in Expo but is not published to the App Store yet. Relay, individual-device revocation, and phone-specific terminal resizing are not implemented by the current bridge.
