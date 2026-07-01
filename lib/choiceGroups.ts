import { RawScannedField } from "@/types";

import { prepareLogicalFields } from "@/lib/fieldLabeling";

export function collapseChoiceFields(fields: RawScannedField[]) {
  return prepareLogicalFields(fields).fields;
}
