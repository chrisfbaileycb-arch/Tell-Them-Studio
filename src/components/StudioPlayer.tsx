import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

const clock = (seconds: number) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` : '0:00';
export function StudioPlayer({ src, title }: { src: string; title: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [wave, setWave] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    let disposed = false;
    let context: AudioContext | undefined;
    setWave([]); setPlaying(false); setPosition(0); setDuration(0); setError('');
    (async () => {
      try {
        const res = await fetch(src, { signal: abort.signal });
        if (!res.ok) throw new Error('Audio unavailable');
        context = new AudioContext();
        const decoded = await context.decodeAudioData(await res.arrayBuffer());
        const data = decoded.getChannelData(0);
        const peaks = Array.from({ length: 72 }, (_, i) => {
          const start = Math.floor(i * data.length / 72), end = Math.floor((i + 1) * data.length / 72);
          let peak = 0;
          for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 100))) peak = Math.max(peak, Math.abs(data[j]));
          return peak;
        });
        const max = Math.max(...peaks, 0.001);
        if (!disposed) setWave(peaks.map(p => p / max));
      } catch { /* Native controls remain available when waveform decoding is unsupported. */ }
      finally { if (context && context.state !== 'closed') await context.close(); }
    })();
    return () => { disposed = true; abort.abort(); };
  }, [src]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !wave.length) return;
    const paint = () => {
      const width = el.clientWidth, height = 54, ratio = devicePixelRatio || 1;
      el.width = width * ratio; el.height = height * ratio;
      const ctx = el.getContext('2d'); if (!ctx) return;
      ctx.scale(ratio, ratio);
      const step = width / wave.length;
      wave.forEach((peak, i) => {
        ctx.fillStyle = i / wave.length <= position / Math.max(duration, 1) ? '#ba7aff' : '#45506b';
        const bar = Math.max(3, peak * 48);
        ctx.fillRect(i * step, (height - bar) / 2, Math.max(1.5, step * .55), bar);
      });
    };
    paint();
    const observer = new ResizeObserver(paint); observer.observe(el);
    return () => observer.disconnect();
  }, [wave, position, duration]);
  return <div className="studio-player">
    <audio ref={audio} src={src} controls={!wave.length} aria-label={`Play ${title}`} preload="metadata"
      onLoadedMetadata={e => setDuration(e.currentTarget.duration)} onDurationChange={e => setDuration(e.currentTarget.duration)}
      onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onPlay={e => { setPlaying(true); document.querySelectorAll('audio').forEach(a => { if (a !== e.currentTarget) a.pause(); }); }}
      onError={() => setError('This audio could not be loaded. Try another studio track.')} />
    {wave.length > 0 && <div className="studio-wave-player"><button className="studio-play" aria-label={`${playing ? 'Pause' : 'Play'} ${title}`} onClick={async () => { const el = audio.current; if (!el) return; try { if (el.paused) await el.play(); else el.pause(); setError(''); } catch { setError('Playback could not start. Try again.'); } }}>{playing ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}</button>
      <div className="studio-waveform"><canvas ref={canvas} aria-hidden="true" /><input aria-label={`Seek ${title}`} type="range" min="0" max={Number.isFinite(duration) ? duration : 0} step="0.1" value={position} disabled={!duration} onChange={e => { if (audio.current) audio.current.currentTime = Number(e.target.value); setPosition(Number(e.target.value)); }} /></div>
      <span className="studio-time">{clock(position)} / {clock(duration)}</span></div>}
    {error && <p role="status" className="studio-help">{error}</p>}
  </div>;
}
