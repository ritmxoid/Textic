// Web Audio procedural music and soundtrack generator
// Generates high-quality ambient, synthwave, lofi, phonk, and acoustic musical tracks without external network requests
// Supports procedural re-generation with unique harmonic progressions, melodic motifs, and rhythms per seed

import { MusicPresetId } from '../types';

export interface MusicPresetInfo {
  id: MusicPresetId;
  name: string;
  genre: string;
  bpm: number;
  description: string;
  emoji: string;
  key: string;
}

export const MUSIC_PRESETS: MusicPresetInfo[] = [
  {
    id: 'lofi-chill',
    name: 'Lo-Fi Chill Hop',
    genre: 'Lo-Fi & Study',
    bpm: 78,
    description: 'Мягкий бит, тёплый родес-пианино и уютный виниловый шум для атмосферных видео.',
    emoji: '☕',
    key: 'Cmaj7 / Am9 / Fmaj9',
  },
  {
    id: 'synthwave-retro',
    name: 'Cyber Synthwave',
    genre: 'Electronic & Retro',
    bpm: 115,
    description: 'Пульсирующий 80s бас, арпеджио и космические пэды в стиле ретрофутуризма.',
    emoji: '🌌',
    key: 'Fm / D# / C# / Am',
  },
  {
    id: 'deep-ambient',
    name: 'Deep Ambient Calm',
    genre: 'Atmospheric & Zen',
    bpm: 60,
    description: 'Глубокий медитативный фон, мягкие переливы и кинематографичный простор.',
    emoji: '🕊️',
    key: 'Dmin9 / Fmaj7 / Gsus',
  },
  {
    id: 'epic-drive',
    name: 'Motivational Drive',
    genre: 'Cinema & Energy',
    bpm: 125,
    description: 'Нарастающий драйв с динамичными аккордами для экспертных рилсов и мотивации.',
    emoji: '🔥',
    key: 'A Minor / D Minor',
  },
  {
    id: 'phonk-energy',
    name: 'Drift Phonk Beat',
    genre: 'Phonk & Bass',
    bpm: 136,
    description: 'Плотный 808 бас, каубелл и агрессивный ритм для трендовых Reels и Shorts.',
    emoji: '⚡',
    key: 'C# Minor / D# Minor',
  },
  {
    id: 'acoustic-warmth',
    name: 'Acoustic Warmth',
    genre: 'Indie & Warm',
    bpm: 85,
    description: 'Тёплая акустическая гармония, звонкие ноты и вдохновляющее настроение.',
    emoji: '🌿',
    key: 'G Major / C Major',
  },
  {
    id: 'funny',
    name: 'Смешной',
    genre: 'Comedy & Cartoon',
    bpm: 124,
    description: 'Комичный мультяшный стиль: озорной стаккато бас, забавные глиссандо и прыгающая мелодия.',
    emoji: '🤡',
    key: 'C Major / F Major',
  },
  {
    id: 'heroic',
    name: 'Героический',
    genre: 'Epic & Fanfare',
    bpm: 130,
    description: 'Эпический кинематографичный саундтрек: победные медные духовые, маршевый пульс и триумфальные аккорды.',
    emoji: '⚔️',
    key: 'D Minor / F Major',
  },
  {
    id: 'notes',
    name: 'Ноты',
    genre: 'Minimal & Tones',
    bpm: 60,
    description: 'Отдельные звуки разной тональности с интервалом тишины ровно 1 секунда между ними.',
    emoji: '🎹',
    key: 'Chromatic Tones',
  },
  {
    id: 'lightning',
    name: 'Молния',
    genre: 'Hi-Speed Synth',
    bpm: 165,
    description: 'Сверхбыстрые стремительные арпеджио, электрическая энергия и высокая скорость.',
    emoji: '⚡',
    key: 'E Minor / A Minor',
  },
];

// Complete 12-TET Note Frequency Map (C1 to B7)
const NOTE_BASE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11,
};

/**
 * Returns exact finite frequency in Hz for standard note notation (e.g., 'C4', 'F#5', 'Ab3')
 */
