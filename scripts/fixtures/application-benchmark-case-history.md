# Benchmark case history

## 2026-06-30

- Old case: `excel-jobvite`
- Reason retired from active suite: The public Jobvite posting now resolves to a genuine unavailable/tombstone page and can no longer represent live Jobvite autofill behavior.
- New active case: `iboss-jobvite`
- ATS: `jobvite`
- Date changed: `2026-06-30`
- Expected field types: `text`, `file_upload`, `navigation`
- Notes: `excel-jobvite` remains in the fixture set with `"availabilityRegression": true` so site-availability handling stays covered without contaminating the active five-case dogfood suite.

- Active suite refresh: Replaced the previous Greenhouse structured-only case with `dataiku-greenhouse` so the default suite includes a live generatable short-answer prompt while preserving Greenhouse structured coverage.
- Active suite composition after change: `dataiku-greenhouse`, `tevora-lever`, `1password-ashby`, `jcc-workable`, `iboss-jobvite`
