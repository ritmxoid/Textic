import React, { useRef, useState } from 'react';
import {
  Upload,
  AlertTriangle,
  Film,
  Image as ImageIcon,
  X,
  CheckCircle2,
  HardDrive,
  Info,
} from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (file: File) => void;
  currentFileName?: string | null;
}

const MAX_RECOMMENDED_MB = 35;
const MAX_RECOMMENDED_BYTES = MAX_RECOMMENDED_MB * 1024 * 1024;

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onFileUpload,
  currentFileName,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedOversizeFile, setSelectedOversizeFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleSelectClick = () => {
    setSelectedOversizeFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo =
      file.type.startsWith('video/') ||
      /\.(mp4|webm|mov|m4v|mkv|avi|3gp)$/i.test(file.name);

    // If it is a video and exceeds 35 MB, show prompt to either proceed or pick another
    if (isVideo && file.size > MAX_RECOMMENDED_BYTES) {
      setSelectedOversizeFile(file);
    } else {
      onFileUpload(file);
      onClose();
    }
  };

  const handleConfirmOversize = () => {
    if (selectedOversizeFile) {
      onFileUpload(selectedOversizeFile);
      setSelectedOversizeFile(null);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[#16161D] border border-white/15 rounded-2xl w-full max-w-md p-5 shadow-2xl shadow-purple-950/40 text-zinc-100 relative space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*,.mp4,.webm,.mov,.m4v,.mkv,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Загрузка видео или фото
              </h3>
              <p className="text-[11px] text-zinc-400">
                Пользовательский фон для ролика с цитатой
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Oversize warning state or standard reminder */}
        {selectedOversizeFile ? (
          <div className="space-y-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-300">
                  Внимание: размер файла больше 35 МБ
                </h4>
                <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">
                  Выбран файл <strong className="text-white">{selectedOversizeFile.name}</strong> весом{' '}
                  <strong className="text-amber-300">
                    {(selectedOversizeFile.size / (1024 * 1024)).toFixed(1)} МБ
                  </strong>
                  .
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  На некоторых мобильных устройствах большие видео могут работать медленнее или требовать больше памяти браузера.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmOversize}
                className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                Всё равно загрузить
              </button>
              <button
                type="button"
                onClick={handleSelectClick}
                className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-white/10 transition-all cursor-pointer"
              >
                Выбрать другой
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Prominent 35 MB Limit Reminder Banner */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/40 via-purple-900/20 to-indigo-950/30 border border-purple-500/40 space-y-1.5">
              <div className="flex items-center gap-2 text-purple-300 text-xs font-bold">
                <Info className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Напоминание по размеру файла:</span>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed">
                Рекомендуемый размер видео — <strong className="text-white bg-purple-500/30 px-1.5 py-0.5 rounded border border-purple-400/40">не более 35 МБ</strong>.
              </p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Это обеспечивает максимальную плавность воспроизведения, стабильный захват ролика и сохранение в памяти без перезагрузки вкладки.
              </p>
            </div>

            {/* Quick Specs */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                <div className="text-zinc-400 flex items-center gap-1.5 font-medium">
                  <Film className="w-3.5 h-3.5 text-purple-400" />
                  <span>Форматы видео:</span>
                </div>
                <div className="text-zinc-200 font-semibold">
                  MP4, WebM, MOV
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                <div className="text-zinc-400 flex items-center gap-1.5 font-medium">
                  <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                  <span>Форматы фото:</span>
                </div>
                <div className="text-zinc-200 font-semibold">
                  JPG, PNG, WEBP
                </div>
              </div>
            </div>

            {currentFileName && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-black/20 border border-white/5 text-[11px] text-zinc-400">
                <HardDrive className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">Текущий фон: {currentFileName}</span>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        {!selectedOversizeFile && (
          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={handleSelectClick}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer hover:scale-[1.01] active:scale-98"
            >
              <Upload className="w-4 h-4" />
              <span>Выбрать файл (до 35 МБ)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-semibold text-xs border border-white/10 transition-colors cursor-pointer"
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
