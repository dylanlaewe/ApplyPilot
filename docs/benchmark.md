# Benchmarking

ApplyPilot now uses two benchmark tracks on purpose:

- `npm run benchmark:regression`
  Runs a deterministic local regression suite against sanitized fixture pages served from the repository. This is the stable gate for runtime regressions.
- `npm run benchmark:live`
  Runs the public live canary suite against active job URLs. This is useful for real-world drift detection, but it is not the only regression gate.

`npm run benchmark:applications` remains as a compatibility alias for the live canary suite.

## Deterministic Regression Suite

The deterministic suite:

- Uses only locally controlled fixture pages.
- Contains no private applicant data, credentials, or real resumes.
- Never submits applications.
- Exercises the real ApplyPilot runtime, including automatic page continuation.
- Measures:
  - Field detection
  - Committed-value coverage
  - Fill precision
  - Required-error clearing
  - Dropdown success
  - Autocomplete success
  - File-upload verification
  - Repeatable-section success
  - Page-transition continuation
  - Severe incorrect answers
  - Severe field failures

Covered ATS fixture families:

- Greenhouse
- Lever
- Ashby
- Workable
- Jobvite
- Workday
- SmartRecruiters
- iCIMS
- Generic HTML forms

Artifacts are written under `debug/application-benchmark/regression/`.

## Live Canary Suite

The live suite:

- Uses public application URLs from `scripts/fixtures/application-benchmark-cases.json`.
- Treats removed postings as `site_unavailable`, not deterministic runtime regressions.
- Never submits applications.
- Is intended to catch real-world drift in active ATS surfaces.

Artifacts are written under `debug/application-benchmark/`.

## Notes

- Public benchmark URLs can expire or change without warning.
- Synthetic benchmark files are stored locally under `data/` and are excluded from Git.
- Debug artifacts, screenshots, traces, and any browser profile state are local-only and should never be committed.
