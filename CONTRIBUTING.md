# Contributing

ApplyPilot is currently a private-alpha codebase.

## Local setup

```bash
npm install
npx playwright install chromium
```

Run the app locally:

```bash
npm run dev
```

## Validation

Before opening or sharing changes, run:

```bash
npm test
npx tsc --noEmit
npm run build
```

Only run the live benchmark when your change could affect autofill runtime behavior or benchmark logic:

```bash
npm run benchmark:applications
```

## Privacy and repository rules

- Never commit local profile data, resumes, sessions, traces, screenshots, or debug output.
- Treat the runtime `data/` and `debug/` directories as private local state.
- Keep benchmark fixtures and tests synthetic.
- Do not add secrets or machine-specific absolute paths to committed files.

## Scope

Please keep changes focused.

- product changes should preserve the human-in-the-loop model
- safety changes should prefer review over guessing
- documentation should describe current behavior honestly
