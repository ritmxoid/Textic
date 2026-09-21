import React, { useRef, useState, useEffect } from 'react';
import { User, Trash2, Check } from 'lucide-react';
import { VideoProjectState } from '../types';

export interface EditingFocusInfo {
  isEditing: boolean;
  cursorIndex: number;
  isAuthor?: boolean;
}

interface TextInputSectionProps {
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
  onEditingFocus?: (info: EditingFocusInfo | null) => void;
}

export const TextInputSection: React.FC<TextInputSectionProps> = ({
  state,
  onChange,
  onEditingFocus,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalTextareaRef = useRef<HTMLTextAreaElement>(null);

  const wordCount = state.rawText.trim()
    ? state.rawText.trim().split(/\s+/).length
    : 0;

  // When modal opens, auto-focus the textarea
  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        if (modalTextareaRef.current) {
          modalTextareaRef.current.focus();
          const len = modalTextareaRef.current.value.length;
          modalTextareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [isModalOpen]);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    onEditingFocus?.({
      isEditing: true,
      cursorIndex: state.rawText.length,
      isAuthor: false,
    });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    onEditingFocus?.(null);
  };

  const handleClearText = () => {
    onChange({ rawText: '' });
    onEditingFocus?.({
      isEditing: true,
      cursorIndex: 0,
      isAuthor: false,
    });
    if (modalTextareaRef.current) {
      modalTextareaRef.current.focus();
    }
  };

  return (
    <div
      id="text-input-section"
      className="bg-[#16161D] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg shadow-black/20 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center border border-purple-500/30">
            1
          </span>
          Текст для видео
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-medium">
            {wordCount} слов • {state.rawText.length} симв.
          </span>
        </div>
      </div>

      {/* Main Textarea - Tapping anywhere immediately opens the full unobstructed editor */}
      <div className="relative">
        <textarea
          rows={4}
          value={state.rawText}
          readOnly
          onClick={handleOpenModal}
          onFocus={handleOpenModal}
          placeholder="Нажмите сюда, чтобы ввести или отредактировать текст..."
          className="w-full bg-[#0F0F12] border border-white/15 hover:border-purple-500/50 focus:border-purple-500 rounded-xl p-3.5 pr-12 text-sm text-zinc-100 placeholder-zinc-500 transition-all resize-none outline-none leading-relaxed cursor-pointer"
        />

        {state.rawText ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ rawText: '' });
              onEditingFocus?.(null);
            }}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer shadow-sm group"
            title="Очистить текст"
          >
            <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
          </button>
        ) : null}
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
              onClick={() => {
                onChange({ authorText: '' });
                onEditingFocus?.(null);
              }}
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
          onClick={handleOpenModal}
          onFocus={handleOpenModal}
          readOnly
          placeholder="Например: Джейсон Стэтхэм, Оскар Уайльд, Конфуций..."
          className="w-full bg-[#0F0F12] border border-white/10 hover:border-purple-500/40 focus:border-purple-500 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 transition-all outline-none cursor-pointer"
        />
      </div>

      {/* Full Direct Unobstructed Mobile & Desktop Text Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex flex-col p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col bg-[#16161D] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header info */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#1A1A22]">
              <span className="text-xs font-semibold text-zinc-300">
                Текст цитаты или ролика
              </span>
              <span className="text-[11px] text-zinc-400 font-medium">
                {wordCount} слов • {state.rawText.length} симв.
              </span>
            </div>

            {/* Editor Textarea - Takes all available space */}
            <div className="flex-1 p-3.5 flex flex-col space-y-3 overflow-y-auto">
              <textarea
                ref={modalTextareaRef}
                value={state.rawText}
                onChange={(e) => {
                  onChange({ rawText: e.target.value });
                  onEditingFocus?.({
                    isEditing: true,
                    cursorIndex: e.target.selectionStart,
                    isAuthor: false,
                  });
                }}
                onSelect={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  onEditingFocus?.({
                    isEditing: true,
                    cursorIndex: el.selectionStart,
                    isAuthor: false,
                  });
                }}
                onClick={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  onEditingFocus?.({
                    isEditing: true,
                    cursorIndex: el.selectionStart,
                    isAuthor: false,
                  });
                }}
                onKeyUp={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  onEditingFocus?.({
                    isEditing: true,
                    cursorIndex: el.selectionStart,
                    isAuthor: false,
                  });
                }}
                placeholder="Вставьте или напечатайте текст сюда..."
                className="w-full flex-1 min-h-[140px] bg-[#0F0F12] border border-white/15 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 rounded-xl p-3.5 text-base text-zinc-100 placeholder-zinc-500 outline-none leading-relaxed resize-none"
              />

              {/* Author Field inside modal */}
              <div className="flex items-center gap-2 bg-[#0F0F12] border border-white/10 rounded-xl px-3 py-2">
                <User className="w-4 h-4 text-purple-400 shrink-0" />
                <input
                  type="text"
                  value={state.authorText || ''}
                  onChange={(e) => {
                    onChange({ authorText: e.target.value });
                    onEditingFocus?.({
                      isEditing: true,
                      cursorIndex: 0,
                      isAuthor: true,
                    });
                  }}
                  placeholder="Автор (необязательно)..."
                  className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 outline-none"
                />
              </div>
            </div>

            {/* Bottom Actions Bar - ONLY TWO BUTTONS: 1 RED TRASH + 1 GREEN CHECKMARK */}
            <div className="px-4 py-3 border-t border-white/10 bg-[#1A1A22] flex items-center justify-between gap-3">
              {/* Red Delete Button */}
              <button
                type="button"
                onClick={handleClearText}
                className="flex items-center justify-center p-3 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer active:scale-95 shadow-md"
                title="Очистить текст"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              {/* Green Confirm / Done Button */}
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all cursor-pointer active:scale-98"
                title="Сохранить и закрыть"
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
                <span>Готово</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
