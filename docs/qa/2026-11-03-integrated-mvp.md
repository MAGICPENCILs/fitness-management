# Integrated MVP QA — 2026-11-03

## Automated verification

- `npm test -- --maxWorkers=1 --pool=forks`: 68 files, 366 tests passed
- `npm exec tsc -- --noEmit`: passed
- `npm run lint`: 0 errors; 4 pre-existing warnings
- `npm run build`: Next.js 16.4.4 production build passed with 72 routes
- `npm exec drizzle-kit check`: migration snapshots and journal are consistent
- `npm audit --omit=dev`: 0 production vulnerabilities after the controlled dependency update

## Browser verification on port 3005

- Login page rendered with Staff code, password, optional 2FA/recovery code and submit controls.
- Dark/light theme toggle changed the document theme.
- Unauthenticated `/reports` redirected to `/login?returnTo=%2Freports`.
- Mobile viewport 390×844 rendered the Login page without horizontal overflow.
- No browser console errors were recorded for the verified flow.

## Security review closure

- Payment mutations now require trusted origin and lock/select Members inside the current branch before financial writes.
- Existing enabled TOTP cannot be replaced before it is explicitly disabled with a current factor/recovery code.
- Member login now has opaque account/IP rate-limit buckets and success/failure/limited audit events.
- Payroll periods cannot overlap for the same Staff; Freeze quota and expiry use the same approved, Bangkok-calendar days.
- Backup metadata is authenticated as AES-GCM AAD, dumps cannot switch databases and restore reaches MySQL only after full decryption/authentication into a restricted temporary file.
- Stale notification claims can be reclaimed with a lease; LINE remains visibly unavailable until a consent-aware recipient lifecycle exists.
- Public signup records the server-owned active privacy-policy version instead of accepting it from the client.

## Safety limitations

- Database migrations were not applied because the configured target could not be confirmed as an approved disposable local/test database. Apply `npx drizzle-kit migrate` only after verifying the target and backup.
- Authenticated browser flows were not mutated because no disposable QA account/credential was provided; RBAC, route inventory, TOTP, Member session isolation and business flows are covered by automated tests.
- Notification providers remained disabled/simulated and no real recipient was contacted.
- Access hardware remained disabled/simulated and no physical controller or door was contacted; physical calibration still requires on-site testing.
- Payroll summaries intentionally exclude statutory tax and social-security calculations and do not initiate payments.
- Development-only tooling still has audit findings through the shadcn CLI dependency tree; it was moved to `devDependencies` and is not part of the production runtime.
