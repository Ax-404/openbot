import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string; allowIf?: string }> = [
  { pattern: /analytics\.openbot\.run/g, label: "analytics.openbot.run endpoint" },
  { pattern: /updates\.openbot\.run/g, label: "updates.openbot.run OTA endpoint", allowIf: "apps/mobile/app.json" },
  { pattern: /https:\/\/github\.com\/nightly-labs\/openbot\/releases/g, label: "upstream releases URL" },
];

const FORBIDDEN_PLUGIN_DIRS = ["coinbase", "robinhood"];

const NEAR_INTENTS_ACTIVE_PATTERN = /owners:\s*\(\)\s*=>\s*OWNERS\.filter/;

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

function checkNearIntentsActive(content: string): boolean {
  return NEAR_INTENTS_ACTIVE_PATTERN.test(content);
}

function checkForbiddenPluginDir(dirName: string): boolean {
  return FORBIDDEN_PLUGIN_DIRS.includes(dirName);
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

  it("detects upstream releases URL", () => {
    const violations = checkContent('const RELEASES_URL = "https://github.com/nightly-labs/openbot/releases";');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.label).toBe("upstream releases URL");
  });

  it("allows clean content", () => {
    const violations = checkContent("const x = 1;");
    expect(violations).toHaveLength(0);
  });

  it("detects multiple violations in same line", () => {
    const violations = checkContent('fetch("https://analytics.openbot.run") && fetch("https://updates.openbot.run")');
    expect(violations).toHaveLength(2);
  });

  it("allows empty releases URL", () => {
    const violations = checkContent('export const RELEASES_URL = "";');
    expect(violations).toHaveLength(0);
  });
});

describe("fork-privacy-guard NEAR Intents check", () => {
  it("detects active NEAR Intents gateway", () => {
    const activeContent = `
export function createNearIntentsGateway(options: NearIntentsGatewayOptions): NearIntentsGateway {
  return {
    owners: () => OWNERS.filter((owner) => owner.enabled),
    fetch: () => activeFetch,
  };
}`;
    expect(checkNearIntentsActive(activeContent)).toBe(true);
  });

  it("allows disabled NEAR Intents gateway", () => {
    const disabledContent = `
export function createNearIntentsGateway(_options: NearIntentsGatewayOptions): NearIntentsGateway {
  return {
    owners: () => [],
    fetch: () => disabled,
  };
}`;
    expect(checkNearIntentsActive(disabledContent)).toBe(false);
  });
});

describe("fork-privacy-guard plugin catalog check", () => {
  it("detects coinbase plugin directory", () => {
    expect(checkForbiddenPluginDir("coinbase")).toBe(true);
  });

  it("detects robinhood plugin directory", () => {
    expect(checkForbiddenPluginDir("robinhood")).toBe(true);
  });

  it("allows other plugin directories", () => {
    expect(checkForbiddenPluginDir("stripe")).toBe(false);
    expect(checkForbiddenPluginDir("notion")).toBe(false);
  });
});

describe("fork-privacy-guard generated catalog check", () => {
  const testDir = join(import.meta.dirname, ".test-catalog-check");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("detects coinbase in generated catalog content", async () => {
    const catalogContent = `
const COINBASE: MarketplacePluginDetail = {
  slug: "coinbase",
  name: "Coinbase",
};
export const MARKETPLACE_PLUGINS = [COINBASE];
`;
    const filePath = join(testDir, "catalog.ts");
    await writeFile(filePath, catalogContent);

    const content = await import("node:fs/promises").then((fs) => fs.readFile(filePath, "utf8"));
    const contentLower = content.toLowerCase();
    const hasForbidden = FORBIDDEN_PLUGIN_DIRS.some((dir) => contentLower.includes(dir));
    expect(hasForbidden).toBe(true);
  });

  it("allows clean generated catalog", async () => {
    const catalogContent = `
const STRIPE: MarketplacePluginDetail = {
  slug: "stripe",
  name: "Stripe",
};
export const MARKETPLACE_PLUGINS = [STRIPE];
`;
    const filePath = join(testDir, "catalog.ts");
    await writeFile(filePath, catalogContent);

    const content = await import("node:fs/promises").then((fs) => fs.readFile(filePath, "utf8"));
    const contentLower = content.toLowerCase();
    const hasForbidden = FORBIDDEN_PLUGIN_DIRS.some((dir) => contentLower.includes(dir));
    expect(hasForbidden).toBe(false);
  });
});

describe("fork-privacy-guard mobile updates check", () => {
  function checkMobileUpdatesConfig(config: { expo?: { updates?: { enabled?: boolean } } }): boolean {
    return config.expo?.updates?.enabled === false;
  }

  it("passes when updates.enabled is false", () => {
    const config = { expo: { updates: { enabled: false, url: "https://updates.openbot.run/manifest" } } };
    expect(checkMobileUpdatesConfig(config)).toBe(true);
  });

  it("fails when updates.enabled is true", () => {
    const config = { expo: { updates: { enabled: true, url: "https://updates.openbot.run/manifest" } } };
    expect(checkMobileUpdatesConfig(config)).toBe(false);
  });

  it("fails when updates.enabled is missing", () => {
    const config = { expo: { updates: { url: "https://updates.openbot.run/manifest" } } };
    expect(checkMobileUpdatesConfig(config)).toBe(false);
  });

  it("fails when updates section is missing", () => {
    const config = { expo: {} };
    expect(checkMobileUpdatesConfig(config)).toBe(false);
  });
});
