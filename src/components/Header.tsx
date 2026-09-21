import React, { useRef } from 'react';
import { Video, Upload, Film, X, RotateCcw, Check } from 'lucide-react';

interface HeaderProps {
  onFileUpload?: (file: File) => void;
  fileName?: string | null;
  onClearFile?: () => void;
  onResetProject?: () => void;
  isSaved?: boolean;
  onOpenUploadModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onFileUpload,
  fileName,
  onClearFile,
  onResetProject,
  isSaved = true,
  onOpenUploadModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadTrigger = () => {
    if (onOpenUploadModal) {
      onOpenUploadModal();
    } else if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  return (
    <header className="border-b border-white/10 bg-[#16161D]/95 backdrop-blur-md sticky top-0 z-40 px-2.5 sm:px-4 lg:px-8 py-2 sm:py-2.5 w-full overflow-x-clip">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-1.5 sm:gap-3 w-full min-w-0">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 flex items-center justify-center shadow-md shadow-purple-600/25 ring-1 ring-white/20 shrink-0">
            <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-base font-bold tracking-tight text-white flex items-center gap-1.5 truncate">
              <span className="truncate">Аниматор Текста</span>
              <span className="text-[9px] sm:text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25 hidden md:inline shrink-0">
                Reels & Stories
              </span>
            </h1>
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-zinc-400">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Автосохранение активно</span>
            </div>
          </div>
        </div>

        {/* Top Actions: Reset & File Upload */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onResetProject && (
            <button
              type="button"
              onClick={onResetProject}
              className="text-xs text-zinc-400 hover:text-zinc-200 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-white/10 hover:bg-white/5 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Сбросить проект к исходным настройкам"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Сбросить всё</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*,.mp4,.webm,.mov,.m4v,.mkv,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0] && onFileUpload) {
                onFileUpload(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />

          {fileName ? (
            <div className="flex items-center gap-1 sm:gap-1.5 bg-purple-500/15 border border-purple-500/30 rounded-xl px-2 sm:px-3 py-1 sm:py-1.5 text-xs text-purple-200 max-w-[150px] sm:max-w-[220px] min-w-0">
              <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-400 shrink-0" />
              <span className="truncate font-medium text-[11px] sm:text-xs">
                {fileName}
              </span>
              <button
                type="button"
                onClick={handleUploadTrigger}
                className="shrink-0 hover:text-white px-1 sm:px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] sm:text-[11px] font-semibold transition-colors cursor-pointer text-purple-300 ml-0.5"
                title="Выбрать другое видео или фото"
              >
                Заменить
              </button>
              {onClearFile && (
                <button
                  type="button"
                  onClick={onClearFile}
                  className="shrink-0 hover:text-rose-300 p-0.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer text-zinc-400"
                  title="Удалить файл"
                >
                  <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleUploadTrigger}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-600/25 flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0"
              title="Загрузить собственное фоновое видео или фото (до 35 МБ)"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Загрузить видео / фото</span>
              <span className="sm:hidden inline">Загрузить</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};




