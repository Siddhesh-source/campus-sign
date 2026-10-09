export const INSTITUTION_DOMAIN = "vit.edu";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isInstitutionEmail(email: string) {
  return normalizeEmail(email).endsWith(`@${INSTITUTION_DOMAIN}`);
}

/** Dev sign-in exists only outside production AND when explicitly enabled. */
export function devAuthEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.CAMPUSIGN_DEV_AUTH !== "1") return false;
  if (env.NODE_ENV === "production") {
    throw new Error("CAMPUSIGN_DEV_AUTH must not be set in production.");
  }
  return true;
}
