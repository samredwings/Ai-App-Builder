## Problem

The preview is bouncing between `/auth` and `/dashboard` after sign-in. Session replay shows repeated navigations to `/auth` every ~3s while the dashboard briefly renders in between.

## Root cause

Classic Supabase session-hydration race between two guards that disagree about whether the user is logged in:

1. **`src/routes/_authenticated.tsx`** — `beforeLoad` calls `supabase.auth.getUser()`. On a cold navigation (or after any router invalidation) the session may not yet be restored from `localStorage`, `getUser()` returns no user, and it `throw redirect({ to: "/auth" })`.
2. **`src/routes/auth.tsx`** — `useEffect` calls `supabase.auth.getSession()`, finds the session a moment later, and `navigate({ to: "/dashboard" })`.
3. `/dashboard`'s loader/queries trigger another auth check → guard fails again → back to `/auth`. Loop.

Additionally, every protected serverFn (`listMyProjects`, etc.) runs through `attachSupabaseAuth` which reads `auth.getSession()`. If those fire before hydration completes they return 401, the query errors, and React Query refetches — amplifying the churn.

## Fix

Adopt the canonical "auth-ready" pattern so the guard waits for Supabase to finish hydrating once, and so the router reacts to real auth changes instead of polling.

### 1. Single source of truth for auth state in router context

- In `src/router.tsx`, create a `QueryClient` and an `auth` slot on router `context` (typed `AuthState | undefined`).
- In `src/start.ts` / client entry, subscribe **once** to `supabase.auth.onAuthStateChange` and on every event call `router.invalidate()` so `beforeLoad` re-runs with fresh state. Do not `await` anything inside the callback.

### 2. Replace polling guards with a hydration-aware check

- `src/routes/_authenticated.tsx`: change `beforeLoad` to `await supabase.auth.getSession()` (reads from storage, resolves after hydration) instead of `getUser()` (network call that races). Only redirect to `/auth` when `data.session` is definitively null.
- `src/routes/auth.tsx`: remove the `useEffect` that calls `getSession()` + `navigate("/dashboard")`. Instead use `beforeLoad` on the `/auth` route that redirects authenticated users to `/dashboard` (mirror of the `_authenticated` guard). This eliminates the second half of the ping-pong.

### 3. Stop the dashboard from firing serverFns before auth is ready

- `src/routes/_authenticated/dashboard.tsx`: gate the `useQuery` for `listMyProjects` with `enabled: !!session` from a small `useAuthReady` hook (or read the session from router context populated by the `_authenticated` `beforeLoad`). Prevents 401 → refetch loops.

### 4. Post-OAuth landing

- After Google OAuth the user lands on `/dashboard` via `redirect_uri`. With the new `/auth` `beforeLoad`, if hydration hasn't run yet, the request still resolves correctly because `_authenticated` waits for `getSession()` before deciding.

## Files touched

- `src/router.tsx` — add `auth`/`queryClient` to context types
- `src/start.ts` — register `onAuthStateChange` → `router.invalidate()`
- `src/routes/__root.tsx` — context typing (if needed)
- `src/routes/_authenticated.tsx` — use `getSession()` in `beforeLoad`
- `src/routes/auth.tsx` — drop the polling `useEffect`, add `beforeLoad` redirect for already-authed users
- `src/routes/_authenticated/dashboard.tsx` — gate query on session readiness
- (new) `src/hooks/use-auth-ready.ts` — small shared hook for components that need to know

## Out of scope

- No DB / RLS / migration changes.
- No changes to OAuth provider configuration (Google managed broker is working — confirmed in auth logs).
- No UI redesign.

## Verification

1. Cold-load `/dashboard` while signed in → renders once, no flicker, no redirect to `/auth`.
2. Sign out → exactly one navigation to `/auth`, stays there.
3. Sign in with email or Google → exactly one navigation to `/dashboard`, projects load on first try (no 401 in network tab).
4. Refresh on `/auth` while signed in → redirected to `/dashboard` once.
