import type { Page } from "playwright";

import { normalizeText } from "@/lib/utils";

export type ExtractedJobMetadata = {
  company: string;
  roleTitle: string;
  source: string;
};

type MetadataSource =
  | "json_ld"
  | "page_heading"
  | "open_graph"
  | "document_title"
  | "url_fallback"
  | "none";

type MetadataCandidate = {
  raw: string;
  cleaned: string;
  source: MetadataSource;
  confidence: number;
  rejected?: string;
};

const GENERIC_ROLE_HEADINGS = new Set([
  "apply",
  "apply now",
  "application",
  "careers",
  "create account",
  "job details",
  "jobs",
  "join our team",
  "search jobs",
  "sign in",
  "submit application"
]);

const GENERIC_COMPANY_SEGMENTS = new Set(["jobs", "careers", "apply", "job", "external", "application"]);
const WEAK_SINGLE_WORD_TITLES = new Set(["engineer", "developer", "manager", "analyst", "designer", "associate", "specialist"]);

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function titleCaseSlug(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripCommonSuffixes(value: string) {
  return value
    .replace(/\s+\|\s+.*$/i, "")
    .replace(/\s+careers?$/i, "")
    .replace(/\s+jobs?$/i, "")
    .trim();
}

function cleanRoleTitle(value: string, companyHint = "", source: MetadataSource = "none"): MetadataCandidate {
  const raw = cleanText(value);
  let cleaned = raw
    .replace(/^apply for\s+/i, "")
    .replace(/^job application for\s+/i, "")
    .replace(/^careers at\s+/i, "")
    .replace(/\s+[|:*•/\\-]+\s*$/g, "")
    .trim();

  if (companyHint) {
    const normalizedCompany = normalizeText(companyHint);
    const normalizedCleaned = normalizeText(cleaned);
    if (normalizedCompany && normalizedCleaned.includes(normalizedCompany)) {
      cleaned = cleaned.replace(new RegExp(`\\s*(?:at|\\||-|/)\\s*${companyHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$`, "i"), "").trim();
    }
  }

  cleaned = stripCommonSuffixes(cleaned).replace(/\s+[/:|*•-]+\s*$/g, "").trim();
  const normalized = normalizeText(cleaned);

  if (!cleaned) return { raw, cleaned: "", source, confidence: 0, rejected: "empty_after_cleanup" };
  if (GENERIC_ROLE_HEADINGS.has(normalized)) return { raw, cleaned, source, confidence: 0, rejected: "generic_heading" };
  if (/\bcareers?\b/i.test(raw) && !/\b(engineer|developer|manager|designer|analyst|associate|specialist|intern|director|support|teacher|counselor|representative|owner)\b/i.test(cleaned)) {
    return { raw, cleaned, source, confidence: 0, rejected: "generic_careers_heading" };
  }
  if (/^[^a-z0-9]+$/i.test(cleaned)) return { raw, cleaned, source, confidence: 0, rejected: "punctuation_only" };
  if (cleaned.length < 4) return { raw, cleaned, source, confidence: 0, rejected: "too_short" };
  if (/[/:|*•-]\s*$/.test(raw)) {
    const tokenCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (tokenCount <= 1 || WEAK_SINGLE_WORD_TITLES.has(normalized)) {
      return { raw, cleaned, source, confidence: 0, rejected: "malformed_trailing_separator" };
    }
  }

  return {
    raw,
    cleaned,
    source,
    confidence: source === "json_ld" ? 0.99 : source === "page_heading" ? 0.9 : source === "open_graph" ? 0.84 : source === "document_title" ? 0.76 : 0.68
  };
}

function cleanCompanyName(value: string, source: MetadataSource = "none"): MetadataCandidate {
  const raw = cleanText(value);
  const cleaned = stripCommonSuffixes(raw).replace(/\bcareers?\b/i, "").trim();
  const normalized = normalizeText(cleaned);

  if (!cleaned) return { raw, cleaned: "", source, confidence: 0, rejected: "empty_after_cleanup" };
  if (GENERIC_COMPANY_SEGMENTS.has(normalized)) return { raw, cleaned, source, confidence: 0, rejected: "generic_segment" };
  if (/[/:|*•-]\s*$/.test(raw)) return { raw, cleaned, source, confidence: 0, rejected: "malformed_trailing_separator" };

  return {
    raw,
    cleaned,
    source,
    confidence: source === "json_ld" ? 0.99 : source === "page_heading" ? 0.9 : source === "open_graph" ? 0.84 : source === "url_fallback" ? 0.74 : 0.7
  };
}

function splitCombinedTitle(value: string) {
  const normalized = cleanText(value);
  if (!normalized) return { roleTitle: "", company: "" };

  const patterns = [
    /^(?<role>.+?)\s+at\s+(?<company>.+)$/i,
    /^(?<role>.+?)\s+\|\s+(?<company>.+)$/i,
    /^(?<role>.+?)\s+-\s+(?<company>.+)$/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.groups?.role && match.groups.company) {
      return {
        roleTitle: cleanText(match.groups.role),
        company: cleanText(match.groups.company)
      };
    }
  }

  return { roleTitle: normalized, company: "" };
}