export function getNoteFreq(note: string, fallback = 440): number {
  if (!note || typeof note !== 'string') return fallback;
  const match = note.trim().match(/^([A-Ga-g][#b]?)([0-8])$/);
  if (!match) return fallback;

  const noteName = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const semitoneOffset = NOTE_BASE_INDEX[noteName];

  if (semitoneOffset === undefined) return fallback;

  // MIDI Note Number: C4 is 60, A4 is 69 (440Hz)
  const midi = (octave + 1) * 12 + semitoneOffset;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  return Number.isFinite(freq) && freq > 0 ? Number(freq.toFixed(2)) : fallback;
}

/**
 * Deterministic pseudo-random number generator class
 */
export class RandomGenerator {
  private s: number;

  constructor(seed = 1337) {
    this.s = Math.abs(Math.floor(seed)) % 2147483647;
    if (this.s <= 0) this.s = 123456789;
  }

  // Returns float in [0, 1)
  next(): number {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }

  // Returns float between min and max
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Returns integer in [min, max]
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  // Pick random element from array
  choice<T>(arr: T[]): T {
    if (!arr.length) throw new Error('Cannot pick from empty array');
    const idx = Math.floor(this.next() * arr.length);
    return arr[Math.min(arr.length - 1, Math.max(0, idx))];
  }
}

/**
 * Procedurally generates an AudioBuffer of specified duration for a given preset and random seed
 */
export async function generateProceduralTrack(
  presetId: MusicPresetId,
  durationSeconds: number,
  seed = 1337,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const safeDuration = Math.max(3, Number.isFinite(durationSeconds) ? durationSeconds : 3);
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(safeDuration * sampleRate), sampleRate);
  const rng = new RandomGenerator(seed);

  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(0.75, 0);
  masterGain.connect(offlineCtx.destination);

  // Reverb & Stereo Delay Bus
  const delay = offlineCtx.createDelay();
  delay.delayTime.setValueAtTime(rng.range(0.25, 0.38), 0);
  const delayFeedback = offlineCtx.createGain();
  delayFeedback.gain.setValueAtTime(rng.range(0.2, 0.32), 0);
  const delayFilter = offlineCtx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.setValueAtTime(2600, 0);

  delay.connect(delayFilter);
  delayFilter.connect(delayFeedback);
  delayFeedback.connect(delay);
  delayFilter.connect(masterGain);

  const now = 0;

  switch (presetId) {
    case 'lofi-chill':
      renderLofiTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'synthwave-retro':
      renderSynthwaveTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'deep-ambient':
      renderAmbientTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'epic-drive':
      renderEpicDriveTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'phonk-energy':
      renderPhonkTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'acoustic-warmth':
      renderAcousticTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'funny':
      renderFunnyTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'heroic':
      renderHeroicTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'notes':
      renderNotesTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    case 'lightning':
      renderLightningTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
    default:
      renderLofiTrack(offlineCtx, masterGain, delay, safeDuration, now, rng);
      break;
  }

  return await offlineCtx.startRendering();
}

/**
 * 1. Lo-Fi Chill Hop (Rich jazz chord progressions, rhodes detune, melody licks, vinyl noise)
 */
function renderLofiTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const bpm = rng.int(74, 84);
  const beatLen = 60 / bpm;

  // Multiple jazz chord progressions
  const progressionOptions = [
    // Cmaj7 -> Am9 -> Dm9 -> G13
    [
      ['C4', 'E4', 'G4', 'B4'],
      ['A3', 'C4', 'E4', 'G4', 'B4'],
      ['D4', 'F4', 'A4', 'C5', 'E5'],
      ['G3', 'F4', 'B4', 'E5'],
    ],
    // Fmaj9 -> Em7 -> Dm9 -> Cmaj7
    [
      ['F3', 'A3', 'C4', 'E4', 'G4'],
      ['E3', 'G3', 'B3', 'D4'],
      ['D3', 'F3', 'A3', 'C4', 'E4'],
      ['C4', 'E4', 'G4', 'B4'],
    ],
    // Ebmaj7 -> Cm7 -> Fm7 -> Bb7
    [
      ['Eb3', 'G3', 'Bb3', 'D4'],
      ['C4', 'Eb4', 'G4', 'Bb4'],
      ['F3', 'Ab3', 'C4', 'Eb4'],
      ['Bb3', 'D4', 'F4', 'Ab4'],
    ],
    // Abmaj7 -> Dbmaj7 -> Bbm7 -> Eb7
    [
      ['Ab3', 'C4', 'Eb4', 'G4'],
      ['Db4', 'F4', 'Ab4', 'C5'],
      ['Bb3', 'Db4', 'F4', 'Ab4'],
      ['Eb3', 'G3', 'Bb3', 'Db4'],
    ],
  ];

  const chosenProgression = rng.choice(progressionOptions);
  const chords = chosenProgression.map((chord) => chord.map((n) => getNoteFreq(n)));

  // Vinyl Crackle Noise
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = (Math.random() * 2 - 1) * (Math.random() > 0.98 ? 0.35 : 0.025);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1200, 0);
  noiseFilter.Q.setValueAtTime(1.5, 0);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.06, 0);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(dest);
  noise.start(startTime);
  noise.stop(startTime + duration);

  let t = startTime;
  let chordIdx = 0;
  while (t < startTime + duration) {
    const chord = chords[chordIdx % chords.length];

    // Rhodes / E-Piano Chord
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.setValueAtTime((i - 1.5) * rng.range(2.5, 5.5), t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 3.8);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(rng.range(1200, 1800), t);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      gain.connect(delayBus);

      osc.start(t);
      osc.stop(t + beatLen * 4);
    });

    // Melodic decorative bells / notes
    if (rng.next() > 0.3) {
      const bellNote = chord[rng.int(1, chord.length - 1)] * 2;
      const bellTime = t + beatLen * rng.choice([1.5, 2.5, 3.25]);
      if (bellTime < startTime + duration) {
        const bellOsc = ctx.createOscillator();
        bellOsc.type = 'triangle';
        bellOsc.frequency.setValueAtTime(bellNote, bellTime);
        const bellGain = ctx.createGain();
        bellGain.gain.setValueAtTime(0, bellTime);
        bellGain.gain.linearRampToValueAtTime(0.06, bellTime + 0.02);
        bellGain.gain.exponentialRampToValueAtTime(0.001, bellTime + 1.2);
        bellOsc.connect(bellGain);
        bellGain.connect(delayBus);
        bellGain.connect(dest);
        bellOsc.start(bellTime);
        bellOsc.stop(bellTime + 1.3);
      }
    }

    // Lo-Fi Beat
    playKick(ctx, dest, t, 0.38);
    playSnare(ctx, dest, t + beatLen * 2, 0.22);
    if (rng.next() > 0.35) {
      playKick(ctx, dest, t + beatLen * 2.75, 0.28);
    }

    // Hi-Hats
    for (let b = 0; b < 4; b += 0.5) {
      const swing = b % 1 === 0.5 ? 0.03 : 0;
      playHihat(ctx, dest, t + (b * beatLen) + swing, 0.025);
    }

    t += beatLen * 4;
    chordIdx++;
  }
}

