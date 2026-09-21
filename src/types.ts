export type TextMode = 'word' | 'sentence' | 'full';

export type AnimationStyle = 'typewriter' | 'words' | 'fade' | 'slide' | 'zoom' | 'glitch';

export interface ExtraEffects {
  glow: boolean;
  sparkle: boolean;
  fire: boolean;
  neon: boolean;
  shadow: boolean;
  particles: boolean;
}

export type AspectRatio = '9:16' | '16:9' | '1:1';

export interface FontOption {
  id: string;
  name: string;
  family: string;
  category: string;
  sampleText: string;
  cyrillicSupport: boolean;
}

export interface BackgroundPreset {
  id: string;
  name: string;
  type: 'gradient' | 'procedural';
  colors: string[];
  description: string;
}

export interface TextSegment {
  text: string;
  words: string[];
  startTime: number;
  endTime: number;
  duration: number;
}

export type AudioSourceType = 'none' | 'video' | 'file' | 'generator';

export type MusicPresetId =
  | 'lofi-chill'
  | 'synthwave-retro'
  | 'deep-ambient'
  | 'epic-drive'
  | 'phonk-energy'
  | 'acoustic-warmth'
  | 'funny'
  | 'heroic'
  | 'notes'
  | 'lightning';

export interface AudioState {
  enabled: boolean;
  sourceType: AudioSourceType;
  audioUrl: string | null;
  audioFileName: string | null;
  presetId: MusicPresetId;
  seed?: number; // Random seed for truly unique procedural music composition
  volume: number; // 0 to 1 (Music volume)
  loop: boolean;
  audioDuration: number;
  // Dual-layer audio controls for video background sound
  videoAudioEnabled?: boolean; // When true, background video audio track is active
  videoVolume?: number; // 0 to 1 (Video original voice/sound volume)
}

export interface VideoProjectState {
  // Background
  bgType: 'none' | 'image' | 'video' | 'preset';
  bgMediaUrl: string | null;
  bgMediaType: 'image' | 'video' | null;
  bgPresetId: string;
  bgCustomColor?: string; // Optional custom sheet / gradient color
  bgOverlayOpacity: number; // 0 to 0.9

  // Audio / Music
  audio: AudioState;

  // Text
  rawText: string;
  authorText: string;
  textMode: TextMode;
  fontFamily: string;
  fontSize: number; // in pt/px base
  textColor: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  textAlign: 'center' | 'left' | 'right';
  textPosition: 'center' | 'top' | 'bottom';
  textPositionY: number; // 15 to 85 (default 50% - vertical center)
  isUppercase: boolean;

  // Animation & Effects
  animationStyle: AnimationStyle;
  effects: ExtraEffects;
  neonColor: string;
  speedMultiplier: number; // 0.1 to 3.0
  pauseBetweenSeconds: number; // 0.2 to 3.0
  syncWithVideo?: boolean; // When true and video background is present, text animates smoothly across video length
  textLoopMode?: 'stretch' | 'loop'; // Whether to stretch text pacing across video or loop text every cycle

  // Canvas & Output
  aspectRatio: AspectRatio;
}
