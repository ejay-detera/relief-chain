---
name: React Native Expo Expert
description: Guidelines and best practices for developing React Native apps with Expo v57.
---

# React Native & Expo Guidelines

When working on this project, adhere strictly to the following Expo and React Native principles:

1. **Expo Versioning**: The project uses Expo v57.0.0. Features like Expo Router, `@expo/ui`, and `expo-symbols` are heavily utilized. Always refer to the v57 documentation.
2. **File-based Routing**: Utilize Expo Router. Routes are defined in the `src/app` directory. Use `Link` from `expo-router` for navigation, or `useRouter()` hook for programmatic navigation.
3. **Cross-Platform Compatibility**: Ensure all code works efficiently on both iOS and Android. If a platform-specific API is necessary, use `Platform.OS` checks or platform-specific file extensions (`.ios.tsx`, `.android.tsx`).
4. **Assets & Icons**: Use `expo-image` for high-performance image loading instead of the built-in React Native `Image` component. Use `expo-symbols` for icons where applicable.
5. **Typescript Strictness**: Maintain strict typing. Avoid using `any`. Type navigation routes and parameters meticulously where possible.
6. **Glass Effects**: When using glassmorphism, refer to the usage of `expo-glass-effect` as present in the dependencies.
