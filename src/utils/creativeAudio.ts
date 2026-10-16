// Original procedural compositions, not recordings or artist imitations.
export const GENRES = [
  "Rock Band",
  "Hair Metal Band",
  "Country Band",
  "Pop Band",
  "Disco Band",
  "Rap",
  "Hip-Hop",
  "Indie",
  "Old-School",
  "Jazz",
  "Electronic",
  "Anime-Inspired",
  "Serenity",
  "Singer-Free Instrumental",
  "Custom Genre",
] as const;
export type SampleGenre = (typeof GENRES)[number];
export const SAMPLE_TITLES: Record<SampleGenre, [string, string]> = {
  "Rock Band": ["Open-road sparks", "After the lights"],
  "Hair Metal Band": ["Sunset Strip spotlight", "Velvet amplifier"],
  "Country Band": ["Porchlight promise", "Sunday on the river"],
  "Pop Band": ["A little brighter", "Skyline hearts"],
  "Disco Band": ["Golden-hour groove", "Mirrorball morning"],
  Rap: ["Room for a verse", "New chapter"],
  "Hip-Hop": ["Sidewalk sunrise", "Late-night notebook"],
  Indie: ["Small-town satellites", "Windows open"],
  "Old-School": ["Back-pocket rhythm", "Golden days"],
  Jazz: ["Quiet corner", "Blue-hour conversation"],
  Electronic: ["Neon horizon", "Soft circuit"],
  "Anime-Inspired": ["Beyond the clouds", "First light adventure"],
  Serenity: ["Still waters", "Grace in the morning"],
  "Singer-Free Instrumental": ["Your voice belongs here", "An open stage"],
  "Custom Genre": ["Unexpected company", "Between worlds"],
};
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const frames = channels[0].length,
    count = channels.length;
  const buffer = new ArrayBuffer(44 + frames * count * 2),
    view = new DataView(buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * count * 2, true);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < count; c++)
      view.setInt16(
        44 + (i * count + c) * 2,
        Math.max(-1, Math.min(1, channels[c][i])) * 32767,
        true,
      );
  return new Blob([buffer], { type: "audio/wav" });
}
export function makeGenreSample(genre: SampleGenre, variation: number): Blob {
  const rate = 16000,
    samples = new Float32Array(rate * 60);
  const mellow = ["Serenity", "Jazz", "Indie", "Country Band"].includes(genre);
  const bpm =
    (
      {
        Serenity: 64,
        Jazz: 86,
        Indie: 104,
        "Country Band": 96,
        Rap: 88,
        "Hip-Hop": 92,
        "Old-School": 98,
        "Anime-Inspired": 152,
        Electronic: 126,
        "Rock Band": 128,
        "Hair Metal Band": 136,
        "Disco Band": 118,
      } as Record<string, number>
    )[genre] || 112;
  const beat = 60 / (bpm + variation * 6),
    root = 48 + (GENRES.indexOf(genre) % 7) + variation * 2;
  const progression = variation ? [0, 7, 9, 5] : [0, 5, 9, 7];
  const freq = (note: number) => 440 * 2 ** ((note - 69) / 12);
  let seed = 4281 + GENRES.indexOf(genre) * 173 + variation;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate,
      b = t / beat,
      phase = b % 1,
      bar = Math.floor(b / 4);
    const chord = root + progression[bar % 4];
    const sin = (f: number) => Math.sin(2 * Math.PI * f * t);
    const tri = (f: number) => (2 / Math.PI) * Math.asin(sin(f));
    let harmony = 0;
    for (const step of [0, 4, 7]) {
      const f = freq(chord + step + 12),
        attack = Math.min(1, (b % 4) * 8);
      harmony +=
        (mellow
          ? sin(f) * Math.exp(-(b % 4) * (genre === "Serenity" ? 0.2 : 0.9))
          : tri(f) * (0.5 + 0.5 * Math.exp(-phase * 6))) *
        attack *
        0.065;
    }
    const melodyStep = [12, 16, 19, 16, 14, 12, 19, 21][
      (Math.floor(b * (genre === "Anime-Inspired" ? 2 : 1)) + variation * 3) % 8
    ];
    const melody =
      sin(freq(chord + melodyStep)) *
      Math.exp(-phase * (mellow ? 3 : 7)) *
      0.09;
    const bass =
      sin(freq(chord - 12)) *
      (genre === "Disco Band" ? Math.exp(-phase * 4) : 0.6) *
      0.15;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = seed / 2147483648;
    const kick =
      Math.sin(
        2 * Math.PI * (65 * phase * beat + 1.8 * (1 - Math.exp(-phase * 30))),
      ) *
      Math.exp(-phase * 22) *
      0.22;
    const snare = Math.floor(b) % 2 ? noise * Math.exp(-phase * 28) * 0.11 : 0;
    const hat = noise * Math.exp(-((b * 2) % 1) * 45) * 0.045;
    const drums =
      genre === "Serenity" ? 0 : (kick + snare + hat) * (mellow ? 0.35 : 1);
    const fade = Math.min(1, t / 0.6, (60 - t) / 2);
    samples[i] =
      Math.tanh((harmony + bass + melody + drums) * 1.3) * fade * 0.7;
  }
  return encodeWav([samples], rate);
}

// Mix only creator-authorized sources. This overlays audio; it does not separate stems or beat-match.
export async function mixAudio(
  first: Blob,
  second: Blob,
  balance: number,
): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const [a, b] = await Promise.all([
      first.arrayBuffer().then((x) => ctx.decodeAudioData(x)),
      second.arrayBuffer().then((x) => ctx.decodeAudioData(x)),
    ]);
    const seconds = Math.min(168, Math.max(a.duration, b.duration));
    const offline = new OfflineAudioContext(
      2,
      Math.ceil(seconds * 44100),
      44100,
    );
    for (const [buffer, volume] of [
      [a, 1 - balance],
      [b, balance],
    ] as const) {
      const source = offline.createBufferSource(),
        gain = offline.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain).connect(offline.destination);
      source.start();
    }
    const rendered = await offline.startRendering();
    return encodeWav(
      [rendered.getChannelData(0), rendered.getChannelData(1)],
      rendered.sampleRate,
    );
  } finally {
    await ctx.close();
  }
}
