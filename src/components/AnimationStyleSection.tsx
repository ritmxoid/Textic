import React from 'react';
import { Terminal, MoveUp, ZoomIn, Eye, Sparkles, Zap } from 'lucide-react';
import { AnimationStyle, VideoProjectState } from '../types';

interface AnimationStyleSectionProps {
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
}

const STYLES: {
  id: AnimationStyle;
  title: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'typewriter',
    title: 'Печатная машинка',
    desc: 'Посимвольный набор с мигающим курсором |',
    icon: <Terminal className="w-5 h-5 text-amber-400" />,
  },
  {
    id: 'words',
    title: 'По словам',
    desc: 'Слова появляются целиком одно за другим',
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
  },
  {
    id: 'fade',
    title: 'Плавное проявление',
    desc: 'Мягкое кинематографичное Fade In',
    icon: <Eye className="w-5 h-5 text-cyan-400" />,
  },
  {
    id: 'slide',
    title: 'Выезд снизу',
    desc: 'Плавное появление со смещением снизу вверх',
    icon: <MoveUp className="w-5 h-5 text-emerald-400" />,
  },
  {
    id: 'zoom',
    title: 'Увеличение',
    desc: 'Энергичный Zoom In из глубины экрана',
    icon: <ZoomIn className="w-5 h-5 text-rose-400" />,
  },
  {
    id: 'glitch',
    title: 'Помехи',
    desc: 'Электрический разряд, дрожание и сбой сигнала',
    icon: <Zap className="w-5 h-5 text-amber-300" />,
  },
];

export const AnimationStyleSection: React.FC<AnimationStyleSectionProps> = ({
  state,
  onChange,
}) => {
  return (
    <div className="bg-[#16161D] border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            6
          </span>
          Стиль анимации появления
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-h-[128px] sm:max-h-[132px] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent rounded-xl">
        {STYLES.map((style) => {
          const isSelected = state.animationStyle === style.id;
          return (
            <button
              key={style.id}
              onClick={() => onChange({ animationStyle: style.id })}
              className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-2 cursor-pointer ${
                isSelected
                  ? 'border-purple-400 bg-purple-500/15 ring-2 ring-purple-500/30 shadow-sm scale-[1.02]'
                  : 'border-white/10 bg-[#0F0F12]/60 hover:bg-[#0F0F12] hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`p-1.5 rounded-lg ${
                    isSelected ? 'bg-purple-500/30' : 'bg-zinc-800/80'
                  }`}
                >
                  {style.icon}
                </div>
                <h3 className="text-xs font-bold text-white leading-tight">
                  {style.title}
                </h3>
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">{style.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
