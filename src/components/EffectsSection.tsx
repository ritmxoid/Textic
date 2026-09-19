import React from 'react';
import { Flame, Sparkles, SunMedium, Zap, BoxSelect } from 'lucide-react';
import { ExtraEffects, VideoProjectState } from '../types';

interface EffectsSectionProps {
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
}

const EFFECTS_CONFIG: {
  key: keyof ExtraEffects;
  title: string;
  desc: string;
  icon: React.ReactNode;
  activeColor: string;
}[] = [
  {
    key: 'glow',
    title: 'Мерцание (Glow)',
    desc: 'Текст плавно пульсирует яркостью',
    icon: <SunMedium className="w-4 h-4 text-amber-300" />,
    activeColor: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
  },
  {
    key: 'sparkle',
    title: 'Искрение (Sparkle)',
    desc: 'Звёздные частицы кружатся вокруг текста на canvas',
    icon: <Sparkles className="w-4 h-4 text-yellow-300" />,
    activeColor: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-200',
  },
  {
    key: 'fire',
    title: 'Горение (Fire)',
    desc: 'Огненные искры и пламя поднимаются из-под букв',
    icon: <Flame className="w-4 h-4 text-orange-400" />,
    activeColor: 'border-orange-500/50 bg-orange-500/10 text-orange-200',
  },
  {
    key: 'neon',
    title: 'Неон (Neon)',
    desc: 'Яркое неоновое цветное свечение вокруг текста',
    icon: <Zap className="w-4 h-4 text-purple-400" />,
    activeColor: 'border-purple-500/50 bg-purple-500/10 text-purple-200',
  },
  {
    key: 'shadow',
    title: 'Тень (Shadow)',
    desc: 'Глубокая кинематографичная 3D тень',
    icon: <BoxSelect className="w-4 h-4 text-indigo-300" />,
    activeColor: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200',
  },
];

export const EffectsSection: React.FC<EffectsSectionProps> = ({
  state,
  onChange,
}) => {
  const toggleEffect = (key: keyof ExtraEffects) => {
    onChange({
      effects: {
        ...state.effects,
        [key]: !state.effects[key],
      },
    });
  };

  return (
    <div className="bg-[#16161D] border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            7
          </span>
          Дополнительные спецэффекты
        </h2>
        <span className="text-xs text-zinc-400">Можно выбрать несколько</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {EFFECTS_CONFIG.map((eff) => {
          const isChecked = state.effects[eff.key];
          return (
            <div
              key={eff.key}
              onClick={() => toggleEffect(eff.key)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 select-none ${
                isChecked
                  ? `${eff.activeColor} ring-1 ring-white/20 shadow-md`
                  : 'border-white/10 bg-[#0F0F12]/60 hover:bg-[#0F0F12] hover:border-zinc-600 text-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-white/5">
                    {eff.icon}
                  </div>
                  <h3 className="text-xs font-bold leading-tight">
                    {eff.title}
                  </h3>
                </div>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}} // handled by parent onClick
                  className="w-4 h-4 rounded accent-purple-500 bg-zinc-800 border-zinc-700 cursor-pointer pointer-events-none"
                />
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">{eff.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Neon Color picker if Neon is enabled */}
      {state.effects.neon && (
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
          <span className="text-purple-300 flex items-center gap-1.5 font-medium">
            <Zap className="w-3.5 h-3.5" /> Цвет неонового свечения:
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={state.neonColor}
              onChange={(e) => onChange({ neonColor: e.target.value })}
              className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer"
            />
            <span className="text-xs font-mono text-zinc-300 uppercase">
              {state.neonColor}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
