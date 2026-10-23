# ADR-0029: Frontend robustness (errors, loading, accessibility, bundle)

Status: accepted
Date: 2026-10-20

## Decision

- **Error pages show a reference.** `errorReference()` returns the API `requestId` (or Next's
  `error.digest`); `error.tsx`, `global-error.tsx` and 5xx messages show it ("Mã lỗi: …") so a user report
  can be matched to server logs. `reportError()` is the single seam for a future Sentry (H5); error pages
  must call it. `global-error` replaces the root layout, so it renders its own `<html>` with texts from
  `messagesByLocale` (no providers available there). A localized `not-found.tsx` exists.
- **Every list has loading / empty / error.** shadcn `Skeleton` fallbacks (`role="status"`,
  `aria-busy`) for the rail, channel sidebar and message list; explicit empty states.
- **Accessibility is tested, not hoped for.**
  - `e2e/a11y.spec.ts` runs axe (WCAG 2.0/2.1 A+AA) on login/register, the app shell with the message
    menu and create-server dialog, and 404, in light and dark. Any violation fails the test. The Radix
    modal menu is scanned only inside `[role=menu]` (it `aria-hidden`s the rest of the page while its
    focus trap keeps focus inside: a known axe false positive).
  - Fixes it forced: dark `--primary` darkened so white button text is ≥ 4.5:1; new `--link` token for
    link text (needs to be lighter than the button fill on a dark background); `--destructive` retuned
    in both themes; the app `Dialog` now remembers and restores the opener (controlled dialogs have no
    Radix `Trigger`, so focus was lost on close).
  - jsx-a11y rules beyond Next's six are enabled (plugin already registered by eslint-config-next).
  - New messages are announced in an `aria-live="polite"` region (own messages are not).
  - `e2e/keyboard.spec.ts`: dialog opens by keyboard, focus enters the field, Esc returns focus; the
    message menu opens by keyboard.
- **Bundle budget.** `pnpm --filter web check:bundle` (after `build`): initial client JS ≤ 450 KB gzip,
  each chunk ≤ 100 KB (baseline 371 KB / 70 KB). Route chunks loaded on navigation are capped at
  160 KB each instead of being summed — see ADR-0058 for the measurement. `next experimental-analyze`
  shows what grew.
- **`process.env` only in `src/lib/env.ts`** (ESLint), so configuration is validated in one place.

## Consequences

- E2E logins are paced (`e2e/login-pace.ts`) because `/auth/login` allows 10 per minute per IP by design.
- CSP stays nonce-less (Next 16 nonces force dynamic rendering, incompatible with cacheComponents); see ADR-0027.
