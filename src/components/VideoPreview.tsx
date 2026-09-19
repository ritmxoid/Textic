import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Smartphone,
  Monitor,
  Square,
  Maximize2,
  Upload,
  Film,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Pin,
  PinOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { VideoProjectState } from '../types';
import {
  getDimensionsForAspect,
  renderCanvasFrame,
} from '../utils/canvasRenderer';
import { splitTextIntoSegments } from '../utils/textSplitter';
import { audioMixer } from '../utils/audioMixer';
import { FullscreenPlayer } from './FullscreenPlayer';

interface VideoPreviewProps {
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
  bgMediaElement: HTMLImageElement | HTMLVideoElement | null;
  onExportClick?: () => void;
  isExporting?: boolean;
  onFileUpload?: (file: File) => void;
  isMediaLoading?: boolean;
  uploadSuccess?: boolean;
  uploadError?: string | null;
  onDismissError?: () => void;
  onRetryUpload?: () => void;
  isFullscreenOpen?: boolean;
  onOpenFullscreen?: () => void;
  onCloseFullscreen?: () => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  state,
  onChange,
  bgMediaElement,
  onExportClick,
  isExporting,
  onFileUpload,
  isMediaLoading,
  uploadSuccess,
  uploadError,
  onDismissError,
  onRetryUpload,
  isFullscreenOpen,
  onOpenFullscreen,
  onCloseFullscreen,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Floating preview on mobile when scrolling down through options ribbon
  const [isFloatingEnabled, setIsFloatingEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('auto_float_preview') !== 'false';
    } catch {
      return true;
    }
  });
  const [isFloating, setIsFloating] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [placeholderHeight, setPlaceholderHeight] = useState<number>(540);

  const isFullscreenActive =
    isFullscreenOpen !== undefined ? isFullscreenOpen : isFullscreenModalOpen;

  const currentTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const isPlayingRef = useRef<boolean>(true);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Keep track of container natural height to prevent page layout jumps when entering floating mode
  useEffect(() => {
    if (!isFloating && containerRef.current) {
      const h = containerRef.current.offsetHeight;
      if (h > 100) {
        setPlaceholderHeight(h);
      }
    }
  }, [isFloating, state.aspectRatio]);

  // Scroll listener: activates floating mode on mobile/tablet when scrolling down past the top preview
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!isFloatingEnabled || window.innerWidth >= 1024) {
            if (isFloating) setIsFloating(false);
            ticking = false;
            return;
          }

          if (anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            // When preview reaches top of screen (past app header):
            const shouldFloat = rect.top <= 12;
            setIsFloating(shouldFloat);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isFloating, isFloatingEnabled]);

  const toggleFloatingEnabled = () => {
    const next = !isFloatingEnabled;
    setIsFloatingEnabled(next);
    try {
      localStorage.setItem('auto_float_preview', next ? 'true' : 'false');
    } catch {}
    if (!next) {
      setIsFloating(false);
    }
  };

  // Compute total duration
  const { totalDuration } = splitTextIntoSegments(
    state.rawText,
    state.textMode,
    state.speedMultiplier,
    state.pauseBetweenSeconds
  );

  // Sync background video element state & playback (only when fullscreen is NOT active)
  useEffect(() => {
    if (isFullscreenActive) return;
    if (bgMediaElement instanceof HTMLVideoElement) {
      bgMediaElement.muted = isMuted;
      if (isPlaying) {
        bgMediaElement.play().catch(() => {});
      } else {
        bgMediaElement.pause();
      }
    }
  }, [isPlaying, isMuted, bgMediaElement, isFullscreenActive]);

  // Sync audio mixer playback (only when fullscreen is NOT active)
  useEffect(() => {
    if (isFullscreenActive) return;
    if (isPlaying && !isMuted && state.audio.enabled && state.audio.sourceType !== 'none') {
      audioMixer.play(state.audio, totalDuration, currentTimeRef.current);
    } else {
      audioMixer.stop();
    }

    return () => {
      if (!isFullscreenActive) {
        audioMixer.stop();
      }
    };
  }, [
    isPlaying,
    isMuted,
    isFullscreenActive,
    state.audio.enabled,
    state.audio.sourceType,
    state.audio.presetId,
    state.audio.audioUrl,
    state.audio.volume,
    totalDuration,
  ]);

  // Main Render Loop
  const drawFrame = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dimensions = getDimensionsForAspect(state.aspectRatio);

      // Keep internal canvas resolution sharp
      if (canvas.width !== dimensions.width || canvas.height !== dimensions.height) {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
      }

      // Keep video background in sync without continuously triggering seek locks
      if (bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration) {
        if (!isPlayingRef.current) {
          const targetTime = time % bgMediaElement.duration;
          if (Math.abs(bgMediaElement.currentTime - targetTime) > 0.05) {
            bgMediaElement.currentTime = targetTime;
          }
        }
      }

      renderCanvasFrame({
        ctx,
        state,
        currentTime: time,
        bgMediaElement,
        dimensions,
      });
    },
    [state, bgMediaElement]
  );

  // Animation frame loop (halted while Fullscreen is open to prevent resource contention and video stutter)
  useEffect(() => {
    if (isFullscreenActive) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      if (isPlayingRef.current) {
        const delta = Math.min(0.1, (now - lastTimeRef.current) / 1000);
        lastTimeRef.current = now;

        let nextTime = currentTimeRef.current + delta;
        if (nextTime >= totalDuration) {
          // Loop back to start
          nextTime = 0;
          if (bgMediaElement instanceof HTMLVideoElement) {
            bgMediaElement.currentTime = 0;
            bgMediaElement.play().catch(() => {});
          }
          if (state.audio.enabled && state.audio.sourceType !== 'none') {
            audioMixer.play(state.audio, totalDuration, 0);
          }
        } else if (bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration) {
          // Continuous background video looping across multiple cycles during a single quote playback
          const vidDur = bgMediaElement.duration;
          const targetVidTime = vidDur > 0 ? (nextTime % vidDur) : 0;
          if (
            bgMediaElement.paused ||
            bgMediaElement.ended ||
            bgMediaElement.currentTime >= vidDur - 0.08 ||
            Math.abs(bgMediaElement.currentTime - targetVidTime) > 0.45
          ) {
            bgMediaElement.currentTime = targetVidTime;
            bgMediaElement.play().catch(() => {});
          }
        }
        currentTimeRef.current = nextTime;
        drawFrame(nextTime);
      } else {
        lastTimeRef.current = now;
        drawFrame(currentTimeRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isFullscreenActive, totalDuration, drawFrame, bgMediaElement, state.audio]);

  const openFullscreen = () => {
    setIsPlaying(false);
    if (onOpenFullscreen) {
      onOpenFullscreen();
    } else {
      setIsFullscreenModalOpen(true);
    }
  };

  const closeFullscreen = () => {
    if (onCloseFullscreen) {
      onCloseFullscreen();
    } else {
      setIsFullscreenModalOpen(false);
    }
  };

  const handleRestart = () => {
    currentTimeRef.current = 0;
    lastTimeRef.current = performance.now();
    if (bgMediaElement instanceof HTMLVideoElement) {
      bgMediaElement.currentTime = 0;
    }
    if (isPlaying && state.audio.enabled && state.audio.sourceType !== 'none') {
      audioMixer.play(state.audio, totalDuration, 0);
    }
    drawFrame(0);
  };

  return (
    <>
      <div ref={anchorRef} className="w-full relative">
        {/* Invisible layout placeholder that retains exact height during floating to eliminate jumping */}
        {isFloating && (
          <div
            style={{ height: `${placeholderHeight}px` }}
            className="w-full shrink-0"
            aria-hidden="true"
          />
        )}

        <div
          ref={containerRef}
          className={`w-full transition-all duration-200 ${
            isFloating
              ? 'fixed top-0 left-0 right-0 z-30 bg-[#16161D]/98 backdrop-blur-xl border-b border-purple-500/30 shadow-2xl shadow-black/80 p-2.5 sm:p-3 flex flex-col items-center gap-2 max-w-full'
              : 'bg-[#16161D] border border-white/10 rounded-2xl p-3 sm:p-4 lg:p-4 shadow-xl shadow-black/40 flex flex-col items-center gap-3 lg:h-[calc(100vh-4.75rem)] lg:max-h-[calc(100vh-4.75rem)]'
          }`}
        >
          {/* Top Bar: Switchers and Floating Controls */}
          {isFloating ? (
            <div className="w-full max-w-md mx-auto flex items-center justify-between gap-1.5 px-0.5">
              {/* Left: Floating indicator + aspect ratio switcher */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-500/30 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Превью</span>
                </span>

                <div className="flex items-center gap-0.5 bg-[#0F0F12] border border-white/10 rounded-lg p-0.5">
                  <button
                    onClick={() => onChange({ aspectRatio: '9:16' })}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                      state.aspectRatio === '9:16'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="9:16 Reels"
                  >
                    9:16
                  </button>
                  <button
                    onClick={() => onChange({ aspectRatio: '16:9' })}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                      state.aspectRatio === '16:9'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="16:9 Горизонт"
                  >
                    16:9
                  </button>
                  <button
                    onClick={() => onChange({ aspectRatio: '1:1' })}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                      state.aspectRatio === '1:1'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="1:1 Квадрат"
                  >
                    1:1
                  </button>
                </div>
              </div>

              {/* Right: Minimize/Expand, Unpin */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                  title={isMinimized ? 'Развернуть превью' : 'Свернуть превью'}
                >
                  <span>{isMinimized ? 'Развернуть' : 'Свернуть'}</span>
                  {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={toggleFloatingEnabled}
                  className="p-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/10 transition-all cursor-pointer"
                  title="Открепить превью (вернуть обычную прокрутку)"
                >
                  <PinOff className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Normal Top Bar */
            <div className="w-full flex items-center justify-between gap-2">
              <div className="flex-1 flex items-center gap-1 bg-[#0F0F12] border border-white/10 rounded-xl p-1 w-full max-w-full justify-between sm:justify-center">
                <button
                  onClick={() => onChange({ aspectRatio: '9:16' })}
                  className={`flex-1 min-w-0 justify-center px-1.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                    state.aspectRatio === '9:16'
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Вертикальный 9:16 (Reels / Stories / Shorts / TikTok)"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">9:16<span className="hidden xs:inline"> Reels</span></span>
                </button>
                <button
                  onClick={() => onChange({ aspectRatio: '16:9' })}
                  className={`flex-1 min-w-0 justify-center px-1.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                    state.aspectRatio === '16:9'
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Горизонтальный 16:9 (YouTube / Desktop)"
                >
                  <Monitor className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">16:9<span className="hidden xs:inline"> Горизонт</span></span>
                </button>
                <button
                  onClick={() => onChange({ aspectRatio: '1:1' })}
                  className={`flex-1 min-w-0 justify-center px-1.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                    state.aspectRatio === '1:1'
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Квадрат 1:1 (Instagram Post)"
                >
                  <Square className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">1:1<span className="hidden xs:inline"> Квадрат</span></span>
                </button>
              </div>

              {/* Pin Toggle Button for Normal Mode on mobile */}
              <button
                onClick={toggleFloatingEnabled}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0 lg:hidden ${
                  isFloatingEnabled
                    ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                    : 'bg-white/5 text-zinc-400 hover:text-white border-white/10'
                }`}
                title={isFloatingEnabled ? 'Плавающее превью активно (будет закреплено при прокрутке)' : 'Включить плавающее превью при прокрутке'}
              >
                <Pin className={`w-3.5 h-3.5 ${isFloatingEnabled ? 'text-purple-400' : 'text-zinc-500'}`} />
              </button>
            </div>
          )}

          {/* Minimized Floating Bar Preview */}
          {isMinimized && isFloating ? (
            <div className="w-full max-w-md flex items-center justify-between px-3 py-1.5 bg-[#0B0B0E] border border-white/10 rounded-xl">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                </button>
                <button
                  onClick={handleRestart}
                  className="p-1.5 rounded-lg bg-white/10 text-zinc-300 hover:text-white cursor-pointer"
                  title="С начала"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold text-zinc-200">
                  {state.aspectRatio} • {currentTimeRef.current.toFixed(1)}s / {totalDuration.toFixed(1)}s
                </span>
              </div>
              <button
                onClick={() => setIsMinimized(false)}
                className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-semibold flex items-center gap-1 cursor-pointer border border-purple-500/40"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Развернуть</span>
              </button>
            </div>
          ) : null}

        {/* 1. Canvas Viewport Stage (MAIN PREVIEW AT TOP) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0] && onFileUpload) {
              onFileUpload(e.dataTransfer.files[0]);
            }
          }}
          style={{ display: isMinimized && isFloating ? 'none' : 'flex' }}
          className={`w-full justify-center items-center relative overflow-hidden rounded-xl bg-[#0B0B0E] border border-white/10 shadow-2xl transition-all duration-300 ${
            isFloating
              ? state.aspectRatio === '9:16'
                ? 'max-h-[64vh] min-h-[300px]'
                : state.aspectRatio === '16:9'
                ? 'max-h-[38vh] min-h-[180px]'
                : 'max-h-[52vh] min-h-[250px]'
              : 'min-h-[320px] max-h-[580px] lg:max-h-none lg:flex-1 lg:min-h-0'
          }`}
        >
          {/* Drag & Drop Feedback Overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-30 bg-purple-950/85 backdrop-blur-sm border-2 border-dashed border-purple-400 rounded-xl flex flex-col items-center justify-center gap-2.5 text-white pointer-events-none p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 border border-purple-400/50 flex items-center justify-center animate-bounce">
                <Upload className="w-6 h-6 text-purple-300" />
              </div>
              <p className="font-bold text-sm text-purple-100">
                Отпустите видео или фото сюда
              </p>
              <p className="text-xs text-purple-200/80">
                Оно моментально станет фоном вашей цитаты
              </p>
            </div>
          )}

          {/* Top-Left Active Media Indicator */}
          {state.bgType === 'video' && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-purple-500/30 text-[10px] font-bold text-purple-300 shadow-lg pointer-events-none">
              <Film className="w-3 h-3 text-purple-400" />
              <span>Видеофон активен</span>
            </div>
          )}

          {/* On-Screen Notification: Loading file */}
          {isMediaLoading && (
            <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all">
              <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[#161622]/95 border border-purple-500/50 shadow-2xl shadow-black text-white">
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin shrink-0" />
                <span className="text-sm font-semibold text-purple-100">
                  Идет загрузка вашего файла...
                </span>
              </div>
            </div>
          )}

          {/* On-Screen Notification: File upload success */}
          {uploadSuccess && (
            <div className="absolute top-4 inset-x-0 z-40 flex justify-center pointer-events-none transition-all">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 shadow-xl text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Файл успешно загружен!</span>
              </div>
            </div>
          )}

          {/* On-Screen Notification: Upload error */}
          {uploadError && (
            <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 transition-all">
              <div className="max-w-sm w-full p-4 rounded-2xl bg-[#1A1420] border border-rose-500/40 text-rose-100 shadow-2xl space-y-2.5 text-center">
                <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-white">Не удалось открыть файл</p>
                <p className="text-xs text-rose-200/85 leading-relaxed">{uploadError}</p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  {onRetryUpload && (
                    <button
                      onClick={onRetryUpload}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-purple-600/25"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Повторить</span>
                    </button>
                  )}
                  {onDismissError && (
                    <button
                      onClick={onDismissError}
                      className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Закрыть
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            className="relative transition-all duration-300 flex items-center justify-center p-1 sm:p-2 w-full h-full max-h-full max-w-full"
            style={{
              aspectRatio:
                state.aspectRatio === '9:16'
                  ? '9/16'
                  : state.aspectRatio === '16:9'
                  ? '16/9'
                  : '1/1',
            }}
          >
            <canvas
              ref={canvasRef}
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl border border-white/10"
              style={{
                aspectRatio:
                  state.aspectRatio === '9:16'
                    ? '9/16'
                    : state.aspectRatio === '16:9'
                    ? '16/9'
                    : '1/1',
              }}
            />

            {/* Quick Play Overlay on Click */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/25 text-white flex items-center justify-center transition-all duration-200 cursor-pointer ${
                isPlaying
                  ? 'opacity-0 hover:opacity-100'
                  : 'opacity-100 scale-105 shadow-xl'
              }`}
              title={isPlaying ? 'Пауза' : 'Воспроизведение'}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6 ml-0.5" />
              )}
            </button>
          </div>

          {/* Bottom-Left Controls: Play/Pause and Restart directly on video preview */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2.5 rounded-xl bg-black/75 hover:bg-black/95 text-zinc-300 hover:text-white border border-white/20 transition-all cursor-pointer shadow-lg hover:scale-105 active:scale-95 flex items-center justify-center"
              title={isPlaying ? 'Пауза' : 'Воспроизведение'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>

            <button
              onClick={handleRestart}
              className="p-2.5 rounded-xl bg-black/75 hover:bg-black/95 text-zinc-300 hover:text-white border border-white/20 transition-all cursor-pointer shadow-lg hover:scale-105 active:scale-95 flex items-center justify-center"
              title="Запустить снова (с начала)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Corner Fullscreen Button - ONLY ONE FULLSCREEN BUTTON */}
          <button
            onClick={openFullscreen}
            className="absolute bottom-3 right-3 p-2.5 rounded-xl bg-black/75 hover:bg-black/95 text-zinc-300 hover:text-white border border-white/20 transition-all cursor-pointer shadow-lg hover:scale-105 active:scale-95 z-10"
            title="Развернуть на весь экран"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

      {/* Fullscreen Player Modal */}
      <FullscreenPlayer
        isOpen={isFullscreenActive}
        onClose={closeFullscreen}
        state={state}
        onChange={onChange}
        bgMediaElement={bgMediaElement}
        onExport={onExportClick}
        isExporting={isExporting}
      />
    </>
  );
};

