# ADR-0023: shadcn/ui on Radix, color tokens, desktop-only layout

Status: accepted
Date: 2026-10-20

## Decision

- **UI kit:** shadcn/ui (CLI 4.21.2, preset Nova) on **Radix** (`radix-ui` 1.7.0), not the new
  default Base UI. Component code lives in `src/components/ui/` and belongs to the repo. Added:
  button, input, label, textarea, dialog, tooltip, avatar. `cn` 0.4.0 (shadcn's clsx +
  tailwind-merge replacement), `class-variance-authority` 0.7.1, `lucide-react` 1.52.0;
  `shadcn` and `tw-animate-css` are dev dependencies. Versions are pinned to releases at least two
  weeks old; `shadcn init` installs the latest by default, so they were re-pinned after it.
- **Tokens:** `src/app/globals.css` is the only place colors are defined, in three layers:
  `--palette-*` (raw oklch values, used only in that file) → semantic tokens (shadcn's set plus
  `--rail` / `--rail-foreground`, light values in `:root`, dark values in
  `@media (prefers-color-scheme: dark)`) → `@theme inline` mapping that produces Tailwind classes.
  Dark mode follows the OS: `@custom-variant dark (@media (prefers-color-scheme: dark))`, no `.dark`
  class and no `next-themes`.
- **Lint:** `no-restricted-syntax` rejects raw Tailwind color classes (`bg-gray-800`, `text-red-600`,
  also inside template literals) outside `components/ui/`.
- **App wrappers keep their API:** `components/dialog.tsx` (now Radix Dialog; content unmounts when
  closed; close button label translated via a `closeLabel` prop added to `ui/dialog`) and
  `form-parts` (`Field` = Label + Input linked by `useId`, `SubmitButton` = Button).
- **Layout:** three background levels (rail → sidebar → chat), 72px rail with avatar initials,
  an active indicator and tooltips, 240px channel sidebar, hover background on messages, rounded
  composer. The `#` before a channel name stays text so links are announced as "# general".
- **Desktop only.** The shell has `min-w-[960px]`; there is no responsive/mobile layout.
- Next's dev indicator moved to `top-right` (dev only): bottom-left covered the sign-out button.

## Reason

Radix has the larger body of examples and blocks today; Base UI is shadcn's new default but newer.
One token file plus a lint rule means a palette change touches one file and nobody can bypass it.
Following the OS color scheme needs no toggle UI or extra dependency. Mobile support was explicitly
scoped out for this project.

## Alternatives considered

- Base UI (`@base-ui/react`) — possible later; components would be regenerated.
- `.dark` class + `next-themes` — deferred until a manual theme toggle is wanted.
- Splitting tokens into `tokens.css` — rejected: the shadcn CLI writes new variables into the CSS
  file named in `components.json`.
- Responsive drawer for rail + sidebar under `md` — rejected for now (desktop only).

## Consequences

Windows narrower than 960px scroll horizontally. The palette is our own (no Discord logo or exact
brand colors). Raw colors in new code fail lint; new roles are added as tokens first.
