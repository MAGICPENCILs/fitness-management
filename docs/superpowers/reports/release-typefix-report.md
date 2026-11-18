# Staff login release type-check fix

On baseline `f6df0ff`, `tsc --noEmit --incremental false` exited 1 with TS2344 from Next.js's generated `app/api/auth/login/route.ts` type check. The exported `loginErrorResponse` helper was not a supported route-handler or segment-config export.

The helper is now private to the route. Its only external caller was a test, which now calls the `POST` handler with a `RATE_LIMITED` service rejection. The test still checks HTTP 429, a fixed `Retry-After: 900`, and the generic response body rather than the account-specific message. No production logic changed.

Verification:

- `tsc --noEmit --incremental false`: passed against the same generated route types.
- `eslint app/api/auth/login/route.ts app/api/auth/auth-routes.test.ts`: passed.
- `npm test -- app/api/auth lib/auth components/auth`: 151 tests passed across 20 files.
- `npm test`: 1,005 tests passed across 104 files.

This fix did not change LINE settings, database schema or migrations, or build configuration.
