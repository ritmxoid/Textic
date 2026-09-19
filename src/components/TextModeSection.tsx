import React from 'react';
import { Sparkle, FileText, MessageSquareQuote } from 'lucide-react';
import { TextMode, VideoProjectState } from '../types';

interface TextModeSectionProps {
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
}

const MODES: {
  id: TextMode;
  title: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'word',
    title: 'По одному слову',
    desc: 'Динамичное появление каждого слова по очереди (TikTok/Shorts стиль)',
    icon: <Sparkle className="w-5 h-5 text-purple-400" />,
  },
  {
    id: 'sentence',
    title: 'По предложениям',
    desc: 'Разбивка текста по знакам препинания (. ! ? \\n)',
    icon: <MessageSquareQuote className="w-5 h-5 text-violet-400" />,
  },
  {
    id: 'full',
    title: 'Весь текст целиком',
    desc: 'Полный текст выводится на экран сразу с выбранной анимацией',
    icon: <FileText className="w-5 h-5 text-indigo-400" />,
  },
];

export const TextModeSection: React.FC<TextModeSectionProps> = ({
  state,
  onChange,
}) => {
  return (
    <div className="bg-[#16161D] border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            5
          </span>
          Режим отображения текста
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MODES.map((mode) => {
          const isSelected = state.textMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => onChange({ textMode: mode.id })}
              className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-2 min-h-[90px] cursor-pointer ${
                isSelected
                  ? 'border-purple-400 bg-purple-500/15 ring-2 ring-purple-500/30 shadow-md scale-[1.01]'
                  : 'border-white/10 bg-[#0F0F12]/60 hover:bg-[#0F0F12] hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    isSelected ? 'bg-purple-500/30' : 'bg-zinc-800/80'
                  }`}
                >
                  {mode.icon}
                </div>
                <h3 className="text-sm font-bold text-white leading-tight">
                  {mode.title}
                </h3>
              </div>
              <p className="text-xs text-zinc-400 leading-snug">{mode.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
