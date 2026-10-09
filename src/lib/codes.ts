/** Pure class-code helpers, shared by server logic and the live preview. */

/** 31 symbols: no 0/O, 1/I/L, so codes survive being read aloud or handwritten. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_SECRET_LENGTH = 5;

export function codePrefix(subjectCode: string, academicYear: string) {
  const letters = subjectCode.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "GEN";
  const yy = /^20\d{2}/.test(academicYear) ? academicYear.slice(2, 4) : "00";
  return `VIT-${letters}${yy}`;
}

/** Case, spaces and dashes don't matter: "vit cs26 k7p9q" → "VITCS26K7P9Q". */
export function toLookupKey(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export const EXPIRY_OPTIONS = ["never", "1", "3", "7", "14", "30", "90"] as const;
export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number];
export const EXPIRY_LABELS: Record<ExpiryOption, string> = {
  never: "Never",
  "1": "In 1 day",
  "3": "In 3 days",
  "7": "In 7 days",
  "14": "In 14 days",
  "30": "In 30 days",
  "90": "In 90 days",
};

export const YEARS_OF_STUDY = ["FY", "SY", "TY", "LY"] as const;

/** "2026-27" for an academic year starting this June (India). */
export function currentAcademicYear(now = new Date()) {
  const y = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
