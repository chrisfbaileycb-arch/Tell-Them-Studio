import { test, expect } from "@playwright/test";
import { GENRES, makeGenreSample } from "../src/utils/creativeAudio";
import { validateCreativeRequest } from "../src/services/creativePolicy";

test("all genre sketches have valid 60-second WAVs with different variations", async () => {
  for (const genre of GENRES) {
    const a = Buffer.from(await makeGenreSample(genre, 0).arrayBuffer());
    const b = Buffer.from(await makeGenreSample(genre, 1).arrayBuffer());
    expect(a.toString("ascii", 0, 4)).toBe("RIFF");
    expect(a.readUInt32LE(40) / a.readUInt32LE(28)).toBe(60);
    expect(a.equals(b)).toBe(false);
  }
});

test("reference audio requires explicit authorization on the server", async ({
  request,
}) => {
  expect(
    validateCreativeRequest({
      task: "identify",
      message: "Analyze",
      audio: { data: "AAAA", mimeType: "audio/wav" },
    }),
  ).toContain("permission");
  expect(
    validateCreativeRequest({ task: "lyrics", message: "Write a new chorus" }),
  ).toBeNull();
  const denied = await request.post("/api/creative-assistant", {
    data: {
      task: "identify",
      message: "Analyze",
      audio: { data: "AAAA", mimeType: "audio/wav" },
    },
  });
  expect(denied.status()).toBe(400);
  const malformed = await request.post("/api/creative-assistant", {
    data: { task: "unsupported", message: "Hello" },
  });
  expect(malformed.status()).toBe(400);
});

test("samples play, library persists, and public permission is independent of remix", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#listen");
  await expect(
    page.getByRole("heading", {
      name: "A little curiosity. A lot of possibility.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Serenity", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Still waters", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load one-minute sketch" })
    .first()
    .click();
  await expect
    .poll(() =>
      page
        .locator(".cw-sample audio")
        .first()
        .evaluate((a: HTMLAudioElement) => a.duration),
    )
    .toBe(60);
  await page
    .locator(".cw-sample audio")
    .first()
    .evaluate((a: HTMLAudioElement) => a.play());
  await expect
    .poll(() =>
      page
        .locator(".cw-sample audio")
        .first()
        .evaluate((a: HTMLAudioElement) => a.paused),
    )
    .toBe(false);
  await page
    .getByRole("button", { name: "Save sketch", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Saved privately.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My Library", exact: true }).click();
  await expect(page.locator(".cw-track")).toHaveCount(1);
  await expect(
    page.getByLabel("Public listening (local preview)"),
  ).not.toBeChecked();
  await expect(page.getByLabel("Separately allow remixes")).toBeDisabled();
  await page.reload();
  await expect(page.locator(".cw-track")).toHaveCount(1);
  await page.getByLabel("Public listening (local preview)").check();
  await expect(page.getByLabel("Separately allow remixes")).not.toBeChecked();
  await page.getByLabel("Separately allow remixes").check();
  await page.getByLabel("Public listening (local preview)").uncheck();
  await expect(page.getByLabel("Separately allow remixes")).not.toBeChecked();
  await page.getByLabel("Public listening (local preview)").check();
  await page.getByRole("button", { name: "Told Them · Listen" }).click();
  await expect(page.locator(".cw-track")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("audio import, mix, lyrics handoff, and mobile layout", async ({
  page,
}) => {
  await page.goto("/#library");
  await expect(page.getByLabel("Import audio")).toBeDisabled();
  await page.getByLabel("I own this audio or have permission").check();
  const wav = Buffer.from(await makeGenreSample("Indie", 0).arrayBuffer());
  for (const name of ["My backing.wav", "My vocal.wav"])
    await page
      .getByLabel("Import audio")
      .setInputFiles({ name, mimeType: "audio/wav", buffer: wav });
  await expect(page.locator(".cw-track")).toHaveCount(2);
  await page
    .getByRole("button", { name: "AI · Lyrics, Video & Mix", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mashup & vocals", exact: true })
    .click();
  await page
    .getByLabel("First track / backing")
    .selectOption({ label: "My backing · @studio_voyager" });
  await page
    .getByLabel("Second track / vocal")
    .selectOption({ label: "My vocal · @studio_voyager" });
  await page.getByLabel("I have rights to remix both sources.").check();
  await page.getByRole("button", { name: "Render & save private mix" }).click();
  await expect(
    page.getByText("Mix saved privately in My Library.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My Library", exact: true }).click();
  await expect(page.locator(".cw-track")).toHaveCount(3);
  await page
    .getByRole("button", { name: "AI · Lyrics, Video & Mix", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lyrics designer", exact: true })
    .click();
  await page.route("**/api/creative-assistant", (r) =>
    r.fulfill({ json: { text: "[Chorus]\nA little light is all we need" } }),
  );
  await page
    .getByLabel("Your idea", { exact: true })
    .fill("Write an original chorus");
  await page.getByRole("button", { name: "Ask the assistant" }).click();
  await page.getByRole("button", { name: "Edit in lyrics studio" }).click();
  await expect(
    page
      .locator("textarea")
      .filter({ hasText: "A little light is all we need" }),
  ).toBeVisible();
  await page.goto("/#listen");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", {
      name: "A little curiosity. A lot of possibility.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("unconnected assistant is honest; visualizer exports real WebM", async ({
  page,
  request,
}) => {
  if (!process.env.GEMINI_API_KEY) {
    const response = await request.post("/api/creative-assistant", {
      data: { task: "lyrics", message: "Write a chorus" },
    });
    expect(response.status()).toBe(503);
    expect((await response.json()).error).toContain("not connected");
  }
  const { encodeWav } = await import("../src/utils/creativeAudio");
  const samples = Float32Array.from(
    { length: 48000 },
    (_, i) => Math.sin((i / 16000) * 440 * Math.PI * 2) * 0.1,
  );
  const buffer = Buffer.from(await encodeWav([samples], 16000).arrayBuffer());
  await page.goto("/#library");
  await page.getByLabel("I own this audio or have permission").check();
  await page
    .getByLabel("Import audio")
    .setInputFiles({
      name: "Video preview.wav",
      mimeType: "audio/wav",
      buffer,
    });
  await expect(page.locator(".cw-track")).toHaveCount(1);
  await page
    .getByRole("button", { name: "AI · Lyrics, Video & Mix", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Music video & anime", exact: true })
    .click();
  await page.getByLabel("Saved audio").selectOption({ label: "Video preview" });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export visualizer video", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Video preview_Spectrum.webm");
  expect(await file.failure()).toBeNull();
  await expect(
    page.getByText("Visualizer downloaded as WebM.", { exact: false }),
  ).toBeVisible();
  await page.goto("/#listen");
  await page.screenshot({ path: "test-results/listening-room.png" });
});
