#!/usr/bin/env bun
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

interface ForbiddenPattern {
  pattern: RegExp;
  label: string;
  allowIf?: (relPosix: string, content: string) => boolean;
}

function isMobileUpdatesDisabledConfig(config: unknown): boolean {
  if (typeof config !== "object" || config === null || Array.isArray(config)) return false;
  const expo = Object.entries(config).find(([key]) => key === "expo")?.[1];
  if (typeof expo !== "object" || expo === null || Array.isArray(expo)) return false;
  const updates = Object.entries(expo).find(([key]) => key === "updates")?.[1];
  if (typeof updates !== "object" || updates === null || Array.isArray(updates)) return false;
  const enabled = Object.entries(updates).find(([key]) => key === "enabled")?.[1];
  return enabled === false;
}

function isMobileUpdatesDisabledJson(content: string): boolean {
  try {
    return isMobileUpdatesDisabledConfig(JSON.parse(content));
  } catch {
    return false;
  }
}

export function normalizePosixPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

const FORBIDDEN_PATTERNS: readonly ForbiddenPattern[] = [
  { pattern: /analytics\.openbot\.run/g, label: "analytics.openbot.run endpoint" },
  {
    pattern: /updates\.openbot\.run/g,
    label: "updates.openbot.run OTA endpoint",
    allowIf: (relPosix, content) => relPosix === "apps/mobile/app.json" && isMobileUpdatesDisabledJson(content),
  },
  { pattern: /https:\/\/github\.com\/nightly-labs\/openbot\/releases/g, label: "upstream releases URL" },
];

const FORBIDDEN_PLUGIN_DIRS = ["coinbase", "robinhood"];

const NEAR_INTENTS_ACTIVE_PATTERN = /owners:\s*\(\)\s*=>\s*OWNERS\.filter/;

const EXCLUDED_PATHS = [
  "scripts/fork-privacy-guard.ts",
  "scripts/fork-privacy-guard.test.ts",
  "docs/faits-durables.md",
  ".github/workflows/fork-privacy-guard.yml",
  "node_modules",
  ".git",
  "dist",
  ".openbot-build",
  "bun.lock",
  "CHANGELOG.md",
  "README.md",
  "PRIVACY.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "docs/",
  ".agents/",
  ".claude/",
  "packages/i18n/",
  "apps/mobile/README.md",
  "apps/mobile/CHANGELOG.md",
  "apps/mobile/CAMERA-PERFORMANCE.md",
  "apps/mobile-updates/",
  "apps/auth-api/",
  "apps/status/",
  "apps/browser-extension/vite.config.ts",
  "scripts/",
  "remote/",
  "docker/",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/",
  ".github/workflows/",
  "package.json",
  "native-runtime.lock.json",
  "packages/contracts/",
  "src/main/content-security-policy.test.ts",
  "src/renderer/stories/",
  "src/backend/agent/tool-guidance.ts",
  "src/backend/agent/openbot-tool-router.ts",
  "src/main/ipc/app-handlers.ts",
  "src/main/newer-database-recovery.ts",
  "src/main/provider-runtime-releases.ts",
];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".json", ".jsonc"]);

interface Violation {
  file: string;
  line: number;
  label: string;
  match: string;
}

function isExcluded(filePath: string, root: string): boolean {
  const rel = normalizePosixPath(relative(root, filePath));
  return EXCLUDED_PATHS.some((excluded) => {
    if (excluded.endsWith("/")) {
      return rel.startsWith(excluded) || rel === excluded.slice(0, -1);
    }
    return rel === excluded || rel.startsWith(`${excluded}/`);
  });
}

export async function scanFile(filePath: string, root: string): Promise<Violation[]> {
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n");
  const violations: Violation[] = [];
  const relPosix = normalizePosixPath(relative(root, filePath));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    for (const { pattern, label, allowIf } of FORBIDDEN_PATTERNS) {
      if (allowIf?.(relPosix, content)) continue;
      pattern.lastIndex = 0;
      for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
        violations.push({ file: filePath, line: i + 1, label, match: match[0] });
      }
    }
  }

  return violations;
}

