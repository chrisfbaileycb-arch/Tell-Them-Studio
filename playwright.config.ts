import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import { readFileSync, writeFileSync, chmodSync, mkdirSync, existsSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

// The npm-distributed test browser includes its own Linux libraries. No browser
// download or operating-system package installation is needed in the sandbox.
const libRoot = path.join(tmpdir(), "tell-them-chromium-libs");
if (
  process.platform === "linux" &&
  !existsSync(path.join(libRoot, "lib/libnspr4.so"))
) {
  mkdirSync(libRoot, { recursive: true });
  const archive = path.resolve(
    "node_modules/@sparticuz/chromium/bin/al2023.tar.br",
  );
  execFileSync("tar", ["xf", "-", "-C", libRoot], {
    input: brotliDecompressSync(readFileSync(archive)),
  });
}
// Extract without archive ownership changes: container filesystems may reject chown.
const browserRoot = path.join(tmpdir(), "tell-them-test-browser");
const browserExecutable = process.env.CHROMIUM_EXECUTABLE_PATH || path.join(browserRoot, "chromium");
if (!process.env.CHROMIUM_EXECUTABLE_PATH) {
  mkdirSync(browserRoot, { recursive: true });
  if (!existsSync(browserExecutable)) {
    writeFileSync(browserExecutable, brotliDecompressSync(readFileSync(path.resolve("node_modules/@sparticuz/chromium/bin/chromium.br"))));
    chmodSync(browserExecutable, 0o700);
  }
  for (const name of ["fonts", "swiftshader"]) {
    execFileSync("tar", ["xf", "-", "--no-same-owner", "-C", browserRoot], {
      input: brotliDecompressSync(readFileSync(path.resolve(`node_modules/@sparticuz/chromium/bin/${name}.tar.br`))),
    });
  }
}
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath:
        browserExecutable,
      args: chromium.args.filter((a) => a !== "--single-process"),
      env: {
        ...process.env,
        LD_LIBRARY_PATH: `${path.join(libRoot, "lib")}:${process.env.LD_LIBRARY_PATH || ""}`,
      },
    },
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    env: {
      // Volatile, isolated catalog: test runs never read or write real creator data.
      CATALOG_DATA_DIR: ":memory:",
      // Many API-level tests share one IP; keep the production defaults for the publish limiter.
      API_RATE_LIMIT: "5000",
      SESSION_CREATE_LIMIT: "500",
      PUBLISH_RATE_LIMIT: "10",
      // Governance (Phase 4): moderator API on, fast worker, ~5s soft-revoke window.
      ADMIN_API_TOKEN: "test-admin-token-0123456789",
      REPORT_RATE_LIMIT: "500",
      JOB_POLL_MS: "200",
      PURGE_GRACE_DAYS: "0.00006",
      PURGE_SWEEP_MS: "1000",
      // Distribution (Phase 4): local webhook receivers and short retry/backoff for tests.
      // WEBHOOK_ALLOW_PRIVATE is ignored when NODE_ENV=production.
      WEBHOOK_ALLOW_PRIVATE: "true",
      JOB_BACKOFF_BASE_MS: "100",
      WEBHOOK_MAX_ATTEMPTS: "3",
      PUBLIC_BASE_URL: "http://localhost:3000",
    },
  },
});
