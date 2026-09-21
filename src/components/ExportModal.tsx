import React from 'react';
import { Download, CheckCircle2, AlertCircle, X, Film, RotateCcw } from 'lucide-react';
import { ExportProgress } from '../utils/videoRecorder';

interface ExportModalProps {
  progress: ExportProgress;
  onClose: () => void;
  onRestart: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  progress,
  onClose,
  onRestart,
}) => {
  if (!progress.isExporting && !progress.downloadUrl && !progress.error) {
    return null;
  }

  const handleDownload = () => {
    if (!progress.downloadUrl && !progress.fileBlob) return;
    const filename = `animated-text-video-${Date.now()}.${progress.fileExtension || 'mp4'}`;
    const url = progress.fileBlob ? URL.createObjectURL(progress.fileBlob) : (progress.downloadUrl || '');
    if (!url) return;

    try {
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          if (progress.fileBlob) {
            URL.revokeObjectURL(url);
          }
        } catch {}
      }, 60000);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#16161D] border border-white/15 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-black/80 space-y-5 text-center relative animate-in fade-in zoom-in-95 duration-200">
        {!progress.isExporting && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Icon & Title */}
        <div className="flex flex-col items-center gap-2">
          {progress.isExporting ? (
            <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 animate-pulse">
              <Film className="w-7 h-7" />
            </div>
          ) : progress.error ? (
            <div className="w-14 h-14 rounded-2xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-7 h-7" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>
          )}

          <h3 className="text-lg font-bold text-white">
            {progress.isExporting
              ? 'Создание видео...'
              : progress.error
              ? 'Ошибка создания видео'
              : 'Видео готово!'}
          </h3>
          <p className="text-xs text-zinc-400">{progress.statusText}</p>
        </div>

        {/* Progress Bar while exporting */}
        {progress.isExporting && (
          <div className="space-y-2">
            <div className="w-full bg-[#0F0F12] h-3 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div
                className="bg-gradient-to-r from-purple-600 to-violet-400 h-full rounded-full transition-all duration-150"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-400 font-mono">
              <span>Запись кадров MediaRecorder</span>
              <span className="font-bold text-purple-300">
                {progress.progress}%
              </span>
            </div>
          </div>
        )}

        {/* Preview player if ready */}
        {progress.downloadUrl && (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0B0B0E] max-h-60 flex items-center justify-center">
              <video
                src={progress.downloadUrl}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-60 w-auto object-contain"
              />
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleDownload}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
              >
                <Download className="w-5 h-5" />
                <span>Скачать готовое видео (.{progress.fileExtension.toUpperCase()})</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onRestart();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" /> Закрыть и создать еще
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {progress.error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-300 text-left">
            <p className="font-bold">Подробности ошибки:</p>
            <p className="mt-1 font-mono">{progress.error}</p>
          </div>
        )}
      </div>
    </div>
  );
};
