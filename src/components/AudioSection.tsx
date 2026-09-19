import React, { useRef } from 'react';
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
  const [previewingPreset, setPreviewingPreset] = React.useState<MusicPresetId | null>(null);
  const [isAudioLoading, setIsAudioLoading] = React.useState<boolean>(false);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value so re-selecting the same file fires onChange reliably
    e.target.value = '';
    if (!file) return;

    // Revoke previous audio blob to prevent memory build-up
    if (state.audio.audioUrl && state.audio.audioUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(state.audio.audioUrl);
      } catch {}
    }

    setIsAudioLoading(true);
    const url = URL.createObjectURL(file);
    const audioTest = new Audio(url);

    let resolved = false;
    const commitAudio = (duration: number) => {
      if (resolved) return;
      resolved = true;
      setIsAudioLoading(false);

      try {
        audioTest.onloadedmetadata = null;
        audioTest.onerror = null;
        audioTest.pause();
        audioTest.removeAttribute('src');
        audioTest.load();
      } catch {}

      // Persist binary audio blob to IndexedDB so page reload / tab discard never loses it
      saveMediaFile('audio', file, file.name, file.type, duration).catch(() => {});

      onChange({
        audio: {
          ...state.audio,
          enabled: true,
          sourceType: 'file',
          audioUrl: url,
          audioFileName: file.name,
          audioDuration: duration > 0 ? duration : totalDuration,
        },
      });
    };

    audioTest.onloadedmetadata = () => {
      const dur = audioTest.duration;
      commitAudio(Number.isFinite(dur) && dur > 0 ? dur : totalDuration);
    };

    audioTest.onerror = () => {
      console.warn('Audio metadata load warning, proceeding with fallback duration');
      commitAudio(totalDuration);
    };

    // Mobile fallback timer: if mobile browser delays metadata, commit anyway
    setTimeout(() => {
      if (!resolved) {
        const dur = audioTest.duration;
        commitAudio(Number.isFinite(dur) && dur > 0 ? dur : totalDuration);
      }
    }, 600);

    try {
      audioTest.load();
    } catch {}
  };

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
        volume: state.audio.volume || 0.7,
      },
      8,
      0
    );
  };

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

  const triggerAudioPicker = () => {
    // Stop any audio preview to save CPU/battery
    audioMixer.stop();
    setPreviewingPreset(null);
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-[#16161D] border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Section Header with Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            4
          </span>
          Музыка и Саундтрек
        </h2>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-zinc-300 hover:text-white transition-colors">
            <span>Звук включен</span>
            <input
              type="checkbox"
              checked={state.audio.enabled}
              onChange={(e) =>
                onChange({
                  audio: { ...state.audio, enabled: e.target.checked },
                })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 relative"></div>
          </label>
        </div>
      </div>

      {state.audio.enabled && (
        <div className="space-y-4 pt-1 animate-in fade-in duration-200">
          {/* Source Tabs: Procedural Generator vs Custom File */}
          <div className="grid grid-cols-2 gap-2 bg-[#0F0F12] border border-white/10 p-1 rounded-xl">
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
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                state.audio.sourceType === 'generator'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Сгенерировать саундтрек
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
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                state.audio.sourceType === 'file'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Загрузить свой аудиофайл
            </button>
          </div>

          {/* Generator Presets Grid */}
          {state.audio.sourceType === 'generator' && (
            <div className="space-y-2">
              <div className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                <Disc className="w-3.5 h-3.5 text-purple-400" /> Выберите музыкальный стиль (генерация без авторских прав):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {MUSIC_PRESETS.map((preset) => {
                  const isSelected = state.audio.presetId === preset.id;
                  const isPreviewing = previewingPreset === preset.id;

                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-1.5 cursor-pointer group select-none ${
                        isSelected
                          ? 'border-purple-400 bg-purple-500/15 shadow-sm ring-1 ring-purple-400/50'
                          : 'border-white/10 bg-[#0F0F12]/60 hover:bg-[#0F0F12] hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{preset.emoji}</span>
                          <div>
                            <div className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                              {preset.name}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              {preset.genre} • {preset.bpm} BPM
                            </div>
                          </div>
                        </div>

                        {/* Preview Audio Play/Pause Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePresetPreview(preset.id);
                          }}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            isPreviewing
                              ? 'bg-purple-500 text-white animate-pulse'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
                          }`}
                          title={isPreviewing ? 'Остановить прослушивание' : 'Прослушать отрывок'}
                        >
                          {isPreviewing ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5" />
                          )}
                        </button>
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-snug">
                        {preset.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Audio File Upload */}
          {state.audio.sourceType === 'file' && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/x-m4a,audio/aac,audio/flac,.mp3,.wav,.ogg,.m4a,.aac,.flac,audio/*"
                onChange={handleAudioUpload}
                className="hidden"
              />

              {state.audio.audioFileName ? (
                <div className="bg-[#0F0F12] border border-purple-500/40 rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
                      <FileAudio className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {state.audio.audioFileName}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {state.audio.audioDuration > 0
                          ? `Длительность: ${Math.round(state.audio.audioDuration)} сек.`
                          : 'Аудиофайл подключен'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
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
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={triggerAudioPicker}
                  className="border-2 border-dashed border-white/15 hover:border-purple-500/80 bg-[#0F0F12]/60 hover:bg-[#0F0F12] rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group select-none"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 group-hover:bg-purple-500/20 text-purple-400 flex items-center justify-center transition-colors">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-zinc-200 group-hover:text-purple-300">
                      {isAudioLoading ? 'Подключение аудиофайла...' : 'Нажмите для загрузки MP3, WAV, AAC или OGG'}
                    </span>
                    <p className="text-[11px] text-zinc-500">
                      Файл автоматически сохраняется в памяти приложения и не исчезнет
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Volume & Loop Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
            <div className="bg-[#0F0F12]/80 border border-white/10 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
                  {state.audio.volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-purple-400" />
                  )}
                  Громкость музыки:
                </span>
                <span className="text-purple-400 font-bold">
                  {Math.round(state.audio.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.audio.volume}
                onChange={(e) => {
                  const vol = parseFloat(e.target.value);
                  audioMixer.setVolume(vol);
                  onChange({
                    audio: { ...state.audio, volume: vol },
                  });
                }}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="bg-[#0F0F12]/80 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-200">
                <Repeat className="w-4 h-4 text-purple-400" />
                <span>Зацикливать трек (Loop)</span>
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
    </div>
  );
};

