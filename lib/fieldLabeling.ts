import { RawScannedField } from "@/types";

import { normalizeText } from "@/lib/utils";

type LogicalFieldPreparationStats = {
  rawCandidates: number;
  noiseRejected: number;
  groupedControls: number;
  deduplicatedFields: number;
  logicalFields: number;
};

const NOISE_PHRASES = [
  /svgs not supported by this browser\.?/gi,
  /\bstart typing\.{0,3}\b/gi,
  /\btype here\.{0,3}\b/gi,
  /\bselect an option\.{0,3}\b/gi,
  /\bselect\.{0,3}\b/gi,
  /\bchoose\.{0,3}\b/gi,
  /\bcombobox\b/gi,
  /\boption\b/gi
];

const INTERNAL_ID_PATTERNS = [
  /\bca_\d+\b/gi,
  /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi,
  /\b(?:input|textarea|field|select|option|prompt|button|radio|checkbox|combobox|listbox|menu|jv-field|_systemfield)[-_][a-z0-9_-]{4,}\b/gi
];

const GENERATED_CLASS_PATTERN = /\b[a-z]+(?:[-_][a-z0-9]+){3,}\b/gi;
const GENERIC_LABELS = new Set(["select", "choose", "combobox", "option", "start typing", "type here"]);
const UTILITY_CONTROL_PATTERNS = [/^share(?: this job)?$/i, /^copy link$/i, /^share job$/i];
function cleanWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function stripNoise(text: string) {
  let next = cleanWhitespace(text);
  for (const pattern of INTERNAL_ID_PATTERNS) {
    next = next.replace(pattern, " ");
  }
  next = next.replace(GENERATED_CLASS_PATTERN, " ");
  for (const pattern of NOISE_PHRASES) {
    next = next.replace(pattern, " ");
  }
  next = next.replace(/[_]+/g, " ");
  next = next.replace(/[|]+/g, " ");
  return cleanWhitespace(next);
}

function collapseRepeatedTokens(text: string) {
  const tokens = cleanWhitespace(text).split(" ").filter(Boolean);
  if (!tokens.length) return "";
  const compact = tokens.filter((token, index) => index === 0 || normalizeText(token) !== normalizeText(tokens[index - 1]));
  if (new Set(compact.map((token) => normalizeText(token))).size === 1) {
    return compact[0];
  }

  const compactText = compact.join(" ");
  const midpoint = Math.floor(compact.length / 2);
  if (compact.length >= 6) {
    const left = compact.slice(0, midpoint).join(" ");
    const right = compact.slice(midpoint).join(" ");
    if (normalizeText(left) === normalizeText(right)) {
      return left;
    }
  }

  return compactText;
}

function cleanupPunctuation(text: string) {
  return cleanWhitespace(
    text
      .replace(/\s*([:;,.!?])\s*/g, "$1 ")
      .replace(/\(\s*\)/g, " ")
      .replace(/\[\s*\]/g, " ")
      .replace(/\s{2,}/g, " ")
  );
}

export function sanitizeFieldLabel(value: string | null | undefined) {
  const stripped = stripNoise(value ?? "");
  const collapsed = collapseRepeatedTokens(stripped);
  const cleaned = cleanupPunctuation(collapsed);
  return cleaned.replace(/^[*•\-\s]+/g, "").replace(/[,:;.\-/_\s]+$/g, "").trim();
}

export function isDomNoiseLabel(value: string | null | undefined) {
  const cleaned = sanitizeFieldLabel(value);
  if (!cleaned) return true;

  const normalized = normalizeText(cleaned);
  if (!normalized) return true;
  if (GENERIC_LABELS.has(normalized)) return true;
  if (/^[^a-z0-9]*$/i.test(cleaned)) return true;
  if (/^[a-z]{1,4}\d{2,}$/i.test(normalized.replace(/\s+/g, ""))) return true;
  if (/^(?:ca\s+\d+|field \d+)$/.test(normalized)) return true;
  if (/^[a-f0-9-]{12,}$/i.test(cleaned)) return true;
  return false;
}

function buildCandidateLabels(field: RawScannedField) {
  return [
    { value: field.explicitLabel, source: "explicit_label" },
    { value: field.ariaLabelledByText, source: "aria_labelledby" },
    { value: field.ariaLabel, source: "aria_label" },
    { value: field.groupLabel || field.legendText, source: "legend" },
    { value: field.questionContainerText, source: "question_container" },
    { value: field.nearbyText, source: "nearby_text" },
    { value: field.placeholder, source: "placeholder" }
  ];
}