function extractCompanyFromKnownRole(combinedTitle: string, knownRole: string, source: MetadataSource): MetadataCandidate | null {
  const normalizedTitle = cleanText(combinedTitle);
  const normalizedRole = cleanText(knownRole);
  if (!normalizedTitle || !normalizedRole) return null;

  const titleIndex = normalizedTitle.toLowerCase().indexOf(normalizedRole.toLowerCase());
  if (titleIndex === -1) return null;

  const prefix = normalizedTitle
    .slice(0, titleIndex)
    .replace(/\s*[|:•/\\-]+\s*$/g, "")
    .trim();
  const suffix = normalizedTitle
    .slice(titleIndex + normalizedRole.length)
    .replace(/^\s*[|:•/\\-]+\s*/g, "")
    .trim();

  const prefixCandidate = cleanCompanyName(prefix, source);
  if (!prefixCandidate.rejected) {
    return prefixCandidate;
  }

  const suffixCandidate = cleanCompanyName(suffix, source);
  if (!suffixCandidate.rejected) {
    return suffixCandidate;
  }

  return null;
}

function extractCompanyFromUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);

    let slug = "";
    if (host.includes("greenhouse.io")) {
      slug = segments[0] === "jobs" ? "" : segments[0] || "";
    } else if (host.includes("lever.co")) {
      slug = segments[0] || "";
    } else if (host.includes("ashbyhq.com")) {
      slug = segments[0] || "";
    } else if (host.includes("workable.com")) {
      slug = segments[0] || "";
    } else if (host.includes("smartrecruiters.com")) {
      slug = segments[0] || "";
    } else if (host.includes("jobvite.com")) {
      slug = segments[0] || "";
    } else if (host.includes("myworkdayjobs.com")) {
      slug = segments.find((segment) => !GENERIC_COMPANY_SEGMENTS.has(normalizeText(segment))) || "";
    }

    const normalizedSlug = normalizeText(slug);
    if (!slug || GENERIC_COMPANY_SEGMENTS.has(normalizedSlug) || /^\d+$/.test(slug)) return "";
    return titleCaseSlug(slug);
  } catch {
    return "";
  }
}

function extractApplyForTitle(pageTitle: string, source: MetadataSource) {
  const match = cleanText(pageTitle).match(/^(?<company>.+?)\s+careers?\s*-\s*apply for\s+(?<role>.+)$/i);
  if (!match?.groups?.company || !match.groups.role) return null;

  const company = cleanCompanyName(match.groups.company, source);
  const roleTitle = cleanRoleTitle(match.groups.role, match.groups.company, source);
  if (company.rejected || roleTitle.rejected) return null;

  return { company, roleTitle };
}

function chooseBestCompanyCandidate(companyCandidates: MetadataCandidate[], bestRole: MetadataCandidate | undefined) {
  if (!companyCandidates.length) return undefined;

  const normalizedRole = normalizeText(bestRole?.cleaned || "");
  const nonDuplicatedCandidates = normalizedRole
    ? companyCandidates.filter((candidate) => {
        const normalizedCandidate = normalizeText(candidate.cleaned);
        if (!normalizedCandidate) return false;
        if (normalizedCandidate === normalizedRole) return false;
        if (normalizedRole.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedRole)) return false;
        return true;
      })
    : companyCandidates;

  const rankedPool = nonDuplicatedCandidates.length ? nonDuplicatedCandidates : companyCandidates;
  return rankedPool.sort((a, b) => b.confidence - a.confidence)[0];
}

