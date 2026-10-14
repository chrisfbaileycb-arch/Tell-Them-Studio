import { SongResult } from "../../types";
import { parseTimedLyrics } from "./lyricsUtils";

/** Real-time cover-art/spectrum WebM export. Not a generative animation service. */
export async function handleDownloadVideo(
  result: SongResult,
  withLyrics: boolean,
  onProgress: (progress: number) => void,
  onComplete: () => void,
  disclosure = result.originType || "Studio audio",
): Promise<void> {
  let audio: HTMLAudioElement | undefined, context: AudioContext | undefined;
  let stream: MediaStream | undefined, recorder: MediaRecorder | undefined;
  let frame = 0,
    timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!result.audioUrl || !result.coverImageUrl)
      throw new Error("Audio and cover art are required.");
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)
      throw new Error("Video recording is not supported by this browser.");
    const mimeType = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType)
      throw new Error("WebM export is not supported by this browser.");
    audio = new Audio();
    audio.crossOrigin = "anonymous";
    const loaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Audio loading timed out.")),
        15000,
      );
      audio!.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      audio!.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Could not decode this audio."));
      };
    });
    audio.src = result.audioUrl;
    await loaded;
    if (
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0 ||
      audio.duration > 600
    )
      throw new Error("Use finite audio up to ten minutes.");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Cover loading timed out.")),
        15000,
      );
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Could not load cover art."));
      };
      img.src = result.coverImageUrl!;
    });
    const canvas = document.createElement("canvas");
    canvas.width = withLyrics ? 1280 : 720;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is unavailable.");
    context = new AudioContext();
    await context.resume();
    const source = context.createMediaElementSource(audio),
      analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const destination = context.createMediaStreamDestination();
    source.connect(analyser);
    analyser.connect(destination);
    const visual = canvas.captureStream(30);
    stream = new MediaStream([
      ...visual.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    let timed = withLyrics ? parseTimedLyrics(result.lyrics || "") : [];
    // Plain lyrics are distributed approximately, rather than falsely claiming word alignment.
    if (withLyrics && !timed.length) {
      const lines = (result.lyrics || "")
        .split("\n")
        .filter((l) => l.trim() && !/^\[.*\]$/.test(l.trim()));
      timed = lines.map((text, i) => ({
        text,
        time: (i * audio!.duration) / lines.length,
      }));
    }
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const wrap = (text: string, width: number) => {
      const lines: string[] = [];
      let line = "";
      for (const word of text.split(/\s+/)) {
        if (line && ctx.measureText(`${line} ${word}`).width > width) {
          lines.push(line);
          line = word;
        } else line += `${line ? " " : ""}${word}`;
      }
      if (line) lines.push(line);
      return lines.slice(0, 6);
    };
    const draw = () => {
      ctx.fillStyle = "#172923";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, 720, 720);
      ctx.fillStyle = "#0004";
      ctx.fillRect(0, 0, 720, 720);
      analyser.getByteFrequencyData(bins);
      ctx.fillStyle = "#ecbfb3";
      for (let i = 0; i < 64; i++) {
        const height = (bins[i] / 255) * 160;
        ctx.fillRect(i * 11.25, 720 - height, 8, height);
      }
      ctx.fillStyle = "#000a";
      ctx.fillRect(18, 18, 684, 48);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(
        `${disclosure} · ${result.creatorHandle || "@studio_creator"}`,
        32,
        48,
        652,
      );
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(result.title || "Studio creation", 32, 640, 650);
      if (withLyrics) {
        const current = [...timed]
          .reverse()
          .find((l) => audio!.currentTime >= l.time);
        ctx.font = "bold 30px sans-serif";
        ctx.textAlign = "center";
        const lines = wrap(current?.text || "", 490);
        lines.forEach((line, i) =>
          ctx.fillText(line, 1000, 340 + (i - lines.length / 2) * 45),
        );
      }
      onProgress(Math.min(100, (audio!.currentTime / audio!.duration) * 100));
      frame = requestAnimationFrame(draw);
    };
    draw();
    await new Promise<void>((resolve, reject) => {
      recorder!.onerror = () => reject(new Error("Video encoder failed."));
      recorder!.onstop = () => resolve();
      audio!.onended = () => {
        if (recorder!.state !== "inactive") recorder!.stop();
      };
      audio!.onerror = () => reject(new Error("Audio playback failed."));
      timeout = setTimeout(
        () =>
          reject(
            new Error("Export timed out. Keep this page open and try again."),
          ),
        (audio!.duration + 30) * 1000,
      );
      recorder!.start(1000);
      audio!.play().catch(reject);
    });
    if (!chunks.length) throw new Error("The encoder returned no video.");
    const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.title || "Studio"}_${withLyrics ? "Lyrics" : "Spectrum"}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onProgress(100);
  } finally {
    if (timeout) clearTimeout(timeout);
    cancelAnimationFrame(frame);
    audio?.pause();
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    if (context && context.state !== "closed") await context.close();
    onComplete();
  }
}
