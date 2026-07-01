# Architecture

## Overview

ApplyPilot is a local-first Next.js application with a Playwright automation layer and JSON-backed local storage.

The architecture is intentionally simple:

- the UI runs in a local Next.js app
- automation runs through Playwright in the same local environment
- persisted state is written to JSON files in the runtime `data/` directory
- benchmark and diagnostic artifacts are written to the runtime `debug/` directory

## Main layers

### UI

- `app/` contains the route structure and local API routes
- `components/` contains the interactive product UI

The main user-facing flow lives on the `Apply` page and the session review components it renders.

### Storage

- `lib/storage.ts` handles local JSON file creation and writes
- `lib/profile.ts` manages the applicant profile
- `lib/answerBank.ts` manages reusable answer data
- `lib/applications.ts` manages application session state

Runtime files are created under `data/` and are intentionally excluded from source control.

### Field understanding and answer suggestion

- `lib/browserFieldScanner.ts` and `lib/playwrightSession.ts` collect visible fields from the current page
- `lib/fieldLabeling.ts`, `lib/fieldIntent.ts`, and `lib/fieldMapping.ts` classify and normalize those fields
- `lib/answerEngine.ts` and related derivation helpers turn profile data into safe suggestions
- `lib/shortAnswerGenerator.ts` and related grounding/quality modules build reviewed prose suggestions when enough evidence exists

### Automation and safety

- `lib/browserManager.ts` manages the Playwright browser context
- `lib/quickApply.ts` orchestrates a scan, safe autofill, and review-state transition
- `lib/safety.ts` and `lib/autofillRules.ts` enforce submission and sensitivity constraints

ApplyPilot never relies on the page to define its own safety rules. The local code remains the source of truth for what may be filled automatically.

## Request flow

1. The user starts a session from the `Apply` page.
2. A local session record is created.
3. Playwright opens the job application.
4. Visible fields are scanned and normalized.
5. Safe, high-confidence answers are filled and verified.
6. Uncertain or sensitive fields are left in the review queue.
7. The user completes remaining answers and submits manually on the target site.

## Persistence model

The app does not use a hosted backend in this private-alpha build.

Instead it stores local runtime state in JSON files such as:

- `profile.json`
- `answer-bank.json`
- `application-sessions.json`

These files are created at runtime and ignored from Git because they can contain personal information.

## Benchmarking

The live benchmark script in `scripts/application-benchmark.ts` uses a synthetic in-memory profile and answer bank, temporarily installs them into local runtime storage, and restores the user's prior local state when it exits.

The benchmark source is committed.
Its generated output is not.