export async function extractJobMetadata(page: Page): Promise<ExtractedJobMetadata> {
  const firstText = async (selectors: string[]) => {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const count = await locator.count().catch(() => 0);
      if (!count) continue;
      const text = cleanText(await locator.textContent({ timeout: 250 }).catch(() => ""));
      if (text) return text;
    }
    return "";
  };

  const firstAttr = async (selector: string, attribute: string) => {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) return "";
    return cleanText(await locator.getAttribute(attribute, { timeout: 250 }).catch(() => ""));
  };

  const jsonLdTexts = await page.locator('script[type="application/ld+json"]').allTextContents().catch(() => []);
  const jsonLd: Array<Record<string, unknown>> = [];
  for (const text of jsonLdTexts) {
    try {
      const parsed = JSON.parse(text || "null");
      if (Array.isArray(parsed)) {
        jsonLd.push(...parsed.filter(Boolean));
      } else if (parsed && typeof parsed === "object") {
        jsonLd.push(parsed);
      }
    } catch {
      continue;
    }
  }

  const jobPosting = jsonLd.find((item) => item["@type"] === "JobPosting") as
    | { title?: string; hiringOrganization?: { name?: string } }
    | undefined;

  const extracted = {
    jsonLdTitle: cleanText(jobPosting?.title),
    jsonLdCompany: cleanText(jobPosting?.hiringOrganization?.name),
    ogTitle: await firstAttr('meta[property="og:title"]', "content"),
    ogSiteName: await firstAttr('meta[property="og:site_name"]', "content"),
    pageTitle: cleanText(await page.title().catch(() => "")),
    heading: await firstText([
      "[data-qa='job-title']",
      "[data-testid='job-title']",
      ".posting-headline h1",
      ".posting-headline h2",
      ".job-title",
      "h1",
      "h2"
    ]),
    subheading: await firstText([
      "[data-qa='company-name']",
      "[data-testid='company-name']",
      ".posting-headline h3",
      ".company-name",
      ".posting-categories .department"
    ])
  };

  const companyCandidates: MetadataCandidate[] = [];
  const roleCandidates: MetadataCandidate[] = [];

  const jsonLdRole = cleanRoleTitle(extracted.jsonLdTitle, extracted.jsonLdCompany, "json_ld");
  if (!jsonLdRole.rejected) roleCandidates.push(jsonLdRole);

  const jsonLdCompany = cleanCompanyName(extracted.jsonLdCompany, "json_ld");
  if (!jsonLdCompany.rejected) companyCandidates.push(jsonLdCompany);

  const headingRole = cleanRoleTitle(extracted.heading, extracted.subheading || extracted.jsonLdCompany, "page_heading");
  if (!headingRole.rejected) roleCandidates.push(headingRole);

  const headingCompany = cleanCompanyName(extracted.subheading, "page_heading");
  if (!headingCompany.rejected) companyCandidates.push(headingCompany);

  const ogCompanyFromHeading = extractCompanyFromKnownRole(extracted.ogTitle, extracted.heading, "open_graph");
  if (ogCompanyFromHeading) companyCandidates.push(ogCompanyFromHeading);

  const ogSplit = splitCombinedTitle(extracted.ogTitle);
  const ogRole = cleanRoleTitle(ogSplit.roleTitle || extracted.ogTitle, ogSplit.company || extracted.ogSiteName, "open_graph");
  if (!ogRole.rejected) roleCandidates.push(ogRole);
  const ogCompany = cleanCompanyName(ogSplit.company || extracted.ogSiteName, "open_graph");
  if (!ogCompany.rejected) companyCandidates.push(ogCompany);

  const applyForOg = extractApplyForTitle(extracted.ogTitle, "open_graph");
  if (applyForOg) {
    roleCandidates.push(applyForOg.roleTitle);
    companyCandidates.push(applyForOg.company);
  }

  const titleCompanyFromHeading = extractCompanyFromKnownRole(extracted.pageTitle, extracted.heading, "document_title");
  if (titleCompanyFromHeading) companyCandidates.push(titleCompanyFromHeading);

  const titleSplit = splitCombinedTitle(extracted.pageTitle);
  const titleRole = cleanRoleTitle(titleSplit.roleTitle || extracted.pageTitle, titleSplit.company || extracted.subheading, "document_title");
  if (!titleRole.rejected) roleCandidates.push(titleRole);
  const titleCompany = cleanCompanyName(titleSplit.company, "document_title");
  if (!titleCompany.rejected) companyCandidates.push(titleCompany);

  const applyForTitle = extractApplyForTitle(extracted.pageTitle, "document_title");
  if (applyForTitle) {
    roleCandidates.push(applyForTitle.roleTitle);
    companyCandidates.push(applyForTitle.company);
  }

  const urlCompany = cleanCompanyName(extractCompanyFromUrl(page.url()), "url_fallback");
  if (!urlCompany.rejected) companyCandidates.push(urlCompany);

  const bestRole = roleCandidates.sort((a, b) => b.confidence - a.confidence)[0];
  const bestCompany = chooseBestCompanyCandidate(companyCandidates, bestRole);

  return {
    roleTitle: bestRole?.cleaned ?? "",
    company: bestCompany?.cleaned ?? "",
    source: bestRole?.source || bestCompany?.source || "none"
  };
}

export function buildSessionHeading(roleTitle: string, company: string) {
  const normalizedRole = cleanRoleTitle(roleTitle).cleaned;
  const normalizedCompany = cleanCompanyName(company).cleaned;

  if (normalizedRole && normalizedCompany) {
    return `${normalizedRole} · ${normalizedCompany}`;
  }

  if (normalizedRole) return normalizedRole;
  if (normalizedCompany) return `Application at ${normalizedCompany}`;
  return "Application";
}

export function shouldDisplayCompanyOrRole(value: string) {
  const normalized = normalizeText(cleanText(value));
  return Boolean(normalized && !["unknown company", "unknown role", "untitled role"].includes(normalized));
}
