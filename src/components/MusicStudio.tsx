import { StudioPlayer } from './StudioPlayer';
import React, { useRef, useState } from 'react';
import { ArrowRight, AudioLines, ChevronDown, Download, Guitar, Headphones, Mic, Music2, Plus, Radio, Share2, Sparkles, Users, X } from 'lucide-react';
import type { BandArchetype, Duration, LyricsOption, SongResult, VocalArrangement } from '../../types';
import { BAND_ARCHETYPES, VOCAL_ARRANGEMENTS, createUniqueSongArtworkSvg, describeSongPictureTheme } from '../../constants';

type ImageReference = { data: string; mimeType: string; previewUrl: string };
type Props = {
  genre: BandArchetype; onGenre: (genre: BandArchetype) => void;
  vocals: VocalArrangement; onVocals: (value: VocalArrangement) => void;
  brief: string; onBrief: (value: string) => void;
  duration: Duration; onDuration: (value: Duration) => void;
  lyricsMode: LyricsOption; onLyricsMode: (value: LyricsOption) => void;
  lyrics: string; onLyrics: (value: string) => void;
  customGenre: string; onCustomGenre: (value: string) => void;
  images: ImageReference[]; onImages: (event: React.ChangeEvent<HTMLInputElement>) => void; onRemoveImage: (index: number) => void;
  generate: () => void; disabled: boolean; generating: boolean;
  confirmed: boolean; onConfirmed: (value: boolean) => void;
  featured?: SongResult; helper: React.ReactNode;
  helperOpen: boolean; onHelperOpen: (value: boolean) => void;
  onDownloadFeatured?: (result: SongResult) => void;
  onPublishFeatured?: (result: SongResult) => void;
  isFeaturedPublished?: boolean;
};
const genres: { value: BandArchetype; label: string; icon: typeof Guitar }[] = [
  { value: 'Rock Band', label: 'Rock', icon: Guitar },
  { value: 'Pop Band', label: 'Pop', icon: Music2 },
  { value: 'Country Band', label: 'Country', icon: Guitar },
  { value: 'Hip-Hop', label: 'Hip-Hop', icon: AudioLines },
  { value: 'Electronic', label: 'Electronic', icon: Radio },
  { value: 'Jazz', label: 'Jazz', icon: Music2 },
];
const rockChoices: { value: BandArchetype; label: string }[] = [
  { value: 'Rock Band', label: 'Classic / Stadium Rock' },
  { value: 'Hair Metal Band', label: 'Hair Metal Band' },
];
const vocalStyles: { label: string; value: VocalArrangement; icon: typeof Guitar }[] = [
  { label: 'Solo', value: 'Lead Female + Band Backing', icon: Mic },
  { label: 'Duet', value: 'Multi-Singer Trade-Off (Male & Female)', icon: Users },
  { label: 'Harmonies', value: '3-Part Band Harmonies', icon: Users },
  { label: 'Instrumental', value: 'Singer-Free (Record Your Own Voice)', icon: Guitar },
];
const lengths: { value: Duration; time: string; label: string }[] = [
  { value: '2:15 Tight Single', time: '2:15', label: 'Short song' },
  { value: '2:48 Radio Single', time: '2:48', label: 'Standard' },
  { value: '3:50 Radio Master (Max)', time: '3:50', label: 'Extended' },
  { value: '0:30 Hook / Jingle', time: '0:30', label: 'Short clip' },
];
export function MusicStudio(p: Props) {
  const [more, setMore] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const instrumental = p.vocals === 'Singer-Free (Record Your Own Voice)' || p.lyricsMode === 'Instrumental';
  const selectedVocal = instrumental ? 'Instrumental' : p.vocals.includes('3-Part') || p.vocals.includes('Harmony') || p.vocals.includes('Dual') ? 'Harmonies' : p.vocals.includes('Trade-Off') ? 'Duet' : 'Solo';
  const isRock = p.genre === 'Rock Band' || p.genre === 'Hair Metal Band';
  const isDemo = p.featured?.id.startsWith('seed-');
  const featuredGenre = p.featured ? (p.featured.bandType === 'Custom Genre' && p.featured.customGenreName ? p.featured.customGenreName : p.featured.bandType) : '';
  const featuredPictureUrl = p.featured && !isDemo
    ? (p.featured.coverImageUrl || createUniqueSongArtworkSvg({
        title: p.featured.title,
        genre: featuredGenre,
        prompt: p.featured.originalPrompt || p.featured.fullPrompt || '',
        lyrics: p.featured.lyrics,
        creatorHandle: p.featured.creatorHandle,
        seed: p.featured.id,
        motif: 'band',
      }))
    : '/images/electric-afterglow.webp';
  const featuredPictureTheme = p.featured && !isDemo
    ? describeSongPictureTheme({
        title: p.featured.title,
        genre: featuredGenre,
        prompt: p.featured.originalPrompt || p.featured.fullPrompt || '',
        lyrics: p.featured.lyrics,
        creatorHandle: p.featured.creatorHandle,
        seed: p.featured.id,
        motif: 'band',
      }).trim()
    : '';
  return <div className="music-workbench">
    <section className="music-compose" aria-labelledby="music-title">
      <div className="studio-eyebrow">CREATE</div>
      <h1 id="music-title">Music Studio</h1>
      <p className="studio-intro">Find your sound. Build something original.</p>
      <div className="music-section music-brief">
        <div className="studio-label-row"><label htmlFor="creative-brief">1. Describe your sound</label>
          <button className="studio-text-button" onClick={() => p.onHelperOpen(!p.helperOpen)}><Sparkles size={14} />{p.helperOpen ? 'Free text' : 'Guided builder'}</button>
        </div>
        {p.helperOpen ? <div className="studio-guided">{p.helper}</div> : <textarea id="creative-brief" aria-label="Creative brief" value={p.brief} onChange={e => p.onBrief(e.target.value)} placeholder="A sound, a feeling, a story—what do you want to create?" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !p.disabled) p.generate(); }} />}
      </div>
      <fieldset className="music-section"><legend>2. Choose a genre</legend><div className="studio-chips genre-chips">
        {genres.map(({ value, label, icon: Icon }) => <button type="button" key={value} aria-pressed={value === 'Rock Band' ? isRock : p.genre === value} onClick={() => p.onGenre(value)}><Icon size={21} />{label}</button>)}
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)}><Plus size={18} />More</button>
      </div>
      {isRock && <div className="studio-rock-choices" role="group" aria-label="Rock band choices">
        <span className="studio-rock-label">Rock band choices:</span>
        {rockChoices.map(({ value, label }) => <button type="button" key={value} aria-pressed={p.genre === value} onClick={() => p.onGenre(value)}><Guitar size={16} />{label}</button>)}
      </div>}
      {(more || (!isRock && !genres.some(g => g.value === p.genre))) && <div className="studio-more-genres"><label htmlFor="all-genres">All genres & blends</label><select id="all-genres" value={p.genre} onChange={e => p.onGenre(e.target.value as BandArchetype)}>{BAND_ARCHETYPES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></div>}
      {p.genre === 'Custom Genre' && <label className="studio-custom">Describe your genre blend<input value={p.customGenre} onChange={e => p.onCustomGenre(e.target.value)} placeholder="Surf-rock guitars, jazz brass, and a disco groove" /></label>}
      </fieldset>
      <div className="studio-vocal-lyrics-row">
        <fieldset className="music-section"><legend>3. Choose a vocal style</legend><div className="studio-chips vocal-chips">
          {vocalStyles.map(({ label, value, icon: Icon }) => <button key={label} type="button" aria-pressed={selectedVocal === label} onClick={() => { p.onVocals(value); p.onLyricsMode(label === 'Instrumental' ? 'Instrumental' : p.lyricsMode === 'Instrumental' ? 'Auto' : p.lyricsMode); }}><Icon size={21} />{label}</button>)}
        </div></fieldset>
        <fieldset className="music-section lyrics-section"><legend>4. Lyrics</legend><div className="studio-chips lyrics-chips">
          <button type="button" aria-pressed={p.lyricsMode === 'Auto'} onClick={() => { p.onLyricsMode('Auto'); if (instrumental) p.onVocals('Lead Female + Band Backing'); }}><Sparkles size={18} />AI creates lyrics</button>
          <button type="button" aria-pressed={p.lyricsMode === 'Custom'} onClick={() => { p.onLyricsMode('Custom'); if (instrumental) p.onVocals('Lead Female + Band Backing'); }}><Mic size={18} />Enter your own lyrics</button>
        </div></fieldset>
      </div>
      {p.lyricsMode === 'Custom' && <div className="music-section studio-lyrics-editor">
        <label htmlFor="custom-lyrics-box">Your lyrics</label>
        <textarea id="custom-lyrics-box" aria-label="Custom lyrics" value={p.lyrics} onChange={e => p.onLyrics(e.target.value)} placeholder="[Verse]\nWrite or paste your own lyrics for the music you want to create…" />
      </div>}
      <fieldset className="music-section length-section"><legend>5. Target length</legend><div className="studio-lengths">
        {lengths.map(({ value, time, label }) => <button key={value} type="button" aria-label={`${time} ${label}`} aria-pressed={p.duration === value} onClick={() => p.onDuration(value)}><span>{time}</span><small>{label}</small></button>)}
      </div></fieldset>
      <details className="studio-fine-tune" ref={details} open={p.lyricsMode === 'Custom' || undefined}>
        <summary>Fine-tune your sound <span>(optional)</span><ChevronDown size={18} /></summary>
        <div className="studio-advanced">
          <label>Vocal arrangement<select value={p.vocals} onChange={e => { const value = e.target.value as VocalArrangement; p.onVocals(value); if (value === 'Singer-Free (Record Your Own Voice)') p.onLyricsMode('Instrumental'); else if (p.lyricsMode === 'Instrumental') p.onLyricsMode('Auto'); }}>{VOCAL_ARRANGEMENTS.map(v => <option key={v}>{v}</option>)}</select></label>
          <label>Lyrics mode<select value={p.lyricsMode} onChange={e => { const mode = e.target.value as LyricsOption; p.onLyricsMode(mode); if (mode !== 'Instrumental' && instrumental) p.onVocals('Lead Female + Band Backing'); }}>{['Auto', 'Custom', 'Instrumental'].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          <input ref={upload} type="file" accept="image/*" multiple aria-label="Attach visual references" onChange={p.onImages} />
          <p>Optional images can guide the mood. They are sent to the AI provider during generation and are not restored after refresh.</p>
          <div className="studio-image-refs">{p.images.map((img, i) => <div key={i}><img src={img.previewUrl} alt={`Visual reference ${i + 1}`} /><button aria-label={`Remove visual reference ${i + 1}`} onClick={() => p.onRemoveImage(i)}><X size={16} /></button></div>)}</div>
          <label className="studio-check"><input type="checkbox" checked={p.confirmed} onChange={e => p.onConfirmed(e.target.checked)} />I’m creating original work and have permission to use my references.</label>
          <p>Lengths are generation targets. Review the audio before saving or exporting.</p>
        </div>
      </details>
      <button className="studio-generate" disabled={p.disabled || p.generating} onClick={p.generate}><Sparkles size={24} /><span>{p.generating ? 'Creating your music…' : 'Create music'}</span><ArrowRight size={24} /></button>
      {!p.confirmed && <p role="status" className="studio-help">Confirm your reference permissions in Fine-tune your sound to continue.</p>}
    </section>
    <aside className="studio-featured" aria-label="Featured studio track">
      <div className="studio-eyebrow">{p.featured && !isDemo ? 'YOUR LATEST SONG POST' : 'STUDIO INSPIRATION'}</div>
      <img className="studio-cover" data-testid="featured-song-picture" src={featuredPictureUrl} alt={isDemo || !p.featured ? 'Electric guitar under violet and magenta stage lights' : `Cover art coinciding with ${p.featured.title || 'your creation'}: ${featuredPictureTheme}`} />
      <h2>{p.featured?.title || 'Your next sound starts here.'}</h2>
      <p className="studio-track-meta">
        {p.featured
          ? `${featuredGenre}${isDemo ? ' · Synthesized instrumental preview' : featuredPictureTheme ? ` · Picture: ${featuredPictureTheme}` : ''}`
          : 'Rock, soul, electronic, or something entirely yours.'}
      </p>
      {p.featured?.audioUrl && <StudioPlayer src={p.featured.audioUrl} title={p.featured.title || 'Studio track'} />}
      {p.featured && !isDemo && p.featured.audioUrl && (
        <div className="studio-featured-actions">
          {p.onDownloadFeatured && (
            <button type="button" onClick={() => p.onDownloadFeatured!(p.featured!)} className="studio-btn-secondary">
              <Download size={15} />
              <span>Download WAV</span>
            </button>
          )}
          {p.onPublishFeatured && (
            <button
              type="button"
              onClick={() => p.onPublishFeatured!(p.featured!)}
              disabled={p.isFeaturedPublished}
              className="studio-btn-publish"
            >
              <Share2 size={15} />
              <span>{p.isFeaturedPublished ? 'Published to Community ✓' : 'Publish to Community'}</span>
            </button>
          )}
        </div>
      )}
      <div className="studio-featured-note"><Headphones size={17} /><span>{isDemo ? 'An original studio sketch. Explore the sound, then make it yours.' : 'Listen closely. Refine your direction. Keep creating.'}</span></div>
    </aside>
  </div>;
}

