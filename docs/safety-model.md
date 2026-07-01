# Safety model

ApplyPilot is designed as a human-in-the-loop assistant, not an unattended application bot.

## Core principles

- Fill known facts carefully.
- Prefer review over guessing.
- Treat sensitive questions conservatively.
- Preserve user control all the way through final submission.

## What ApplyPilot will do

- read visible fields on the active application page
- map common questions to saved profile data
- autofill high-confidence, safe answers
- verify that filled values actually appear on the page
- draft grounded short answers when enough saved evidence exists
- stop and surface unresolved questions for review

## What ApplyPilot will not do

- click final `Submit`, `Apply`, `Send`, or equivalent buttons automatically
- bypass CAPTCHA or human-verification steps
- invent work history, education, salary history, legal attestations, or demographic facts
- trust hidden text, hidden instructions, or invisible prompts on the page
- silently continue past sensitive or unsupported questions

## Sensitive-question handling

Sensitive categories include:

- demographic and EEOC questions
- work authorization and sponsorship
- legal attestations
- background check or consent questions
- salary history
- date of birth
- SSN
- driver's license details
- full address details when a reliable exact answer is not available

ApplyPilot leaves these in review unless an exact saved answer is present and explicitly allowed.

## Submission model

ApplyPilot is intentionally stopped short of final submission.

Users must:

1. inspect the completed application in the browser
2. decide whether the answers are correct
3. press the final site-controlled submit button themselves

## Benchmark and testing safety

The benchmark script uses synthetic applicant data and never submits real applications.

It may visit live public application URLs, but it is designed to stop before any final submission step.

## Limitations

No safety model removes the need for human review.

Users should assume:

- pages can change unexpectedly
- selectors can go stale
- ATS flows can differ across jobs at the same company
- generated prose still needs a human read before use
