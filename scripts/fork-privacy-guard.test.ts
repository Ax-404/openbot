import { describe, expect, it } from "vitest";

const FORBIDDEN_PATTERNS = [
  { pattern: /analytics\.openbot\.run/g, label: "analytics.openbot.run endpoint" },
  { pattern: /updates\.openbot\.run/g, label: "updates.openbot.run OTA endpoint" },
];

function checkContent(content: string): { label: string; match: string }[] {
  const violations: { label: string; match: string }[] = [];
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
      violations.push({ label, match: match[0] });
    }
  }
  return violations;
}

describe("fork-privacy-guard patterns", () => {
  it("detects analytics.openbot.run", () => {
    const violations = checkContent('const url = "https://analytics.openbot.run/api";');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.label).toBe("analytics.openbot.run endpoint");
  });

  it("detects updates.openbot.run", () => {
    const violations = checkContent('"url": "https://updates.openbot.run/manifest"');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.label).toBe("updates.openbot.run OTA endpoint");
  });

  it("allows clean content", () => {
    const violations = checkContent("const x = 1;");
    expect(violations).toHaveLength(0);
  });

  it("detects multiple violations in same line", () => {
    const violations = checkContent('fetch("https://analytics.openbot.run") && fetch("https://updates.openbot.run")');
    expect(violations).toHaveLength(2);
  });
});
