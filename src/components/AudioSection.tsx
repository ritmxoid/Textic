import React, { useRef, useState } from 'react';
import {
  Upload,
  Volume2,
  VolumeX,
  Sparkles,
  Repeat,
  FileAudio,
  X,
  Play,
  Pause,
  Disc,
  Video as VideoIcon,
  RefreshCw,
  Dices,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { VideoProjectState, MusicPresetId } from '../types';
import { MUSIC_PRESETS } from '../utils/audioGenerator';
import { audioMixer } from '../utils/audioMixer';
import { saveMediaFile, clearMediaFile } from '../utils/projectStorage';

interface AudioSectionProps {
  state: VideoProjectState;
  onChange: (updates: Partial<VideoProjectState>) => void;
  totalDuration: number;
}

export const AudioSection: React.FC<AudioSectionProps> = ({
  state,
  onChange,
  totalDuration,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewingPreset, setPreviewingPreset] = useState<MusicPresetId | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);

  const hasVideoBackground = state.bgMediaType === 'video' || state.bgType === 'video';

  const isVideoAudioEnabled = state.audio.videoAudioEnabled !== false;
  const videoVolume = state.audio.videoVolume ?? 0.8;

  const isMusicEnabled = state.audio.enabled;
  const musicVolume = state.audio.volume ?? 0.7;

  // Toggle Video Audio Track
  const handleToggleVideoAudio = (enabled: boolean) => {
    onChange({
      audio: {
        ...state.audio,
        videoAudioEnabled: enabled,
      },
    });
  };

  // Change Video Volume
  const handleChangeVideoVolume = (vol: number) => {
    onChange({
      audio: {
        ...state.audio,
        videoVolume: vol,
        videoAudioEnabled: vol > 0 ? true : state.audio.videoAudioEnabled,
      },
    });
  };

  // Toggle Music Track
  const handleToggleMusic = (enabled: boolean) => {
    let nextSourceType = state.audio.sourceType;
    if (enabled && (nextSourceType === 'none' || nextSourceType === 'video')) {
      nextSourceType = state.audio.audioUrl ? 'file' : 'generator';
    }

    onChange({
      audio: {
        ...state.audio,
        enabled,
        sourceType: nextSourceType,
      },
    });
  };

  // Change Music Volume
  const handleChangeMusicVolume = (vol: number) => {
    audioMixer.setVolume(vol);
    onChange({
      audio: {
        ...state.audio,
        volume: vol,
      },
    });
  };

  // Upload Custom Audio
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (state.audio.audioUrl && state.audio.audioUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(state.audio.audioUrl);
      } catch {}
    }

    setIsAudioLoading(true);
    const url = URL.createObjectURL(file);

    let audioDuration = totalDuration;
    try {
      const probeAudio = new Audio();
      probeAudio.preload = 'metadata';
      const durationPromise = new Promise<number>((resolve) => {
        probeAudio.onloadedmetadata = () => {
          resolve(
            Number.isFinite(probeAudio.duration) && probeAudio.duration > 0
              ? probeAudio.duration
              : totalDuration
          );
        };
        probeAudio.onerror = () => resolve(totalDuration);
        setTimeout(() => resolve(totalDuration), 2000);
      });
      probeAudio.src = url;
      audioDuration = await durationPromise;
      probeAudio.src = '';
      probeAudio.remove();
    } catch (probeErr) {
      console.warn('Audio metadata probe fallback:', probeErr);
    }

    try {
      await saveMediaFile('audio', file, file.name, file.type, audioDuration);
    } catch (saveErr) {
      console.warn('Could not cache audio to IndexedDB:', saveErr);
    }

    setIsAudioLoading(false);

    onChange({
      audio: {
        ...state.audio,
        enabled: true,
        sourceType: 'file',
        audioUrl: url,
        audioFileName: file.name,
        audioDuration,
      },
    });

    if (e.target) {
      e.target.value = '';
    }
  };

  // Remove Custom Audio
  const handleClearAudioFile = () => {
    if (state.audio.audioUrl) {
      try {
        URL.revokeObjectURL(state.audio.audioUrl);
      } catch {}
    }
    clearMediaFile('audio');
    onChange({
      audio: {
        ...state.audio,
        sourceType: 'generator',
        audioUrl: null,
        audioFileName: null,
        audioDuration: 0,
      },
    });
  };

  // Preview Music Preset
  const handleTogglePresetPreview = async (presetId: MusicPresetId) => {
    if (previewingPreset === presetId) {
      audioMixer.stop();
      setPreviewingPreset(null);
      return;
    }

    setPreviewingPreset(presetId);
    await audioMixer.play(
      {
        ...state.audio,
        enabled: true,
        sourceType: 'generator',
        presetId,
        seed: state.audio.seed || 1337,
        volume: musicVolume,
      },
      8,
      0
    );
  };

  // Select Music Preset
  const handleSelectPreset = (presetId: MusicPresetId) => {
    audioMixer.stop();
    setPreviewingPreset(null);
    onChange({
      audio: {
        ...state.audio,
        enabled: true,
        sourceType: 'generator',
        presetId,
      },
    });
  };

  // Re-generate Seed for Music Generator
  const handleRegenerateSeed = (specificPreset?: MusicPresetId) => {
    setIsRegenerating(true);
    audioMixer.stop();
    setPreviewingPreset(null);

    const newSeed = Math.floor(Math.random() * 1000000) + 1;
    const targetPreset = specificPreset || state.audio.presetId;

    onChange({
      audio: {
        ...state.audio,
        enabled: true,
        sourceType: 'generator',
        presetId: targetPreset,
        seed: newSeed,
      },
    });

    setTimeout(() => {
      setIsRegenerating(false);
      // Do not auto-play music on seed generation
    }, 250);
  };

  const triggerAudioPicker = () => {
    audioMixer.stop();
    setPreviewingPreset(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  return (
    <div className="bg-[#16161D] border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            4
          </span>
          Звуковой микшер и Музыка
        </h2>
        <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
          <Sliders className="w-3.5 h-3.5 text-purple-400" />
          Мульти-трековый микс
        </span>
      </div>

      {/* TRACK 1: Video Sound (Only if Video Background is present) */}
      {hasVideoBackground && (
        <div className="bg-[#0F0F12] border border-white/10 rounded-xl p-4 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
                <VideoIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Звук из видео (Голос / Исходный звук)</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold border border-indigo-500/30">
                    Трек 1
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Оригинальная речь и окружающий звук из прикрепленного видео
                </p>
              </div>
            </div>

            {/* Toggle Video Sound */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-zinc-300 hover:text-white transition-colors shrink-0">
              <input
                type="checkbox"
                checked={isVideoAudioEnabled}
                onChange={(e) => handleToggleVideoAudio(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 relative"></div>
            </label>
          </div>

          {/* Volume Control for Video Track */}
          {isVideoAudioEnabled && (
            <div className="pt-2 border-t border-white/5 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
                  {videoVolume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  Громкость звука видео:
                </span>
                <span className="text-indigo-400 font-bold">
                  {Math.round(videoVolume * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={videoVolume}
                  onChange={(e) => handleChangeVideoVolume(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleChangeVideoVolume(videoVolume > 0 ? 0 : 0.8)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition-colors shrink-0 cursor-pointer"
                >
                  {videoVolume === 0 ? 'Вкл. звук' : 'Заглушить'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRACK 2: Background Music / Soundtrack Track */}
      <div className="bg-[#0F0F12] border border-white/10 rounded-xl p-4 space-y-3 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Музыкальное сопровождение</span>
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-semibold border border-purple-500/30">
                  {hasVideoBackground ? 'Трек 2' : 'Основной трек'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {hasVideoBackground
                  ? 'Накладывается поверх голоса из видеофайла'
                  : 'Фоновая музыка для ролика'}
              </p>
            </div>
          </div>

          {/* Toggle Music */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-zinc-300 hover:text-white transition-colors shrink-0">
            <input
              type="checkbox"
              checked={isMusicEnabled}
              onChange={(e) => handleToggleMusic(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 relative"></div>
          </label>
        </div>

        {isMusicEnabled && (
          <div className="pt-2 border-t border-white/5 space-y-3 animate-in fade-in duration-150">
            {/* Source Switch: Generator vs Custom File */}
            <div className="grid grid-cols-2 gap-2 bg-black/40 border border-white/10 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  audioMixer.stop();
                  setPreviewingPreset(null);
                  onChange({
                    audio: {
                      ...state.audio,
                      sourceType: 'generator',
                    },
                  });
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  state.audio.sourceType === 'generator'
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Синтез мелодий</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  audioMixer.stop();
                  setPreviewingPreset(null);
                  onChange({
                    audio: {
                      ...state.audio,
                      sourceType: 'file',
                    },
                  });
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  state.audio.sourceType === 'file'
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span>Свой аудиофайл</span>
              </button>
            </div>

            {/* Custom Audio File Upload UI */}
            {state.audio.sourceType === 'file' && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                  onChange={handleAudioUpload}
                  className="hidden"
                />

                {state.audio.audioFileName ? (
                  <div className="bg-black/30 border border-purple-500/40 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
                        <FileAudio className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {state.audio.audioFileName}
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          {state.audio.audioDuration > 0
                            ? `Длительность: ${Math.round(state.audio.audioDuration)} сек.`
                            : 'Файл прикреплен'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={triggerAudioPicker}
                        disabled={isAudioLoading}
                        className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isAudioLoading ? 'Загрузка...' : 'Заменить'}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAudioFile}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
                        title="Удалить аудиофайл"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={triggerAudioPicker}
                    className="border-2 border-dashed border-white/15 hover:border-purple-500/80 bg-black/20 hover:bg-black/40 rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 group select-none"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 group-hover:bg-purple-500/20 text-purple-400 flex items-center justify-center transition-colors">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-zinc-200 group-hover:text-purple-300">
                        {isAudioLoading ? 'Подключение файла...' : 'Нажмите для выбора MP3, WAV, AAC или M4A'}
                      </span>
                      <p className="text-[10px] text-zinc-500">
                        Файл сохранится в приложении и воспроизводится параллельно со звуком видео
                      </p>
                    </div>
                  </div>
                )}

                {/* Music Volume & Loop for Custom Audio File */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="bg-black/30 border border-white/10 rounded-xl p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-semibold flex items-center gap-1.5 text-[11px]">
                        {musicVolume === 0 ? (
                          <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                        )}
                        Громкость аудиофайла:
                      </span>
                      <span className="text-purple-400 font-bold text-xs">
                        {Math.round(musicVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={musicVolume}
                      onChange={(e) => handleChangeMusicVolume(parseFloat(e.target.value))}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="bg-black/30 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-zinc-200">
                      <Repeat className="w-3.5 h-3.5 text-purple-400" />
                      <span>Зацикливать аудио</span>
                    </label>
                    <input
                      type="checkbox"
                      checked={state.audio.loop}
                      onChange={(e) =>
                        onChange({
                          audio: { ...state.audio, loop: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded border-zinc-700 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Generator Presets Grid (Синтез мелодий) */}
            {state.audio.sourceType === 'generator' && (
              <div className="space-y-2.5">
                {/* 1. Volume Slider & Loop ABOVE preset style buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-black/30 border border-white/10 rounded-xl p-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-semibold flex items-center gap-1.5 text-[11px]">
                        {musicVolume === 0 ? (
                          <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                        )}
                        Громкость синтеза:
                      </span>
                      <span className="text-purple-400 font-bold text-xs">
                        {Math.round(musicVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={musicVolume}
                      onChange={(e) => handleChangeMusicVolume(parseFloat(e.target.value))}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pl-0 sm:pl-2 border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0">
                    <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-zinc-200">
                      <Repeat className="w-3.5 h-3.5 text-purple-400" />
                      <span>Зацикливать мелодию</span>
                    </label>
                    <input
                      type="checkbox"
                      checked={state.audio.loop}
                      onChange={(e) =>
                        onChange({
                          audio: { ...state.audio, loop: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded border-zinc-700 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 2. Variation & Seed Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-black/20 border border-white/10 p-2.5 rounded-xl">
                  <div className="text-xs text-zinc-300 font-medium flex items-center gap-2">
                    <Disc className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="text-[11px] text-zinc-300">
                      Синтез музыки без авторских прав (Seed: {state.audio.seed || 1337})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRegenerateSeed()}
                    disabled={isRegenerating}
                    className="w-full sm:w-auto px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-600/30 cursor-pointer disabled:opacity-50 shrink-0"
                    title="Создать новую вариацию мелодии"
                  >
                    <Dices className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                    <span>{isRegenerating ? 'Генерация...' : 'Новая вариация'}</span>
                  </button>
                </div>

                {/* 3. Style Buttons (1.5 rows visible with scroll) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[148px] sm:max-h-[156px] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent rounded-xl">
                  {MUSIC_PRESETS.map((preset) => {
                    const isSelected = state.audio.presetId === preset.id;
                    const isPreviewing = previewingPreset === preset.id;

                    return (
                      <div
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-1.5 cursor-pointer group select-none ${
                          isSelected
                            ? 'border-purple-400 bg-purple-500/15 shadow-sm ring-1 ring-purple-400/50'
                            : 'border-white/10 bg-black/20 hover:bg-black/40 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{preset.emoji}</span>
                            <div>
                              <div className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                                {preset.name}
                              </div>
                              <div className="text-[10px] text-zinc-400">
                                {preset.genre} • {preset.bpm} BPM
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleRegenerateSeed(preset.id)}
                              className="w-6 h-6 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-purple-300 flex items-center justify-center transition-colors cursor-pointer border border-white/5"
                              title="Сгенерировать другую вариацию этого стиля"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleTogglePresetPreview(preset.id)}
                              className={`w-6 h-6 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                                isPreviewing
                                  ? 'bg-purple-500 text-white animate-pulse'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
                              }`}
                              title={isPreviewing ? 'Остановить' : 'Прослушать'}
                            >
                              {isPreviewing ? (
                                <Pause className="w-3 h-3" />
                              ) : (
                                <Play className="w-3 h-3 ml-0.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <p className="text-[10px] text-zinc-400 leading-snug">
                          {preset.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Simultaneous Mix Summary Badge */}
      {hasVideoBackground && isVideoAudioEnabled && isMusicEnabled && (
        <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-3 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-[11px] text-zinc-300 leading-snug">
            <span className="font-bold text-white">Параллельное сведение активно:</span> голос из видео воспроизводится на {Math.round(videoVolume * 100)}%, а музыка — на {Math.round(musicVolume * 100)}%.
          </p>
        </div>
      )}
    </div>
  );
};