/**
 * 2. Cyber Synthwave (Rolling 80s bass, retro arpeggios, punchy gated kick & snare)
 */
function renderSynthwaveTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const bpm = rng.int(112, 124);
  const beatLen = 60 / bpm;

  const keySets = [
    ['F3', 'D#3', 'C#3', 'D#3'],
    ['A3', 'F3', 'G3', 'E3'],
    ['D3', 'Bb2', 'C3', 'A2'],
    ['G3', 'Eb3', 'F3', 'D3'],
    ['C#3', 'A2', 'B2', 'G#2'],
  ];
  const chosenKey = rng.choice(keySets);
  const bassNotes = chosenKey.map((n) => getNoteFreq(n));

  let t = startTime;
  let bar = 0;
  while (t < startTime + duration) {
    const root = bassNotes[bar % bassNotes.length];

    // 16th note rolling synth bass
    for (let s = 0; s < 16; s++) {
      const noteTime = t + (s * beatLen) / 4;
      if (noteTime >= startTime + duration) break;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const octaveMultiplier = s % 4 === 0 ? 0.5 : (s % 2 === 0 ? 0.5 : 1.0);
      osc.frequency.setValueAtTime(root * octaveMultiplier, noteTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(rng.range(750, 1100), noteTime);
      filter.frequency.exponentialRampToValueAtTime(180, noteTime + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.19, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(noteTime);
      osc.stop(noteTime + 0.15);
    }

    // Arp Lead Line
    const scaleMultipliers = [1, 1.2, 1.334, 1.5, 1.6, 2.0];
    for (let s = 0; s < 8; s++) {
      const noteTime = t + (s * beatLen) / 2;
      if (noteTime >= startTime + duration) break;
      const mult = scaleMultipliers[(s + bar * 2) % scaleMultipliers.length];
      const note = root * mult;

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(note, noteTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.22);

      osc.connect(gain);
      gain.connect(delayBus);
      gain.connect(dest);

      osc.start(noteTime);
      osc.stop(noteTime + 0.24);
    }

    // Drums: 4 on the floor
    playKick(ctx, dest, t, 0.42);
    playSnare(ctx, dest, t + beatLen, 0.26);
    playKick(ctx, dest, t + beatLen * 2, 0.42);
    playSnare(ctx, dest, t + beatLen * 3, 0.26);

    for (let s = 0; s < 8; s++) {
      playHihat(ctx, dest, t + (s * beatLen) / 2, 0.035);
    }

    t += beatLen * 4;
    bar++;
  }
}

/**
 * 3. Deep Ambient Calm (Meditative warm pads, shimmering crystal bells, space reverb)
 */
function renderAmbientTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const rootOptions = [
    ['D3', 'F3', 'A3', 'C4', 'E4'], // Dm9
    ['F3', 'A3', 'C4', 'E4', 'G4'], // Fmaj9
    ['A2', 'C3', 'E3', 'G3', 'B3'], // Am9
    ['G2', 'B2', 'D3', 'F#3', 'A3'], // Gmaj9
  ];
  const chosenSet = rng.choice(rootOptions);
  const rootFreqs = chosenSet.map((n) => getNoteFreq(n));

  rootFreqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(rng.range(0.08, 0.22), startTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(freq * 0.012, startTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(startTime);
    lfo.stop(startTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 2.5);
    gain.gain.setValueAtTime(0.08, startTime + Math.max(2.5, duration - 2.5));
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(rng.range(650, 1100), startTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    gain.connect(delayBus);

    osc.start(startTime);
    osc.stop(startTime + duration);
  });

  // Random crystal bells throughout duration
  let bellTime = startTime + rng.range(0.8, 2.0);
  while (bellTime < startTime + duration - 1) {
    const bellFreq = rng.choice(rootFreqs) * rng.choice([2, 3, 4]);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(bellFreq, bellTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, bellTime);
    gain.gain.linearRampToValueAtTime(0.05, bellTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, bellTime + 2.5);

    osc.connect(gain);
    gain.connect(delayBus);
    gain.connect(dest);

    osc.start(bellTime);
    osc.stop(bellTime + 2.6);

    bellTime += rng.range(1.6, 3.4);
  }
}

/**
 * 4. Motivational Drive (Driving cinematic energy, rhythmic synth pulses, rising percussion)
 */
function renderEpicDriveTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const bpm = rng.int(120, 130);
  const beatLen = 60 / bpm;

  const progOptions = [
    ['A3', 'F3', 'C4', 'G3'],
    ['D3', 'Bb2', 'F3', 'C3'],
    ['E3', 'C3', 'G3', 'D3'],
  ];
  const chosenProg = rng.choice(progOptions);
  const roots = chosenProg.map((n) => getNoteFreq(n));

  let t = startTime;
  let bar = 0;
  while (t < startTime + duration) {
    const root = roots[bar % roots.length];

    // Driving 8th staccato string/synth pulses
    for (let s = 0; s < 8; s++) {
      const noteTime = t + (s * beatLen) / 2;
      if (noteTime >= startTime + duration) break;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(root, noteTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.18);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, noteTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      if (s % 2 === 1) gain.connect(delayBus);

      osc.start(noteTime);
      osc.stop(noteTime + 0.2);
    }

    // Heavy Drive Drums
    playKick(ctx, dest, t, 0.44);
    playKick(ctx, dest, t + beatLen * 1.5, 0.35);
    playSnare(ctx, dest, t + beatLen, 0.28);
    playKick(ctx, dest, t + beatLen * 2, 0.44);
    playSnare(ctx, dest, t + beatLen * 3, 0.28);

    for (let h = 0; h < 8; h++) {
      playHihat(ctx, dest, t + (h * beatLen) / 2, 0.04);
    }

    t += beatLen * 4;
    bar++;
  }
}

