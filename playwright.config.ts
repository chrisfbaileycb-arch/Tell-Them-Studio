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
  },
});
