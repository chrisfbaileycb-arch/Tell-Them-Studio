import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
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
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_EXECUTABLE_PATH ||
        (await chromium.executablePath()),
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
