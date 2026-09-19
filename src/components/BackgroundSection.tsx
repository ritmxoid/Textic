import React from 'react';
import {
  Film,
  X,
  Sliders,
  CheckCircle2,
  Image as ImageIcon,
  Palette,
} from 'lucide-react';
import { BACKGROUND_PRESETS } from '../data/presets';
import { VideoProjectState } from '../types';

interface BackgroundSectionProps {
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
  onClearBackgroundMedia: () => void;
  fileName: string | null;
}

export const BackgroundSection: React.FC<BackgroundSectionProps> = ({
  state,
  onChange,
  onClearBackgroundMedia,
  fileName,
}) => {
  const isCustomMediaActive =
    (state.bgType === 'video' || state.bgType === 'image') && Boolean(state.bgMediaUrl);

  return (
    <div className="bg-[#16161D] border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            3
          </span>
          Фон видео
        </h2>

        {fileName && (
          <button
            type="button"
            onClick={onClearBackgroundMedia}
            className="text-xs text-zinc-400 hover:text-rose-300 flex items-center gap-1 hover:bg-rose-500/10 px-2 py-1 rounded-lg transition-colors cursor-pointer"
            title="Удалить прикрепленный файл и сбросить на пресет"
          >
            <X className="w-3.5 h-3.5" /> Сбросить фон
          </button>
        )}
      </div>

      {/* Active User Media Status (if uploaded from top button) */}
      {fileName && (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            {state.bgMediaType === 'image' ? (
              <ImageIcon className="w-4 h-4 text-purple-400 shrink-0" />
            ) : (
              <Film className="w-4 h-4 text-purple-400 shrink-0" />
            )}
            <span className="text-zinc-200 font-medium truncate max-w-[170px] sm:max-w-[260px]">
              {fileName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isCustomMediaActive ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" /> Активен
              </span>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    bgType: state.bgMediaType === 'image' ? 'image' : 'video',
                  })
                }
                className="text-[11px] font-bold text-purple-300 hover:text-purple-200 bg-purple-500/20 hover:bg-purple-500/30 px-2.5 py-1 rounded-lg border border-purple-500/30 transition-colors cursor-pointer"
              >
                Включить
              </button>
            )}
          </div>
        </div>
      )}

      {/* Preset Background Gradients */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-purple-400" />
            {fileName ? 'Градиентные и анимированные темы:' : 'Цветовые и анимированные темы:'}
          </label>
          <span className="text-[10px] text-zinc-500 font-medium">
            (прокрутите вниз для выбора)
          </span>
        </div>

        <div className="max-h-[148px] sm:max-h-[156px] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent rounded-xl">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {BACKGROUND_PRESETS.map((preset) => {
              const isSelected =
                state.bgType === 'preset' && state.bgPresetId === preset.id;
              const isBrightTheme =
                preset.id === 'clean-white' ||
                preset.id === 'notebook-grid' ||
                preset.id === 'notebook-flip';
              return (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => {
                    onChange({
                      bgType: 'preset',
                      bgPresetId: preset.id,
                    });
                  }}
                  className={`h-14 rounded-xl border relative overflow-hidden transition-all text-left p-2 flex flex-col justify-end cursor-pointer shadow-sm ${
                    isSelected
                      ? 'border-purple-400 ring-2 ring-purple-500/50 scale-[1.02]'
                      : 'border-white/15 hover:border-zinc-400 opacity-85 hover:opacity-100'
                  }`}
                  style={{
                    background:
                      preset.id === 'clean-white'
                        ? '#ffffff'
                        : preset.id === 'notebook-flip'
                        ? 'linear-gradient(90deg, #64748b 0%, #64748b 12%, #f8fafc 13%, #ffffff 100%)'
                        : preset.id === 'notebook-grid'
                        ? 'repeating-linear-gradient(0deg, #ffffff, #ffffff 11px, #bfdbfe 12px), repeating-linear-gradient(90deg, #ffffff, #ffffff 11px, #bfdbfe 12px)'
                        : preset.id === 'old-parchment'
                        ? 'linear-gradient(135deg, #e8d3a7, #c99b5b)'
                        : preset.id === 'flying-questions'
                        ? 'radial-gradient(circle at center, #1e1b4b 0%, #090a1a 100%)'
                        : preset.id === 'flying-exclamations'
                        ? 'linear-gradient(135deg, #450a0a, #7f1d1d)'
                        : preset.id === 'flying-kisses'
                        ? 'linear-gradient(135deg, #500724, #18020a)'
                        : preset.id === 'flying-currency'
                        ? 'linear-gradient(135deg, #022115, #064e3b)'
                        : preset.id === 'cosmic-dark' || preset.id === 'stary-sky'
                        ? 'radial-gradient(circle at center, #1e1b4b 0%, #030712 100%)'
                        : preset.id === 'flying-hearts'
                        ? 'linear-gradient(135deg, #881337, #e11d48)'
                        : preset.id === 'flying-balloons'
                        ? 'linear-gradient(135deg, #0f172a, #38bdf8)'
                        : `linear-gradient(135deg, ${preset.colors.join(', ')})`,
                  }}
                  title={preset.description}
                >
                  <span
                    className={`text-[10px] sm:text-[10.5px] font-bold leading-tight line-clamp-1 ${
                      isBrightTheme ? 'text-zinc-900 font-extrabold' : 'text-white drop-shadow'
                    }`}
                  >
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Background Dimming Slider */}
      <div className="pt-2 border-t border-white/10 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
            <Sliders className="w-3.5 h-3.5 text-purple-400" /> Затемнение фона
          </span>
          <span className="text-zinc-300 font-semibold">
            {Math.round(state.bgOverlayOpacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="0.85"
          step="0.05"
          value={state.bgOverlayOpacity}
          onChange={(e) =>
            onChange({ bgOverlayOpacity: parseFloat(e.target.value) })
          }
          className="w-full accent-purple-500 bg-zinc-800 h-2 rounded-lg cursor-pointer"
        />
        <p className="text-[11px] text-zinc-500">
          Затемните фон, чтобы белые буквы контрастно читались поверх видео
        </p>
      </div>
    </div>
  );
};
