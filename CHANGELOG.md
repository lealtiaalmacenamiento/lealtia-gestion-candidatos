# Changelog

## Unreleased - Agenda improvements (2025-10-31)

### Backend
- Removed default restriction that filtered out prospectos with `cita_creada = true` and `descartado` estado. The agenda search now returns a broader set of prospectos by default. Callers can still use query params to limit results.
- Adjusted API to include prospectos without email by default when appropriate (`include_sin_correo`).

### Frontend
- Added search input and autocompleting prospect selector in the Agenda form (`src/app/(private)/agenda/page.tsx`). Features:
  - Debounced search (300ms).
  - Loading spinner and skeleton list while prospect data loads.
  - Keyboard navigation and ARIA attributes for accessibility.
  - Disabled inputs while results are loading to prevent race conditions.
- Fixed various lint/ARIA warnings and removed unused variables.

### Tests
- Added a small unit test for `searchAgendaProspectos` to assert query param construction and response handling. Test runner: Vitest.

### Dev / CI
- Added `vitest` devDependency and `test` script.
- Fixed `postcss.config.mjs` to avoid loading Tailwind/PostCSS plugins during test runs (Vitest sets `VITEST` env).

### Notes
- Run `npm run lint` and `npm run typecheck` to verify code quality.
- Run `npm run test` to execute the unit tests (requires node and dev dependencies installed).
