import { ApplicantProfile, CompensationProfile, RawScannedField } from "@/types";

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatSalaryText(compensation: CompensationProfile, field: RawScannedField) {
  const isNumericField = field.type === "number";
  const { minimumSalary, targetSalary, highSalary, answerStyle } = compensation;

  if (answerStyle === "ask") return "";
  if (answerStyle === "negotiable") return isNumericField ? "" : "Negotiable";
  if (!targetSalary && !minimumSalary) return "";

  if (isNumericField) {
    return String(targetSalary ?? minimumSalary ?? "");
  }

  if (answerStyle === "target") {
    return targetSalary ? currency(targetSalary) : "";
  }

  if (answerStyle === "range") {
    if (minimumSalary && highSalary) return `${currency(minimumSalary)} - ${currency(highSalary)}`;
    if (minimumSalary && targetSalary) return `${currency(minimumSalary)} - ${currency(targetSalary)}`;
    return targetSalary ? currency(targetSalary) : "";
  }

  return "";
}

export function formatHourlyRateText(compensation: CompensationProfile, field: RawScannedField) {
  const isNumericField = field.type === "number";
  const value = compensation.hourlyTarget ?? compensation.hourlyMinimum;
  if (!value || compensation.answerStyle === "ask") return "";
  if (compensation.answerStyle === "negotiable") return isNumericField ? "" : "Negotiable";
  return isNumericField ? String(value) : `$${value}/hr`;
}

export function formatAvailabilityText(profile: ApplicantProfile, field: RawScannedField) {
  const { startTiming, customStartDate } = profile.availabilityProfile;
  if (startTiming === "ask") return "";
  if (field.type === "date") return startTiming === "custom_date" ? customStartDate : "";

  switch (startTiming) {
    case "immediately":
      return "Immediately";
    case "1_week":
      return "1 week";
    case "2_weeks":
      return "2 weeks";
    case "3_weeks":
      return "3 weeks";
    case "1_month":
      return "1 month";
    case "custom_date":
      return customStartDate;
    default:
      return "";
  }
}

export function formatLocation(profile: ApplicantProfile) {
  return [profile.identity.city, profile.identity.stateProvince, profile.identity.country].filter(Boolean).join(", ");
}
