import { FieldIntent } from "@/types";

export const FIELD_INTENT_PATTERNS: Array<{
  intent: FieldIntent;
  patterns: RegExp[];
  allowedTypes?: string[];
}> = [
  { intent: "email", patterns: [/\bemail\b/, /e-mail/, /email address/], allowedTypes: ["email", "text"] },
  { intent: "first_name", patterns: [/first name/, /given name/, /\bfname\b/, /first_name/], allowedTypes: ["text"] },
  { intent: "last_name", patterns: [/last name/, /family name/, /surname/, /\blname\b/, /last_name/], allowedTypes: ["text"] },
  { intent: "full_name", patterns: [/full name/, /\bname\b/, /your name/], allowedTypes: ["text"] },
  { intent: "phone", patterns: [/\bphone\b/, /mobile/, /cell/, /telephone/, /\btel\b/], allowedTypes: ["tel", "text"] },
  { intent: "linkedin", patterns: [/linkedin/, /linkedin profile/], allowedTypes: ["url", "text"] },
  { intent: "github", patterns: [/github/, /git hub/], allowedTypes: ["url", "text"] },
  { intent: "portfolio", patterns: [/portfolio/, /personal site/, /personal website/], allowedTypes: ["url", "text"] },
  { intent: "website", patterns: [/\bwebsite\b/, /\bsite\b/, /homepage/], allowedTypes: ["url", "text"] },
  { intent: "resume_upload", patterns: [/resume/, /\bcv\b/, /upload resume/], allowedTypes: ["file", "search"] },
  { intent: "cover_letter_upload", patterns: [/cover letter/, /upload cover letter/], allowedTypes: ["file", "search"] },
  { intent: "work_authorization", patterns: [/authorized to work/, /employment authorization/, /work authorization/, /legally authorized/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "sponsorship", patterns: [/sponsorship/, /visa/, /h-1b/, /require sponsorship/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "relocation", patterns: [/relocation/, /willing to relocate/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "remote_preference", patterns: [/\bremote\b/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "hybrid_preference", patterns: [/\bhybrid\b/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "onsite_preference", patterns: [/\bonsite\b/, /\bon-site\b/, /in office/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "desired_salary", patterns: [/desired salary/, /salary expectation/, /compensation/, /salary requirements/, /pay expectation/], allowedTypes: ["text", "number", "select-one", "textarea"] },
  { intent: "hourly_rate", patterns: [/hourly/, /hourly rate/, /hourly compensation/], allowedTypes: ["text", "number", "select-one", "textarea"] },
  { intent: "availability", patterns: [/availability/, /start date/, /when can you start/, /available to start/], allowedTypes: ["text", "date", "select-one"] },
  { intent: "education_school", patterns: [/school/, /university/, /college/, /institution/], allowedTypes: ["text", "select-one"] },
  { intent: "education_degree", patterns: [/\bdegree\b/], allowedTypes: ["text", "select-one", "search"] },
  { intent: "education_major", patterns: [/major/, /field of study/], allowedTypes: ["text", "select-one"] },
  { intent: "graduation_date", patterns: [/graduation/, /graduated/, /grad date/], allowedTypes: ["text", "date", "month"] },
  { intent: "employer", patterns: [/employer/, /company/, /current company/], allowedTypes: ["text"] },
  { intent: "job_title", patterns: [/job title/, /title/, /position/], allowedTypes: ["text"] },
  { intent: "employment_start_date", patterns: [/start date/, /from date/, /employment start/], allowedTypes: ["text", "date", "month"] },
  { intent: "employment_end_date", patterns: [/end date/, /to date/, /employment end/], allowedTypes: ["text", "date", "month"] },
  { intent: "skills", patterns: [/\bskills\b/, /technologies/, /tech stack/], allowedTypes: ["text", "textarea"] },
  { intent: "why_interested", patterns: [/why are you interested/, /why this role/, /interested in this role/, /why do you want this job/], allowedTypes: ["textarea", "text"] },
  { intent: "tell_us_about_yourself", patterns: [/tell us about yourself/, /about yourself/, /introduce yourself/, /professional summary/], allowedTypes: ["textarea", "text"] },
  { intent: "years_experience", patterns: [/years of experience/, /years experience/], allowedTypes: ["text", "number", "select-one"] },
  { intent: "eeoc_veteran", patterns: [/veteran/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "eeoc_disability", patterns: [/disability/, /disabled/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "eeoc_gender", patterns: [/\bgender\b/, /\bsex\b/, /pronouns?/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "eeoc_race", patterns: [/race/, /ethnicity/, /ethnic/], allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"] },
  { intent: "legal_attestation", patterns: [/attest/, /certify/, /agree/, /consent/, /background check/], allowedTypes: ["checkbox", "radio"] },
  { intent: "city", patterns: [/\bcity\b/, /town/], allowedTypes: ["text"] },
  { intent: "state", patterns: [/\bstate\b/, /province/, /region/], allowedTypes: ["text", "select-one"] },
  { intent: "country", patterns: [/\bcountry\b/], allowedTypes: ["text", "select-one"] },
  { intent: "location", patterns: [/\blocation\b/, /where are you based/], allowedTypes: ["text"] }
];

export const EMAIL_ONLY_SIGNALS = [/\bemail\b/, /e-mail/, /email address/];