function fallbackIdentifier(field: RawScannedField) {
  const candidates = [field.name, field.domId]
    .map((value) => sanitizeFieldLabel(value))
    .filter((value) => value && !isDomNoiseLabel(value));
  return candidates[0] || "Untitled field";
}

function deriveLogicalLabel(field: RawScannedField) {
  for (const candidate of buildCandidateLabels(field)) {
    const cleaned = sanitizeFieldLabel(candidate.value);
    if (!cleaned || isDomNoiseLabel(cleaned)) continue;
    if (candidate.source === "placeholder" && buildCandidateLabels(field).some((entry) => entry !== candidate && sanitizeFieldLabel(entry.value))) {
      continue;
    }
    return { label: cleaned, source: candidate.source };
  }

  return { label: fallbackIdentifier(field), source: "fallback_identifier" };
}

function sanitizeNearbyText(field: RawScannedField, logicalLabel: string) {
  const candidates = [field.questionContainerText, field.groupLabel, field.nearbyText, field.placeholder];
  for (const candidate of candidates) {
    const cleaned = sanitizeFieldLabel(candidate);
    if (!cleaned || isDomNoiseLabel(cleaned)) continue;
    if (normalizeText(cleaned) === normalizeText(logicalLabel) && cleaned.split(" ").length <= 3) {
      return cleaned;
    }
    return cleaned;
  }
  return logicalLabel;
}

function looksLikeChoiceField(field: RawScannedField) {
  return field.type === "radio" || field.type === "checkbox" || field.controlType === "radio" || field.controlType === "checkbox";
}

function looksLikeUtilityControl(field: RawScannedField) {
  if (!["menu_button", "custom_select", "listbox"].includes(field.controlType || "")) {
    return false;
  }

  if (field.name || field.domId || field.selectOptions?.length || field.isRequired) {
    return false;
  }

  const label = sanitizeFieldLabel(field.label || field.explicitLabel || field.ariaLabel || field.nearbyText);
  if (!label) return false;

  return UTILITY_CONTROL_PATTERNS.some((pattern) => pattern.test(label));
}

function isLikelyRealControl(field: RawScannedField) {
  if (field.isDisabled) return false;
  if (looksLikeUtilityControl(field)) return false;
  if (looksLikeChoiceField(field) && !field.name && !field.groupKey && !field.questionContainerText && !field.legendText && !field.nearbyText) {
    return false;
  }
  return [
    "text",
    "email",
    "tel",
    "search",
    "textarea",
    "select-one",
    "select-multiple",
    "file",
    "radio",
    "checkbox"
  ].includes(field.type) || ["native_select", "aria_combobox", "autocomplete", "listbox", "custom_select", "menu_button", "radio", "checkbox"].includes(field.controlType || "");
}

function choiceGroupKey(field: RawScannedField) {
  if (!looksLikeChoiceField(field)) return "";

  const explicitGroupKey = sanitizeFieldLabel(field.groupKey);
  if (explicitGroupKey && !isDomNoiseLabel(explicitGroupKey)) {
    return `${field.type}:${normalizeText(explicitGroupKey)}`;
  }

  const name = sanitizeFieldLabel(field.name);
  if (name && !isDomNoiseLabel(name)) return `${field.type}:name:${normalizeText(name)}`;

  const domId = sanitizeFieldLabel(field.domId);
  if (domId && !isDomNoiseLabel(domId)) return `${field.type}:id:${normalizeText(domId)}`;

  const label = sanitizeFieldLabel(field.groupLabel || field.legendText || field.questionContainerText || field.nearbyText);
  if (label && !isDomNoiseLabel(label)) return `${field.type}:label:${normalizeText(label)}`;

  return "";
}

function normalizeChoiceOption(field: RawScannedField) {
  return sanitizeFieldLabel(field.optionLabel || field.label || field.detectedValue);
}

export function groupChoiceControls(fields: RawScannedField[]) {
  const collapsed: RawScannedField[] = [];
  const grouped = new Map<string, RawScannedField[]>();
  let groupedControls = 0;

  for (const field of fields) {
    const key = choiceGroupKey(field);
    if (!key) {
      collapsed.push(field);
      continue;
    }

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(field);
  }

  for (const group of grouped.values()) {
    if (group.length <= 1) {
      collapsed.push(group[0]);
      continue;
    }

    groupedControls += group.length - 1;
    const first = group[0];
    const logicalLabel = sanitizeFieldLabel(first.groupLabel || first.legendText || first.questionContainerText || first.nearbyText) || first.label;
    const options = Array.from(
      new Set(group.map(normalizeChoiceOption).filter((option) => option && !isDomNoiseLabel(option)))
    );

    collapsed.push({
      ...first,
      label: logicalLabel,
      nearbyText: sanitizeNearbyText(first, logicalLabel),
      selectOptions: Array.from(new Set([...(first.selectOptions ?? []), ...options])),
      detectedValue: group
        .filter((field) => cleanWhitespace(field.detectedValue).toLowerCase() === "checked")
        .map(normalizeChoiceOption)
        .filter(Boolean)
        .join(", "),
      labelSource: "grouped_choice"
    });
  }

  return { fields: collapsed, groupedControls };
}

