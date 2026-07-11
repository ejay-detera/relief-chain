# Relief Chain - Frontend Rules

## Core Principles
- **Mobile-First Mindset**: Relief Chain is primarily a mobile application built with React Native and Expo. Ensure all UI designs work natively on iOS and Android.
- **Expo Router**: We use file-based routing with Expo Router (`src/app/`). Keep the `app` directory strictly for routes and navigation logic. Reusable UI components must live in `src/components/`.

## Styling
- Prefer `StyleSheet.create` for component-level styling.
- Utilize global variables defined in `src/global.css` for consistent theme colors (Green, Navy, Yellow, Light Gray) and Fonts (`Plus Jakarta Sans`).
- Respect safe areas using `react-native-safe-area-context` (`SafeAreaView` or `useSafeAreaInsets`) to avoid overlapping with notches and status bars.
- Avoid using inline styles unless the style is dynamic and changes frequently.

## Component Guidelines
- **Functional Components**: Use arrow functions for component definitions (`const MyComponent = () => {...}`).
- **Props**: Always type your props using TypeScript `type` or `interface`. Destructure props in the function signature.
- **Performance**: Use `memo`, `useMemo`, and `useCallback` judiciously when passing props to heavy child components or FlatLists.
- **Lists**: Always use `FlatList` or `SectionList` for rendering arrays of data. Never map over large arrays inside a `ScrollView`. Provide `keyExtractor` explicitly.

## State Management
- Lift state up only when necessary. Keep state local to the component that needs it.
- Avoid global state for ephemeral data.

## File Organization
- `src/app/`: Expo Router routes and layouts (`_layout.tsx`).
- `src/components/`: Reusable React Native components.
- `src/hooks/`: Custom React hooks.
- `src/constants/`: App-wide constants (e.g., Layout, Colors, Typography).
- `src/types/`: TypeScript definitions for domain models.
- `src/utils/`: Helper functions and utilities.
