import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, codePrefix, currentAcademicYear, toLookupKey } from "@/lib/codes";
import { devAuthEnabled, isInstitutionEmail } from "@/lib/identity";
import { generateCode } from "@/server/classes";

describe("class codes", () => {
  it("formats as VIT-<SUBJ><YY>-<5 unambiguous chars>", () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateCode(codePrefix("CS2101", "2026-27"));
      expect(code).toMatch(/^VIT-CS26-[A-Z2-9]{5}$/);
      for (const ch of code.slice(-5)) expect(CODE_ALPHABET).toContain(ch);
      expect(code.slice(-5)).not.toMatch(/[01OIL]/);
    }
  });

  it("builds the prefix from subject letters and academic year", () => {
    expect(codePrefix("cs2101", "2026-27")).toBe("VIT-CS26");
    expect(codePrefix("MECH301", "2027-28")).toBe("VIT-MECH27");
    expect(codePrefix("2101", "2026-27")).toBe("VIT-GEN26");
  });

  it("normalizes case, spaces and dashes for lookup", () => {
    expect(toLookupKey(" vit cs26-k7p9q ")).toBe("VITCS26K7P9Q");
    expect(toLookupKey("VIT-CS26-K7P9Q")).toBe(toLookupKey("vitcs26k7p9q"));
  });

  it("derives the academic year starting in June", () => {
    expect(currentAcademicYear(new Date("2026-10-09"))).toBe("2026-27");
    expect(currentAcademicYear(new Date("2027-03-01"))).toBe("2026-27");
  });
});

describe("identity", () => {
  it("accepts only vit.edu addresses", () => {
    expect(isInstitutionEmail("A.B@VIT.EDU")).toBe(true);
    expect(isInstitutionEmail("a@gmail.com")).toBe(false);
    expect(isInstitutionEmail("a@vit.edu.evil.com")).toBe(false);
    expect(isInstitutionEmail("a@notvit.edu")).toBe(false);
  });

  it("dev sign-in requires the flag and is impossible in production", () => {
    expect(devAuthEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(devAuthEnabled({ NODE_ENV: "development", CAMPUSIGN_DEV_AUTH: "1" })).toBe(true);
    expect(() => devAuthEnabled({ NODE_ENV: "production", CAMPUSIGN_DEV_AUTH: "1" })).toThrow(/production/);
  });
});
