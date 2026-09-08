import type { DocumentField } from "./types";

/**
 * Normalise a single field value into a printable string. Pure helper shared
 * by the review screen (client) and the PDF document (server). Never invents
 * data — empty/missing values become "Not provided".
 */
export function formatFieldValue(field: DocumentField, value: unknown): string {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return "Not provided";
  }
  if (field.type === "checkbox") {
    return value === true ? "Yes" : "No";
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
