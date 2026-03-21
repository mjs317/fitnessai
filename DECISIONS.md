# Implementation Decisions

## Phase 1

- **Auth method**: Magic link (email OTP) only. No passwords. No OAuth social providers. Cleanest UX for a single-user private tool.
- **Supabase SSR**: Using `@supabase/ssr` package with cookie-based session management (recommended by Supabase for Next.js 14 App Router).
- **Service role client**: Created separate `createServiceRoleClient()` in `lib/supabase/server.ts`. This bypasses RLS for server-side API routes. NEVER imported client-side.
- **PWA**: PWA configuration deferred to Phase 2.
- **Icons**: Placeholder icons generated programmatically. Replace with real icons before production.
- **Navigation**: Bottom nav on mobile (5 tabs), fixed sidebar on desktop (≥768px). Implemented via CSS media query in globals.css.
- **Stub pages**: Phases 2–9 pages created as stubs. Each phase will replace the stub with full implementation.

## Phase 2 (pending)
## Phase 3 (pending)
