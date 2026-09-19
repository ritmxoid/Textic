import React from 'react';
import { User, Trash2 } from 'lucide-react';
import { VideoProjectState } from '../types';

interface TextInputSectionProps {
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
}

export const TextInputSection: React.FC<TextInputSectionProps> = ({
  state,
  onChange,
}) => {
  const wordCount = state.rawText.trim()
    ? state.rawText.trim().split(/\s+/).length
    : 0;

  return (
    <div className="bg-[#16161D] border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            1
          </span>
          Текст для видео
        </h2>
        <span className="text-xs text-zinc-400 font-medium">
          {wordCount} слов • {state.rawText.length} симв.
        </span>
      </div>

      {/* Main Textarea with Clear Button in Top-Right Corner */}
      <div className="relative">
        <textarea
          rows={4}
          value={state.rawText}
          onChange={(e) => onChange({ rawText: e.target.value })}
          placeholder="Вставьте или напечатайте сюда любой текст или цитату..."
          className="w-full bg-[#0F0F12] border border-white/15 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-xl p-3.5 pr-11 text-sm text-zinc-100 placeholder-zinc-500 transition-all resize-y outline-none leading-relaxed"
        />

        {state.rawText && (
          <button
            type="button"
            onClick={() => onChange({ rawText: '' })}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer shadow-sm group"
            title="Очистить текст (Delete)"
          >
            <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>

      {/* Author Input Field */}
      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor="author-input"
            className="text-zinc-300 font-medium flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5 text-purple-400" />
            <span>Автор (необязательно)</span>
          </label>
          {state.authorText && (
            <button
              type="button"
              onClick={() => onChange({ authorText: '' })}
              className="text-[10px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Очистить
            </button>
          )}
        </div>
        <input
          id="author-input"
          type="text"
          value={state.authorText || ''}
          onChange={(e) => onChange({ authorText: e.target.value })}
          placeholder="Например: Джейсон Стэтхэм, Оскар Уайльд, Конфуций..."
          className="w-full bg-[#0F0F12] border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 transition-all outline-none"
        />
      </div>
    </div>
  );
};
