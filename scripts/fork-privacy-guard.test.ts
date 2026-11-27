import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkElectronBuilderConfig,
  checkGeneratedCatalogs,
  checkMobileUpdatesDisabled,
  checkNearIntentsActive,
  checkPluginCatalogs,
  normalizePosixPath,
  scanFile,
} from "./fork-privacy-guard";

async function writeFixture(root: string, relPath: string, content: string): Promise<string> {
  const fullPath = join(root, relPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");
  return fullPath;
}

describe("fork-privacy-guard", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "fork-privacy-guard-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("normalizePosixPath", () => {
    it("normalizes Windows backslashes to POSIX slashes", () => {
      expect(normalizePosixPath("apps\\mobile\\app.json")).toBe("apps/mobile/app.json");
      expect(normalizePosixPath("apps/mobile/app.json")).toBe("apps/mobile/app.json");
    });
  });

  describe("scanFile", () => {
    it("detects analytics.openbot.run", async () => {
      const file = await writeFixture(root, "src/example.ts", 'const url = "https://analytics.openbot.run/api";');
      const violations = await scanFile(file, root);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.label).toBe("analytics.openbot.run endpoint");
    });

    it("detects updates.openbot.run outside apps/mobile/app.json", async () => {
      const file = await writeFixture(
        root,
        "apps/mobile/other.json",
        JSON.stringify({ expo: { updates: { enabled: false, url: "https://updates.openbot.run/manifest" } } }),
      );
      const violations = await scanFile(file, root);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.label).toBe("updates.openbot.run OTA endpoint");
    });

    it("allows updates.openbot.run in apps/mobile/app.json only when updates.enabled is false", async () => {
      const disabledFile = await writeFixture(
        root,
        "apps/mobile/app.json",
        JSON.stringify({ expo: { updates: { enabled: false, url: "https://updates.openbot.run/manifest" } } }),
      );
      expect(await scanFile(disabledFile, root)).toHaveLength(0);

      const enabledFile = await writeFixture(
        root,
        "apps/mobile/app.json",
        JSON.stringify({ expo: { updates: { enabled: true, url: "https://updates.openbot.run/manifest" } } }),
      );
      const enabledViolations = await scanFile(enabledFile, root);
      expect(enabledViolations).toHaveLength(1);
      expect(enabledViolations[0]?.label).toBe("updates.openbot.run OTA endpoint");

      const missingEnabledFile = await writeFixture(
        root,
        "apps/mobile/app.json",
        JSON.stringify({ expo: { updates: { url: "https://updates.openbot.run/manifest" } } }),
      );
      const missingViolations = await scanFile(missingEnabledFile, root);
      expect(missingViolations).toHaveLength(1);
      expect(missingViolations[0]?.label).toBe("updates.openbot.run OTA endpoint");
    });

    it("detects upstream releases URL", async () => {
      const file = await writeFixture(
        root,
        "src/main/download-url.ts",
        'export const RELEASES_URL = "https://github.com/nightly-labs/openbot/releases";',
      );
      const violations = await scanFile(file, root);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.label).toBe("upstream releases URL");
    });

    it("allows clean content and empty releases URL", async () => {
      const file = await writeFixture(
        root,
        "src/main/download-url.ts",
        'export const RELEASES_URL = "";\nconst x = 1;',
      );
      expect(await scanFile(file, root)).toHaveLength(0);
    });

    it("detects multiple violations in same line", async () => {
      const file = await writeFixture(
        root,
        "src/example.ts",
        'fetch("https://analytics.openbot.run") && fetch("https://updates.openbot.run")',
      );
      const violations = await scanFile(file, root);
      expect(violations).toHaveLength(2);
    });
  });

  describe("checkNearIntentsActive", () => {
    it("detects active NEAR Intents gateway", async () => {
      await writeFixture(
        root,
        "src/main/near-intents-gateway.ts",
        `export function createNearIntentsGateway() {
  return {
    owners: () => OWNERS.filter((owner) => owner.enabled),
  };
}`,
      );
      const violations = await checkNearIntentsActive(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.label).toContain("NEAR Intents gateway is active");
    });

    it("allows disabled NEAR Intents gateway", async () => {
      await writeFixture(
        root,
        "src/main/near-intents-gateway.ts",
        `export function createNearIntentsGateway() {
  return {
    owners: () => [],
  };
}`,
      );
      expect(await checkNearIntentsActive(root)).toHaveLength(0);
    });

    it("fails closed when near-intents-gateway.ts is missing", async () => {
      const violations = await checkNearIntentsActive(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.label).toContain("missing or unreadable");
    });
  });

  describe("checkPluginCatalogs", () => {
    it("detects coinbase and robinhood plugin directories", async () => {
      await mkdir(join(root, "marketplace/plugin-catalog/plugins/coinbase"), { recursive: true });
      await mkdir(join(root, "resources/plugin-catalog/robinhood"), { recursive: true });
      await mkdir(join(root, "marketplace/plugin-catalog/plugins/stripe"), { recursive: true });

      const violations = await checkPluginCatalogs(root);
      expect(violations).toHaveLength(2);
      expect(violations.map((v) => v.match).sort()).toEqual(["coinbase", "robinhood"]);
    });

    it("allows clean plugin directories", async () => {
      await mkdir(join(root, "marketplace/plugin-catalog/plugins/stripe"), { recursive: true });
      await mkdir(join(root, "resources/plugin-catalog/notion"), { recursive: true });
      expect(await checkPluginCatalogs(root)).toHaveLength(0);
    });
  });

  describe("checkGeneratedCatalogs", () => {
    it("detects forbidden plugins in generated catalog files", async () => {
      await writeFixture(
        root,
        "src/renderer/src/features/settings/marketplace-plugin-catalog.ts",
        'export const MARKETPLACE_PLUGINS = [{ slug: "coinbase" }];',
      );
      await writeFixture(
        root,
        "apps/mobile/src/features/marketplace/model/plugin-catalog.generated.ts",
        'export const MOBILE_PLUGINS = [{ slug: "robinhood" }];',
      );

      const violations = await checkGeneratedCatalogs(root);
      expect(violations).toHaveLength(2);
      expect(violations.map((v) => v.match).sort()).toEqual(["coinbase", "robinhood"]);
    });

    it("allows clean generated catalog files", async () => {
      await writeFixture(
        root,
        "src/renderer/src/features/settings/marketplace-plugin-catalog.ts",
        'export const MARKETPLACE_PLUGINS = [{ slug: "stripe" }];',
      );
      expect(await checkGeneratedCatalogs(root)).toHaveLength(0);
    });
  });

  describe("checkMobileUpdatesDisabled", () => {
    it("passes when updates.enabled is false", async () => {
      await writeFixture(
        root,
        "apps/mobile/app.json",
        JSON.stringify({ expo: { updates: { enabled: false, url: "https://updates.openbot.run/manifest" } } }),
      );
      expect(await checkMobileUpdatesDisabled(root)).toHaveLength(0);
    });

    it("fails when updates.enabled is true", async () => {
      await writeFixture(
        root,
        "apps/mobile/app.json",
        JSON.stringify({ expo: { updates: { enabled: true, url: "https://updates.openbot.run/manifest" } } }),
      );
      const violations = await checkMobileUpdatesDisabled(root);
      expect(violations).toHaveLength(1);
    });

    it("fails when updates.enabled is missing or updates section is missing", async () => {
      await writeFixture(
        root,
        "apps/mobile/app.json",
        JSON.stringify({ expo: { updates: { url: "https://updates.openbot.run/manifest" } } }),
      );
      expect(await checkMobileUpdatesDisabled(root)).toHaveLength(1);

      await writeFixture(root, "apps/mobile/app.json", JSON.stringify({ expo: {} }));
      expect(await checkMobileUpdatesDisabled(root)).toHaveLength(1);
    });

    it("fails closed when app.json is missing or invalid JSON", async () => {
      const missingViolations = await checkMobileUpdatesDisabled(root);
      expect(missingViolations).toHaveLength(1);
      expect(missingViolations[0]?.label).toContain("missing or unreadable");

      await writeFixture(root, "apps/mobile/app.json", "{ invalid json");
      const invalidViolations = await checkMobileUpdatesDisabled(root);
      expect(invalidViolations).toHaveLength(1);
      expect(invalidViolations[0]?.label).toContain("invalid JSON");
    });
  });

  describe("checkElectronBuilderConfig", () => {
    it("passes when publish is explicitly null without nightly-labs", async () => {
      await writeFixture(root, "electron-builder.yml", "appId: app.openbot.desktop\npublish: null\n");
      expect(await checkElectronBuilderConfig(root)).toHaveLength(0);
    });

    it("fails when publish points to nightly-labs", async () => {
      await writeFixture(
        root,
        "electron-builder.yml",
        "appId: app.openbot.desktop\npublish:\n  provider: github\n  owner: nightly-labs\n  repo: openbot\n",
      );
      const violations = await checkElectronBuilderConfig(root);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations.some((v) => v.match === "nightly-labs")).toBe(true);
    });

    it("fails when publish: null is omitted", async () => {
      await writeFixture(root, "electron-builder.yml", "appId: app.openbot.desktop\n");
      const violations = await checkElectronBuilderConfig(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.match).toBe("publish not null");
    });

    it("fails closed when electron-builder.yml is missing", async () => {
      const violations = await checkElectronBuilderConfig(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.label).toContain("missing or unreadable");
    });
  });
});