/**
 * 5. Drift Phonk Beat (Dirty 808 bass, cowbell melodic hooks, aggressive trap hats)
 */
function renderPhonkTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const bpm = rng.int(132, 142);
  const beatLen = 60 / bpm;

  const keySets = [
    ['C#3', 'E3', 'F#3', 'G#3', 'B3'],
    ['D#3', 'F#3', 'G#3', 'A#3', 'C#4'],
    ['F3', 'Ab3', 'Bb3', 'C4', 'Eb4'],
  ];
  const chosenScale = rng.choice(keySets).map((n) => getNoteFreq(n));
  const root = chosenScale[0];

  let t = startTime;
  let bar = 0;
  while (t < startTime + duration) {
    // Heavy 808 Sub Bass
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(root * 0.5, t);
    if (rng.next() > 0.5) {
      subOsc.frequency.exponentialRampToValueAtTime(root * 0.4, t + beatLen * 2);
    }

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.32, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 3.8);

    subOsc.connect(subGain);
    subGain.connect(dest);
    subOsc.start(t);
    subOsc.stop(t + beatLen * 3.9);

    // Iconic Cowbell Riff
    for (let s = 0; s < 8; s++) {
      const noteTime = t + (s * beatLen) / 2;
      if (noteTime >= startTime + duration) break;
      const cowNote = chosenScale[(s * 2 + bar) % chosenScale.length] * 2;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'square';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(cowNote, noteTime);
      osc2.frequency.setValueAtTime(cowNote * 1.5, noteTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.14);

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(cowNote * 1.2, noteTime);
      bandpass.Q.setValueAtTime(4.0, noteTime);

      osc1.connect(bandpass);
      osc2.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(dest);
      gain.connect(delayBus);

      osc1.start(noteTime);
      osc2.start(noteTime);
      osc1.stop(noteTime + 0.16);
      osc2.stop(noteTime + 0.16);
    }

    // Phonk Drums
    playKick(ctx, dest, t, 0.46);
    playSnare(ctx, dest, t + beatLen, 0.32);
    playKick(ctx, dest, t + beatLen * 2.25, 0.42);
    playSnare(ctx, dest, t + beatLen * 3, 0.32);

    // Fast 16th Phonk Trap Hats
    for (let h = 0; h < 16; h++) {
      playHihat(ctx, dest, t + (h * beatLen) / 4, 0.03);
    }

    t += beatLen * 4;
    bar++;
  }
}

