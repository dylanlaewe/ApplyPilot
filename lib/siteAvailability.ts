const UNAVAILABLE_PATTERNS = [
  /job (is )?no longer available/i,
  /this position has been filled/i,
  /page not found/i,
  /page you are looking for doesn't exist/i,
  /job not found/i,
  /posting closed/i,
  /no longer accepting applications/i,
  /position is no longer posted/i,
  /sorry,\s*we couldn't find anything here/i,
  /\(404 error\)/i,
  /job posting you're looking for might have closed/i,
  /job listing no longer exists/i
];

export function detectUnavailableText(text: string) {
  return UNAVAILABLE_PATTERNS.find((pattern) => pattern.test(text))?.source ?? "";
}