async function walkDirectory(dir: string, root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (isExcluded(fullPath, root)) continue;

    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath, root)));
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (SCAN_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export async function checkPluginCatalogs(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const catalogPaths = [join(root, "marketplace/plugin-catalog/plugins"), join(root, "resources/plugin-catalog")];

  for (const catalogPath of catalogPaths) {
    try {
      const entries = await readdir(catalogPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && FORBIDDEN_PLUGIN_DIRS.includes(entry.name)) {
          violations.push({
            file: join(catalogPath, entry.name),
            line: 0,
            label: `Forbidden plugin directory: ${entry.name}`,
            match: entry.name,
          });
        }
      }
    } catch {}
  }

  return violations;
}

export async function checkGeneratedCatalogs(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const generatedFiles = [
    join(root, "src/renderer/src/features/settings/marketplace-plugin-catalog.ts"),
    join(root, "apps/mobile/src/features/marketplace/model/plugin-catalog.generated.ts"),
    join(root, "apps/auth-api/src/lib/plugin-catalog.generated.ts"),
    join(root, "marketplace/production-catalog/catalog.json"),
  ];

  for (const filePath of generatedFiles) {
    try {
      const content = await readFile(filePath, "utf8");
      const contentLower = content.toLowerCase();
      for (const forbidden of FORBIDDEN_PLUGIN_DIRS) {
        if (contentLower.includes(forbidden)) {
          violations.push({
            file: filePath,
            line: 0,
            label: `Generated catalog contains forbidden plugin: ${forbidden}`,
            match: forbidden,
          });
        }
      }
    } catch {}
  }

  return violations;
}

export async function checkNearIntentsActive(root: string): Promise<Violation[]> {
  const nearGatewayPath = join(root, "src/main/near-intents-gateway.ts");
  let content: string;
  try {
    content = await readFile(nearGatewayPath, "utf8");
  } catch (error: unknown) {
    return [
      {
        file: nearGatewayPath,
        line: 0,
        label: "NEAR Intents gateway file is missing or unreadable",
        match: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  if (NEAR_INTENTS_ACTIVE_PATTERN.test(content)) {
    return [
      {
        file: nearGatewayPath,
        line: 0,
        label: "NEAR Intents gateway is active (should return empty owners)",
        match: "owners filter active",
      },
    ];
  }
  return [];
}

export async function checkMobileUpdatesDisabled(root: string): Promise<Violation[]> {
  const appJsonPath = join(root, "apps/mobile/app.json");
  let content: string;
  try {
    content = await readFile(appJsonPath, "utf8");
  } catch (error: unknown) {
    return [
      {
        file: appJsonPath,
        line: 0,
        label: "Mobile app.json is missing or unreadable",
        match: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(content);
  } catch (error: unknown) {
    return [
      {
        file: appJsonPath,
        line: 0,
        label: "Mobile app.json contains invalid JSON",
        match: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  if (!isMobileUpdatesDisabledConfig(parsedJson)) {
    return [
      {
        file: appJsonPath,
        line: 0,
        label: "Mobile OTA updates must be disabled (updates.enabled must be false)",
        match: "updates.enabled not false",
      },
    ];
  }
  return [];
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function main(): Promise<void> {
  const root = process.cwd();
  log(`Fork privacy guard: scanning ${root}\n`);

  const files = await walkDirectory(root, root);
  const violations: Violation[] = [];

  for (const file of files) {
    violations.push(...(await scanFile(file, root)));
  }

  violations.push(...(await checkPluginCatalogs(root)));
  violations.push(...(await checkGeneratedCatalogs(root)));
  violations.push(...(await checkNearIntentsActive(root)));
  violations.push(...(await checkMobileUpdatesDisabled(root)));

  if (violations.length === 0) {
    log("No privacy violations found.");
    process.exit(0);
  }

  logError(`Found ${violations.length} privacy violation(s):\n`);
  for (const v of violations) {
    const location = v.line > 0 ? `${relative(root, v.file)}:${v.line}` : relative(root, v.file);
    logError(`  ${location}: ${v.label} (${v.match})`);
  }

  process.exit(1);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    logError(`Fork privacy guard failed: ${error}`);
    process.exit(1);
  });
}
