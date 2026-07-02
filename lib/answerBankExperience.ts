import { AnswerBankItem } from "@/types";

function questionIncludes(item: AnswerBankItem, fragments: string[]) {
  const text = `${item.canonicalQuestion} ${item.label}`.toLowerCase();
  return fragments.some((fragment) => text.includes(fragment));
}

export function getAnswerReuseLabel(item: AnswerBankItem) {
  if (questionIncludes(item, ["salary", "compensation"])) return "Compensation questions";
  if (questionIncludes(item, ["authorized", "sponsorship", "visa"])) return "Work authorization questions";
  if (questionIncludes(item, ["linkedin", "github", "portfolio", "website"])) return "Professional link fields";
  if (questionIncludes(item, ["about yourself", "introduce"])) return "About-you prompts";
  if (questionIncludes(item, ["why this company", "why company"])) return "Company-interest prompts";
  if (questionIncludes(item, ["why are you interested", "why this role", "why this position"])) return "Role-interest prompts";
  if (questionIncludes(item, ["anything else", "additional information"])) return "Open-ended wrap-up questions";
  return "This exact question or close wording matches";
}

export function getAnswerReviewLabel(item: AnswerBankItem) {
  if (item.sensitivity === "sensitive") return "Always review before reuse";
  if (item.autofillBehavior === "autofill") return "Can fill when the match is exact";
  if (item.autofillBehavior === "ask") return "Always ask before reuse";
  return "Suggest for quick review";
}
