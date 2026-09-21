import React from 'react';
import { Gauge, Clock } from 'lucide-react';
import { VideoProjectState } from '../types';

interface SpeedSectionProps {
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
}

export const SpeedSection: React.FC<SpeedSectionProps> = ({
  state,
  onChange,
}) => {
  return (
    <div className="bg-[#16161D] border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            8
          </span>
          Настройки тайминга и скорости
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Speed Multiplier Slider */}
        <div className="space-y-2 bg-[#0F0F12]/80 border border-white/10 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-purple-400" /> Скорость анимации:
            </span>
            <span className="text-purple-300 font-mono font-bold bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
              {state.speedMultiplier.toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={state.speedMultiplier}
            onChange={(e) =>
              onChange({ speedMultiplier: parseFloat(e.target.value) })
            }
            className="w-full accent-purple-500 bg-zinc-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>0.1x (0.5 сек)</span>
            <span>Стандарт (1.0x)</span>
            <span>3.0x (2x быстрее)</span>
          </div>
        </div>

        {/* Pause Between Phrases Slider */}
        <div className="space-y-2 bg-[#0F0F12]/80 border border-white/10 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-violet-400" /> Пауза между фразами:
            </span>
            <span className="text-violet-300 font-mono font-bold bg-violet-500/20 px-2 py-0.5 rounded border border-violet-500/30">
              {state.pauseBetweenSeconds.toFixed(1)} сек
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.5"
            step="0.1"
            value={state.pauseBetweenSeconds}
            onChange={(e) =>
              onChange({ pauseBetweenSeconds: parseFloat(e.target.value) })
            }
            className="w-full accent-purple-500 bg-zinc-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>Минимум (0.2с)</span>
            <span>Комфорт (0.8с)</span>
            <span>Долгая (2.5с)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