/**
 * 6. Acoustic Warmth (Fingerpicking acoustic arpeggios, warm indie chords, soft shaker)
 */
function renderAcousticTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const bpm = rng.int(80, 90);
  const beatLen = 60 / bpm;

  const progOptions = [
    // G -> D -> Em -> C
    [
      ['G3', 'B3', 'D4', 'G4'],
      ['D3', 'F#3', 'A3', 'D4'],
      ['E3', 'G3', 'B3', 'E4'],
      ['C3', 'E3', 'G3', 'C4'],
    ],
    // C -> G -> Am -> F
    [
      ['C3', 'E3', 'G3', 'C4'],
      ['G3', 'B3', 'D4', 'G4'],
      ['A3', 'C4', 'E4', 'A4'],
      ['F3', 'A3', 'C4', 'F4'],
    ],
    // D -> A -> Bm -> G
    [
      ['D3', 'F#3', 'A3', 'D4'],
      ['A3', 'C#4', 'E4', 'A4'],
      ['B3', 'D4', 'F#4', 'B4'],
      ['G3', 'B3', 'D4', 'G4'],
    ],
  ];

  const chosenProg = rng.choice(progOptions);
  const chords = chosenProg.map((chord) => chord.map((n) => getNoteFreq(n)));

  let t = startTime;
  let chordIdx = 0;
  while (t < startTime + duration) {
    const chord = chords[chordIdx % chords.length];

    // Acoustic fingerpicking arpeggio (4 notes per beat)
    for (let i = 0; i < 8; i++) {
      const noteTime = t + (i * beatLen) / 2;
      if (noteTime >= startTime + duration) break;
      const noteFreq = chord[i % chord.length];

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(noteFreq, noteTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.12, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + beatLen * 1.6);

      osc.connect(gain);
      gain.connect(dest);
      gain.connect(delayBus);

      osc.start(noteTime);
      osc.stop(noteTime + beatLen * 1.7);
    }

    // Soft organic percussion
    playKick(ctx, dest, t, 0.28);
    playSnare(ctx, dest, t + beatLen * 2, 0.16);

    for (let s = 0; s < 4; s++) {
      playHihat(ctx, dest, t + s * beatLen, 0.02);
    }

    t += beatLen * 4;
    chordIdx++;
  }
}

