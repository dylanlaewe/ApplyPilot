import { EducationEntry, GraduationDateType, GraduationStatus } from "@/types";

import { normalizeText } from "@/lib/utils";

const COMPLETED_ALIASES = new Set(["completed", "complete", "graduated", "graduate", "yes", "actual", "done"]);
const EXPECTED_ALIASES = new Set(["expected", "expected graduation", "expected_to_graduate", "anticipated"]);
const ENROLLED_ALIASES = new Set(["currently_enrolled", "current", "in progress", "enrolled", "attending"]);
const INCOMPLETE_ALIASES = new Set(["incomplete", "did_not_complete", "did not complete", "no", "unfinished"]);

function normalized(value: string | null | undefined) {
  return normalizeText(value ?? "");
}

export function normalizeGraduationStatus(
  value: string | null | undefined,
  graduationDateType?: string | null,
  graduationDate?: string | null
): GraduationStatus {
  const status = normalized(value);
  const dateType = normalizeGraduationDateType(graduationDateType);
  const hasDate = Boolean((graduationDate ?? "").toString().trim());

  if (COMPLETED_ALIASES.has(status)) return "completed";
  if (ENROLLED_ALIASES.has(status)) return "currently_enrolled";
  if (EXPECTED_ALIASES.has(status)) return "expected";
  if (INCOMPLETE_ALIASES.has(status)) return "incomplete";
  if (!status && dateType === "actual" && hasDate) return "completed";
  if (!status && dateType === "expected" && hasDate) return "expected";
  if (!status) return "not_applicable";

  return "not_applicable";
}

export function normalizeGraduationDateType(value: string | null | undefined): GraduationDateType {
  const dateType = normalized(value);
  if (dateType === "actual" || dateType === "completed") return "actual";
  if (dateType === "expected" || dateType === "anticipated") return "expected";
  return "not_applicable";
}

export function isEducationCompleted(entry: Pick<EducationEntry, "graduationStatus" | "graduationDateType" | "graduationDate">) {
  const status = normalizeGraduationStatus(entry.graduationStatus, entry.graduationDateType, entry.graduationDate);
  const dateType = normalizeGraduationDateType(entry.graduationDateType);
  return status === "completed" || dateType === "actual";
}

export function isEducationInProgress(entry: Pick<EducationEntry, "graduationStatus" | "graduationDateType" | "graduationDate">) {
  const status = normalizeGraduationStatus(entry.graduationStatus, entry.graduationDateType, entry.graduationDate);
  const dateType = normalizeGraduationDateType(entry.graduationDateType);
  return status === "currently_enrolled" || status === "expected" || dateType === "expected";
}

export function deriveGraduatedAnswer(entry: Pick<EducationEntry, "graduationStatus" | "graduationDateType" | "graduationDate">) {
  if (isEducationCompleted(entry)) return "yes";
  if (isEducationInProgress(entry)) return "no";

  const status = normalizeGraduationStatus(entry.graduationStatus, entry.graduationDateType, entry.graduationDate);
  if (status === "incomplete") return "no";
  return "";
}
