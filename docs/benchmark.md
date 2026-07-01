# Benchmark summary

## Status

This document summarizes the latest validated five-case live benchmark that was completed before the repository hygiene pass on July 1, 2026.

The benchmark exercises public live application URLs and should be treated as a small-sample regression gate, not a guarantee of universal ATS coverage.

## Scope

- Cases: 5
- ATS families covered: Greenhouse, Lever, Ashby, Workable, Jobvite
- Final submissions performed: 0

## Key results

- Completed cases: 5 / 5
- Field detection recall: 1.000
- Fill coverage: 1.000
- Fill precision: 1.000
- Safe answer coverage: 1.000
- Dropdown success: 1.000
- Autocomplete success: 1.000
- File upload success: 1.000
- User-expected coverage: 0.804
- Severe incorrect answers: 0
- Severe field failures: 0

## Generated-answer result

The validated run included one grounded short-answer generation case.

- Generatable questions detected: 1
- Generated answers inserted: 1
- Browser-verified generated answers: 1
- Quality-approved generated answers: 1
- Generated answers accepted without edit: 1

## Important notes

- Benchmark URLs can expire or change without warning.
- The benchmark writes traces, screenshots, and detailed inventories locally under `debug/` and those artifacts are intentionally excluded from Git.
- This summary is sanitized. It does not include raw traces, filled field inventories, or private local runtime data.