function dedupeKey(field: RawScannedField) {
  return [
    normalizeText(field.frameUrl || ""),
    normalizeText(field.groupKey || ""),
    normalizeText(field.name || ""),
    normalizeText(field.domId || ""),
    normalizeText(field.label || ""),
    normalizeText(field.type || "")
  ].join("::");
}

function choosePreferredField(current: RawScannedField, candidate: RawScannedField) {
  const currentScore =
    (current.labelSource === "explicit_label" ? 5 : 0) +
    (current.selectOptions?.length ?? 0) +
    (current.label.split(" ").length > 1 ? 2 : 0);
  const candidateScore =
    (candidate.labelSource === "explicit_label" ? 5 : 0) +
    (candidate.selectOptions?.length ?? 0) +
    (candidate.label.split(" ").length > 1 ? 2 : 0);

  return candidateScore > currentScore ? candidate : current;
}

export function deduplicateDetectedFields(fields: RawScannedField[]) {
  const deduped = new Map<string, RawScannedField>();
  let deduplicatedFields = 0;

  for (const field of fields) {
    const key = dedupeKey(field);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, field);
      continue;
    }

    deduplicatedFields += 1;
    deduped.set(key, choosePreferredField(existing, field));
  }

  return { fields: Array.from(deduped.values()), deduplicatedFields };
}

export function prepareLogicalFields(fields: RawScannedField[]) {
  const rawCandidates = fields.length;
  const sanitized = fields
    .map((field) => {
      const logical = deriveLogicalLabel(field);
      return {
        ...field,
        label: logical.label,
        nearbyText: sanitizeNearbyText(field, logical.label),
        optionLabel: sanitizeFieldLabel(field.optionLabel || field.label),
        explicitLabel: sanitizeFieldLabel(field.explicitLabel),
        ariaLabelledByText: sanitizeFieldLabel(field.ariaLabelledByText),
        legendText: sanitizeFieldLabel(field.legendText),
        questionContainerText: sanitizeFieldLabel(field.questionContainerText),
        groupLabel: sanitizeFieldLabel(field.groupLabel),
        labelSource: logical.source
      };
    })
    .filter((field) => !isDomNoiseLabel(field.label))
    .filter((field) => !looksLikeUtilityControl(field));

  const noiseRejected = rawCandidates - sanitized.length;
  const fallbackSanitized =
    sanitized.length === 0 && rawCandidates > 0
      ? fields
          .filter(isLikelyRealControl)
          .map((field, index) => {
            const fallbackLabel =
              sanitizeFieldLabel(field.questionContainerText) ||
              sanitizeFieldLabel(field.nearbyText) ||
              sanitizeFieldLabel(field.explicitLabel) ||
              sanitizeFieldLabel(field.ariaLabelledByText) ||
              sanitizeFieldLabel(field.ariaLabel) ||
              sanitizeFieldLabel(field.placeholder) ||
              sanitizeFieldLabel(field.name) ||
              sanitizeFieldLabel(field.domId) ||
              `${field.type || field.controlType || "field"} field ${index + 1}`;

            return {
              ...field,
              label: fallbackLabel,
              nearbyText: sanitizeNearbyText(field, fallbackLabel),
              optionLabel: sanitizeFieldLabel(field.optionLabel || field.label),
              explicitLabel: sanitizeFieldLabel(field.explicitLabel),
              ariaLabelledByText: sanitizeFieldLabel(field.ariaLabelledByText),
              legendText: sanitizeFieldLabel(field.legendText),
              questionContainerText: sanitizeFieldLabel(field.questionContainerText),
              groupLabel: sanitizeFieldLabel(field.groupLabel),
              labelSource: "structure_fallback"
            };
          })
      : sanitized;
  const grouped = groupChoiceControls(fallbackSanitized);
  const deduped = deduplicateDetectedFields(grouped.fields);

  return {
    fields: deduped.fields,
    stats: {
      rawCandidates,
      noiseRejected,
      groupedControls: grouped.groupedControls,
      deduplicatedFields: deduped.deduplicatedFields,
      logicalFields: deduped.fields.length
    } satisfies LogicalFieldPreparationStats
  };
}

export type { LogicalFieldPreparationStats };