// Drum synthesizer helpers
function playKick(ctx: OfflineAudioContext, dest: AudioNode, time: number, vol = 0.35) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(130, time);
  osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.15);
}

function playSnare(ctx: OfflineAudioContext, dest: AudioNode, time: number, vol = 0.2) {
  const bufferSize = Math.floor(ctx.sampleRate * 0.12);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  noise.connect(gain);
  gain.connect(dest);
  noise.start(time);
  noise.stop(time + 0.13);
}

function playHihat(ctx: OfflineAudioContext, dest: AudioNode, time: number, vol = 0.05) {
  const bufferSize = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(7000, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  noise.start(time);
  noise.stop(time + 0.05);
}

/**
 * 7. Смешной (Comical & Cartoon: bouncy staccato bass, playful slides, whimsical synth motifs)
 */
function renderFunnyTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const bpm = 124;
  const beatLen = 60 / bpm;
  const scale = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'].map((n) => getNoteFreq(n));
  const bassNotes = ['C3', 'G2', 'F2', 'G2', 'C3', 'A2', 'D3', 'G2'].map((n) => getNoteFreq(n));

  let t = startTime;
  let step = 0;
  while (t < duration) {
    // Упругий мультяшный бас "boing" на каждую долю с чередованием нот
    const bassFreq = bassNotes[step % bassNotes.length];
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = 'triangle';
    bassOsc.frequency.setValueAtTime(bassFreq * 1.12, t);
    bassOsc.frequency.exponentialRampToValueAtTime(bassFreq, t + 0.07);
    bassGain.gain.setValueAtTime(0.3, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 0.65);
    bassOsc.connect(bassGain);
    bassGain.connect(dest);
    bassOsc.start(t);
    bassOsc.stop(t + beatLen * 0.7);

    // Забавная прыгающая мелодия
    for (let sub = 0; sub < 2; sub++) {
      const noteTime = t + sub * (beatLen / 2);
      if (rng.next() > 0.28) {
        const noteFreq = rng.choice(scale);
        const melOsc = ctx.createOscillator();
        const melGain = ctx.createGain();
        melOsc.type = (step + sub) % 3 === 0 ? 'square' : 'sine';

        // Забавный комичный глиссандо-слайд
        if (rng.next() > 0.72) {
          melOsc.frequency.setValueAtTime(noteFreq * 0.75, noteTime);
          melOsc.frequency.exponentialRampToValueAtTime(noteFreq * 1.25, noteTime + beatLen * 0.35);
        } else {
          melOsc.frequency.setValueAtTime(noteFreq, noteTime);
        }

        melGain.gain.setValueAtTime(0.14, noteTime);
        melGain.gain.exponentialRampToValueAtTime(0.001, noteTime + beatLen * 0.42);
        melOsc.connect(melGain);
        melGain.connect(dest);
        melGain.connect(delayBus);
        melOsc.start(noteTime);
        melOsc.stop(noteTime + beatLen * 0.45);
      }
    }

    // Перкуссия с акцентами
    if (step % 2 === 0) {
      playKick(ctx, dest, t, 0.2);
    } else {
      playSnare(ctx, dest, t, 0.14);
    }
    playHihat(ctx, dest, t + beatLen * 0.5, 0.03);

    t += beatLen;
    step++;
  }
}

/**
 * 8. Героический (Epic & Fanfare: triumphant brass synth, martial pulse, majestic chord progression)
 */
function renderHeroicTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const bpm = 130;
  const beatLen = 60 / bpm;
  const heroicChords = [
    ['D3', 'F3', 'A3', 'D4'],
    ['Bb2', 'D3', 'F3', 'Bb3'],
    ['C3', 'E3', 'G3', 'C4'],
    ['F3', 'A3', 'C4', 'F4'],
  ];

  let t = startTime;
  let chordIdx = 0;
  while (t < duration) {
    const chord = heroicChords[chordIdx % heroicChords.length].map((n) => getNoteFreq(n));

    // Мощные кинематографичные медные аккорды
    chord.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750, t);
      filter.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
      filter.frequency.exponentialRampToValueAtTime(950, t + beatLen * 3.8);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 3.85);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      gain.connect(delayBus);

      osc.start(t);
      osc.stop(t + beatLen * 3.9);
    });

    // Маршевый ритм и героическая фанфарная тема
    for (let b = 0; b < 4; b++) {
      const bt = t + b * beatLen;
      playKick(ctx, dest, bt, 0.42);
      playHihat(ctx, dest, bt, 0.04);
      playHihat(ctx, dest, bt + beatLen * 0.5, 0.045);
      if (b === 1 || b === 3) {
        playSnare(ctx, dest, bt, 0.25);
      }

      // Фанфарная мелодическая линия в высоком регистре
      if (b === 0 || b === 2) {
        const leadFreq = chord[chord.length - 1] * (b === 0 ? 1.5 : 2);
        const leadOsc = ctx.createOscillator();
        const leadGain = ctx.createGain();
        leadOsc.type = 'sawtooth';
        leadOsc.frequency.setValueAtTime(leadFreq, bt);
        leadGain.gain.setValueAtTime(0.14, bt);
        leadGain.gain.exponentialRampToValueAtTime(0.001, bt + beatLen * 0.75);
        leadOsc.connect(leadGain);
        leadGain.connect(dest);
        leadGain.connect(delayBus);
        leadOsc.start(bt);
        leadOsc.stop(bt + beatLen * 0.8);
      }
    }

    t += beatLen * 4;
    chordIdx++;
  }
}

/**
 * 9. Ноты (Minimal & Tones: отдельные чистые звуки разной тональности с интервалом тишины 1 секунда)
 */
function renderNotesTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  // Чистые выразительные ноты разной тональности
  const notePool = [
    'C4', 'D4', 'E4', 'G4', 'A4',
    'B4', 'C5', 'D5', 'E5', 'G5',
    'A5', 'B5', 'C6', 'D6', 'E6',
    'F#4', 'F#5', 'Ab4', 'Eb5', 'Bb4'
  ].map((n) => getNoteFreq(n));

  let t = startTime + 0.15;
  const notePlayDuration = 0.45; // Звучание отдельной ноты
  const silenceInterval = 1.0;  // Ровно 1 секунда полной тишины между звуками

  while (t < duration) {
    const freq = rng.choice(notePool);

    // Кристальный чистый звук с мягкими гармоническими обертонами
    [1, 2, 3].forEach((harmonic, hIdx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = hIdx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq * harmonic, t);

      const hVol = hIdx === 0 ? 0.32 : hIdx === 1 ? 0.1 : 0.035;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(hVol, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + notePlayDuration);

      osc.connect(gain);
      gain.connect(dest);
      gain.connect(delayBus);

      osc.start(t);
      osc.stop(t + notePlayDuration + 0.05);
    });

    // Шаг: продолжительность звучания ноты + ровно 1 секунда тишины
    t += notePlayDuration + silenceInterval;
  }
}

/**
 * 10. Молния (High-Speed Synth: сверхбыстрые стремительные мелодии, электрические 16-е арпеджио)
 */
function renderLightningTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number,
  rng: RandomGenerator
) {
  const bpm = 165;
  const beatLen = 60 / bpm;
  const step16th = beatLen / 4;

  const scale = ['E3', 'G3', 'A3', 'B3', 'D4', 'E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5', 'A5'].map((n) => getNoteFreq(n));

  let t = startTime;
  let step = 0;
  while (t < duration) {
    // Стремительное 16-е арпеджио на высокой скорости
    const noteIdx = (step % 8 < 4) ? (step % scale.length) : (scale.length - 1 - (step % scale.length));
    const freq = scale[Math.min(scale.length - 1, Math.max(0, noteIdx))];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600 + Math.sin(t * 5) * 1600, t);

    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + step16th * 0.85);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    if (step % 2 === 0) {
      gain.connect(delayBus);
    }

    osc.start(t);
    osc.stop(t + step16th);

    // Плотный скоростной ритм
    if (step % 4 === 0) {
      playKick(ctx, dest, t, 0.38);
    }
    if (step % 8 === 4) {
      playSnare(ctx, dest, t, 0.22);
    }
    playHihat(ctx, dest, t, 0.03);

    t += step16th;
    step++;
  }
}
