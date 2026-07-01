import { DetectedField } from "@/types";

import { normalizeText } from "@/lib/utils";

const PHONE_INTENTS = new Set(["phone", "phone_number", "full_phone_number", "phone_country_code", "phone_extension"]);

function comparableValue(value: string, field: Pick<DetectedField, "intent">) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (PHONE_INTENTS.has(field.intent)) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits) return digits;
  }

  return normalizeText(trimmed);
}

function fieldAlreadyMatchesSuggestedValue(field: DetectedField) {
  if (!field.suggestedValue.trim() || !field.detectedValue.trim()) return false;

  const detected = comparableValue(field.detectedValue, field);
  const suggested = comparableValue(field.suggestedValue, field);
  if (!detected || !suggested) return false;

  if (PHONE_INTENTS.has(field.intent)) {
    return detected === suggested || detected.endsWith(suggested) || suggested.endsWith(detected);
  }

  return detected === suggested;
}

function scoreFieldAttempt(field: DetectedField) {
  if (field.status === "filled" && field.verificationStatus === "verified") return 5;
  if (field.verificationStatus === "verified" && (field.status === "needs_review" || field.status === "sensitive")) return 4.5;
  if (field.status === "filled") return 4;
  if (field.status === "error" || field.verificationStatus === "failed") return 3;
  if (field.status === "needs_review" || field.status === "sensitive") return 2;
  if (field.status === "skipped") return 1;
  return 0;
}

export function preferDetectedFieldAttempt(existing: DetectedField, incoming: DetectedField) {
  const existingScore = scoreFieldAttempt(existing);
  const incomingScore = scoreFieldAttempt(incoming);
  const withFreshLocator = (preferred: DetectedField, latest: DetectedField) => ({
    ...preferred,
    selector: latest.selector || preferred.selector,
    frameUrl: latest.frameUrl || preferred.frameUrl,
    frameName: latest.frameName || preferred.frameName,
    detectedValue: latest.detectedValue || preferred.detectedValue,
    nearbyText: latest.nearbyText || preferred.nearbyText,
    questionText: latest.questionText || preferred.questionText,
    selectOptions: latest.selectOptions?.length ? latest.selectOptions : preferred.selectOptions
  });

  if (incomingScore > existingScore) {
    return incoming;
  }

  if (incomingScore < existingScore) {
    return withFreshLocator(existing, incoming);
  }

  const existingHasValue = Boolean(existing.detectedValue.trim() || existing.suggestedValue.trim());
  const incomingHasValue = Boolean(incoming.detectedValue.trim() || incoming.suggestedValue.trim());
  if (incomingHasValue && !existingHasValue) {
    return incoming;
  }

  if (incoming.verificationStatus === "verified" && existing.verificationStatus !== "verified") {
    return incoming;
  }

  return withFreshLocator(existing, incoming);
}

export function hydrateAlreadySatisfiedFields(fields: DetectedField[]) {
  for (const field of fields) {
    if (!fieldAlreadyMatchesSuggestedValue(field)) continue;

    field.status = "filled";
    field.reviewCategory = null;
    field.verificationStatus = "verified";
    field.verificationMessage = "Value already present on the page.";
    field.reason = `${field.reason} Value already present on the page.`;
  }

  return fields;
}
