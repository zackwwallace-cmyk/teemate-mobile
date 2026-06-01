# TeeMate Expo Mobile App

This folder is the native Expo React Native rebuild of the TeeMate web app.

## Setup

```bash
cd mobile-expo
npm install
cp .env.example .env
npm run start
```

Add your Supabase values to `.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

## Run locally

```bash
npm run start
```

Then open the app with Expo Go, Android emulator, or iOS simulator.

## Build for stores later

Install EAS CLI and configure the project:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios
eas build --platform android
```

## Current status

Implemented:

- Native Expo Router app shell
- Native landing screen
- Supabase signup/signin screen
- Persistent mobile auth session
- Protected discover screen scaffold
- App configuration for iOS and Android

Still needed:

- Connect discover screen to your real Supabase profile/match tables
- Rebuild profile onboarding fields
- Rebuild match actions and messaging
- Add profile photos, course selection, founder codes, membership/paywall logic, and app store assets
