# Relief Chain — Agent Rules

## Required References

**Always consult these two files before writing any frontend code:**

- **React Native Expo expert skill** — `.agents/skills/expo-expert/SKILL.md`
- **Frontend rules** — `context/frontend-skills/frontend-rule.md`

These override any default behavior. Read them at the start of every frontend task.

## Component Architecture

**Always break large view files into sub-components.** Any screen or component that grows beyond ~150 lines must be split into a folder-based structure:

```
src/app/(tabs)/
  index.tsx          ← thin shell: owns all state, logic, and data
src/components/SomeFeature/
  SomeList.tsx      ← receives props, emits events via callbacks
  SomeModal.tsx     ← self-contained with internal state
  ...
```

Rules:
- Screen files (`src/app/**/*.tsx`) hold the primary state, effects, and data. Their return is a short composition of sub-components.
- Sub-components receive data via props and communicate up via callbacks (e.g., `onUpdate`, `onSubmit`).
- Modals own their internal form state (touched, validation, reset). They call a submit callback with the final data; the parent mutates the list or backend.
- Shared types go in `src/types/<domain>.ts` and are imported everywhere — never re-declare interfaces across files.
- Shared UI patterns (toggle switches, setting cards, etc.) go in `src/components/shared/`.

## React Native / Expo Rules

- Always use functional components with Hooks. No class components.
- Use `useState()` and `useReducer()` for state, `useEffect()` for side effects.
- Use `useColorScheme` and `StyleSheet` for styling.
- No `any` casts unless unavoidable; prefer explicit TypeScript types.
- **Expo HAS CHANGED**: Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Design System

- Brand colors only: 
  - Green: `#6FCA4B`
  - Navy: `#112E58`
  - Yellow: `#E4CF10`
  - Light Gray: `#EEEDED`
- Font: `Plus Jakarta Sans`.
- Shared UI patterns: use components from `src/components/` to ensure consistency.

## Dependencies

Install new packages via Expo CLI to ensure compatibility:
```bash
npx expo install <package>
```

## Dummy Data

All views use local mock data arrays (`useState<T[]>([])`) until backend integration. No API calls yet.

## Task Workflow

**For every task the user gives, always come up with a plan first before executing.**

1. State what files will be created or modified.
2. List the specific changes per file (types, props, template additions, etc.).
3. Call out any potential gotchas (TypeScript constraints, flex layout, shared component impact, etc.).
4. Wait for implicit or explicit user confirmation, then execute.

Do not write any code until the plan is laid out.
