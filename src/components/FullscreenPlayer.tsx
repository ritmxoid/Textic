import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  EyeOff,
  Video,
  Download,
  Smartphone,
  Monitor,
  Square,
  AlertCircle,
  ArrowLeft,
  Volume2,
  VolumeX,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { VideoProjectState } from '../types';
import { getDimensionsForAspect, renderCanvasFrame } from '../utils/canvasRenderer';
import { splitTextIntoSegments } from '../utils/textSplitter';
import { audioMixer } from '../utils/audioMixer';

interface FullscreenPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  state: VideoProjectState;
  onChange: (patch: Partial<VideoProjectState>) => void;
  bgMediaElement: HTMLImageElement | HTMLVideoElement | null;
  onExport?: () => void;
  isExporting?: boolean;
}

export const FullscreenPlayer: React.FC<FullscreenPlayerProps> = ({
  isOpen,
  onClose,
  state,
  onChange,
  bgMediaElement,
  onExport,
  isExporting = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [hideControls, setHideControls] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isRecordingScreen, setIsRecordingScreen] = useState<boolean>(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedVideoExt, setRecordedVideoExt] = useState<string>('webm');
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [recordingSuccessMsg, setRecordingSuccessMsg] = useState<string | null>(null);
  const [recordingProgressSec, setRecordingProgressSec] = useState<number>(0);

  // Capture mode: 'none' (manual stop), 'txt' (auto-stop after 1 text cycle), 'vid' (auto-stop after 1 video cycle)
  // Default is 'txt' as requested by user ("кнопка фикс текст же по умолчанию должна быть активна!")
  const [fixMode, setFixMode] = useState<'none' | 'txt' | 'vid'>(() => {
    try {
      const saved = localStorage.getItem('animator_fix_capture_mode');
      if (saved === 'txt' || saved === 'vid' || saved === 'none') return saved;
    } catch {}
    return 'txt';
  });

  // Export format selection (MP4, WEBM, AVI, MOV)
  const [exportFormat, setExportFormat] = useState<'mp4' | 'webm' | 'mov' | 'avi'>(() => {
    try {
      const saved = localStorage.getItem('animator_export_format');
      if (saved === 'mp4' || saved === 'webm' || saved === 'mov' || saved === 'avi') return saved;
    } catch {}
    return 'mp4';
  });

  const [videoDuration, setVideoDuration] = useState<number>(0);

  const currentTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const isPlayingRef = useRef<boolean>(true);
  const isRecordingRef = useRef<boolean>(false);
  const recordingElapsedRef = useRef<number>(0);
  const lastProgressUpdateRef = useRef<number>(0);
  const fixModeRef = useRef<'none' | 'txt' | 'vid'>(fixMode);

  // Save and sync fixMode
  const handleSetFixMode = (mode: 'none' | 'txt' | 'vid') => {
    setFixMode(mode);
    fixModeRef.current = mode;
    setRecordedVideoUrl(null);
    try {
      localStorage.setItem('animator_fix_capture_mode', mode);
    } catch {}
  };

  useEffect(() => {
    fixModeRef.current = fixMode;
  }, [fixMode]);

  useEffect(() => {
    isRecordingRef.current = isRecordingScreen;
  }, [isRecordingScreen]);

  // Keep track of background video duration
  useEffect(() => {
    if (bgMediaElement instanceof HTMLVideoElement) {
      if (bgMediaElement.duration && !isNaN(bgMediaElement.duration) && isFinite(bgMediaElement.duration)) {
        setVideoDuration(bgMediaElement.duration);
      }
      const handleMeta = () => {
        if (bgMediaElement.duration && !isNaN(bgMediaElement.duration) && isFinite(bgMediaElement.duration)) {
          setVideoDuration(bgMediaElement.duration);
        }
      };
      bgMediaElement.addEventListener('loadedmetadata', handleMeta);
      bgMediaElement.addEventListener('durationchange', handleMeta);
      return () => {
        bgMediaElement.removeEventListener('loadedmetadata', handleMeta);
        bgMediaElement.removeEventListener('durationchange', handleMeta);
      };
    } else {
      setVideoDuration(0);
    }
  }, [bgMediaElement]);

  const hasVideoBg =
    bgMediaElement instanceof HTMLVideoElement &&
    !!videoDuration &&
    videoDuration > 0 &&
    isFinite(videoDuration);

  // Keep isPlayingRef in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Auto-dismiss success notification
  useEffect(() => {
    if (recordingSuccessMsg) {
      const timer = setTimeout(() => setRecordingSuccessMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [recordingSuccessMsg]);

  // Escape key handler to exit clean screen or return to editor
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (hideControls) {
          setHideControls(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hideControls, onClose]);

  const { totalDuration } = splitTextIntoSegments(
    state.rawText,
    state.textMode,
    state.speedMultiplier,
    state.pauseBetweenSeconds
  );

  // Sync background video element playback
  useEffect(() => {
    if (!isOpen) return;
    if (bgMediaElement instanceof HTMLVideoElement) {
      bgMediaElement.muted = isMuted;
      if (isPlaying) {
        bgMediaElement.play().catch(() => {});
      } else {
        bgMediaElement.pause();
      }
    }
  }, [isOpen, isPlaying, isMuted, bgMediaElement]);

  // Sync audio mixer playback
  useEffect(() => {
    if (!isOpen) {
      audioMixer.stop();
      return;
    }

    if (isPlaying && !isMuted && state.audio.enabled && state.audio.sourceType !== 'none') {
      audioMixer.play(state.audio, totalDuration, currentTimeRef.current);
    } else {
      audioMixer.stop();
    }

    return () => {
      audioMixer.stop();
    };
  }, [
    isOpen,
    isPlaying,
    isMuted,
    state.audio.enabled,
    state.audio.sourceType,
    state.audio.presetId,
    state.audio.audioUrl,
    state.audio.volume,
    totalDuration,
  ]);

  // Canvas drawing callback (receives synchronous exact time)
  const drawFrame = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dimensions = getDimensionsForAspect(state.aspectRatio);
      if (canvas.width !== dimensions.width || canvas.height !== dimensions.height) {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
      }

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

  // Stop live recording cleanly
  const stopLiveScreenRecord = useCallback(() => {
    audioMixer.setRecordingDestination(null);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error stopping media recorder:', err);
      }
    }
    setIsRecordingScreen(false);
    isRecordingRef.current = false;
    setHideControls(false);

    if (fixModeRef.current === 'txt') {
      const targetDuration = Math.max(1.5, totalDuration);
      setRecordingSuccessMsg(`Запись завершена: снят 1 цикл текста (${targetDuration.toFixed(1)}с)`);
    } else if (fixModeRef.current === 'vid') {
      const vidDur =
        bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration
          ? bgMediaElement.duration
          : Math.max(1.5, totalDuration);
      setRecordingSuccessMsg(`Запись завершена: снят 1 цикл видео фона (${vidDur.toFixed(1)}с)`);
    } else {
      setRecordingSuccessMsg('Запись холста завершена');
    }
  }, [totalDuration, bgMediaElement]);

  // Rock-solid Animation Loop using currentTimeRef (no React state lag, no dropped frames)
  useEffect(() => {
    if (!isOpen) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    currentTimeRef.current = 0;
    lastTimeRef.current = performance.now();

    if (bgMediaElement instanceof HTMLVideoElement) {
      bgMediaElement.muted = isMuted;
      bgMediaElement.loop = true;
      bgMediaElement.currentTime = 0;
      bgMediaElement.play().catch(() => {});
    }
    if (state.audio.enabled && state.audio.sourceType !== 'none') {
      audioMixer.play(state.audio, totalDuration, 0);
    }

    const loop = (now: number) => {
      if (isPlayingRef.current) {
        const delta = Math.min(0.1, (now - lastTimeRef.current) / 1000);
        lastTimeRef.current = now;

        const isRecording = isRecordingRef.current;
        const currentFixMode = fixModeRef.current;

        // Auto-stop handler for Fix Txt / Fix Vid screen recording
        if (isRecording) {
          recordingElapsedRef.current += delta;
          const elapsed = recordingElapsedRef.current;

          // Throttle progress state updates to ~100ms
          if (now - lastProgressUpdateRef.current > 100) {
            lastProgressUpdateRef.current = now;
            setRecordingProgressSec(elapsed);
          }

          if (currentFixMode === 'txt') {
            const targetDuration = Math.max(1.5, totalDuration);
            if (elapsed >= targetDuration) {
              currentTimeRef.current = targetDuration;
              drawFrame(targetDuration);
              stopLiveScreenRecord();
              setIsPlaying(false);
              isPlayingRef.current = false;
              if (bgMediaElement instanceof HTMLVideoElement) {
                bgMediaElement.pause();
              }
              audioMixer.stop();
              return;
            } else {
              currentTimeRef.current = elapsed;
              drawFrame(elapsed);
            }
          } else if (currentFixMode === 'vid') {
            const vidDur =
              bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration
                ? bgMediaElement.duration
                : Math.max(1.5, totalDuration);
            if (elapsed >= vidDur) {
              const textTime = totalDuration > 0 ? elapsed % totalDuration : 0;
              currentTimeRef.current = textTime;
              drawFrame(textTime);
              stopLiveScreenRecord();
              setIsPlaying(false);
              isPlayingRef.current = false;
              if (bgMediaElement instanceof HTMLVideoElement) {
                bgMediaElement.pause();
              }
              audioMixer.stop();
              return;
            } else {
              const textTime = totalDuration > 0 ? elapsed % totalDuration : 0;
              currentTimeRef.current = textTime;
              drawFrame(textTime);
            }
          } else {
            let nextTime = currentTimeRef.current + delta;
            if (nextTime >= totalDuration) {
              nextTime = 0;
            }
            currentTimeRef.current = nextTime;
            drawFrame(nextTime);
          }
        } else {
          // Standard playback (not recording)
          let nextTime = currentTimeRef.current + delta;
          if (nextTime >= totalDuration) {
            nextTime = 0;
          }
          currentTimeRef.current = nextTime;
          drawFrame(nextTime);
        }

        // Handle background video element playback & smooth loop without stutter or freeze
        if (bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration) {
          if (bgMediaElement.ended) {
            bgMediaElement.currentTime = 0;
            bgMediaElement.play().catch(() => {});
          } else if (bgMediaElement.paused && isPlayingRef.current) {
            bgMediaElement.play().catch(() => {});
          }
        }
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
  }, [isOpen, totalDuration, drawFrame, bgMediaElement, state.audio, stopLiveScreenRecord]);

  // Ensure recorder stops if modal closes
  useEffect(() => {
    if (!isOpen) {
      audioMixer.setRecordingDestination(null);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      setIsRecordingScreen(false);
      isRecordingRef.current = false;
      setRecordingNotice(null);
      setRecordingSuccessMsg(null);
    }
  }, [isOpen]);

  // Direct Live Screen Capture from Canvas at stable 30 FPS
  const toggleLiveScreenRecord = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isRecordingScreen) {
      stopLiveScreenRecord();
      return;
    }

    setRecordingNotice(null);
    setRecordingSuccessMsg(null);
    setRecordedVideoUrl(null);
    recordingElapsedRef.current = 0;
    setRecordingProgressSec(0);

    // Fallback if Fix Vid selected without a valid video
    if (fixModeRef.current === 'vid' && !hasVideoBg) {
      handleSetFixMode('txt');
      fixModeRef.current = 'txt';
    }

    // Pre-flight check: ensure canvas.captureStream exists
    if (typeof canvas.captureStream !== 'function') {
      setRecordingNotice(
        'Функция захвата не поддерживается данным браузером. Нажмите кнопку «Экспорт в MP4» для сохранения видеофайла.'
      );
      return;
    }

    // Pre-flight check: ensure canvas is origin-clean before invoking captureStream
    try {
      const testCtx = canvas.getContext('2d');
      if (testCtx) {
        testCtx.getImageData(0, 0, 1, 1);
      }
    } catch {
      setRecordingNotice(
        'Браузер ограничил прямой захват холста для этого видеофайла. Воспользуйтесь кнопкой «Создать MP4 видео» ниже:'
      );
      return;
    }

    let canvasStream: MediaStream;
    try {
      // 30 FPS ensures rock-solid hardware encoding stability, smooth frame delivery, and zero dropped frames
      canvasStream = canvas.captureStream(30);
    } catch (captureErr) {
      console.warn('Live screen capture unavailable on canvas:', captureErr);
      setRecordingNotice(
        'Браузер отклонил захват видеопотока с холста. Нажмите «Создать MP4 видео» ниже для экспорта:'
      );
      return;
    }

    // Build combined stream containing canvas video and synchronized audio tracks (if any)
    const combinedStream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

    // Audio mixing and track attachment ONLY if music/audio is explicitly enabled
    if (state.audio.enabled && state.audio.sourceType !== 'none') {
      try {
        const audioCtx = audioMixer.getAudioContext();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        // Pre-warm audio buffer so it is instantly ready when recorder starts
        await audioMixer.prepareAudioBuffer(state.audio, totalDuration);
        const audioDest = audioCtx.createMediaStreamDestination();
        audioMixer.setRecordingDestination(audioDest);

        const audioTracks = audioDest.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          combinedStream.addTrack(audioTracks[0]);
        }
      } catch (audioSetupErr) {
        console.warn('Audio mixing for live capture encountered an issue, recording video only:', audioSetupErr);
      }
    }

    try {
      // Ensure background video element is muted and playing seamlessly (never unmute to prevent autoplay pause)
      if (bgMediaElement instanceof HTMLVideoElement) {
        bgMediaElement.muted = true;
        bgMediaElement.currentTime = 0;
        try {
          await bgMediaElement.play();
        } catch {}
      }

      // Restart playback from beginning
      currentTimeRef.current = 0;
      lastTimeRef.current = performance.now();
      setIsPlaying(true);
      isPlayingRef.current = true;
      if (state.audio.enabled && state.audio.sourceType !== 'none') {
        audioMixer.play(state.audio, totalDuration, 0);
      }

      recordedChunksRef.current = [];

      const hasAudioTrack = combinedStream.getAudioTracks().length > 0;
      let mimeType = 'video/webm;codecs=vp9,opus';
      let fileExt = exportFormat; // User preferred format

      if (hasAudioTrack) {
        if (exportFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
          mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
        } else if (exportFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,opus')) {
          mimeType = 'video/mp4;codecs=avc1,opus';
        } else if (exportFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          mimeType = 'video/webm;codecs=vp9,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
          mimeType = 'video/webm;codecs=vp8,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        }
      } else {
        if (exportFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
          mimeType = 'video/mp4;codecs=avc1';
        } else if (exportFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        }
      }

      setRecordedVideoExt(exportFormat);

      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      };
      if (hasAudioTrack) {
        recorderOptions.audioBitsPerSecond = 192_000;
      }

      const recorder = new MediaRecorder(combinedStream, recorderOptions);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
      };

      recorder.onerror = (e) => {
        console.warn('MediaRecorder error during capture:', e);
        setIsRecordingScreen(false);
        isRecordingRef.current = false;
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecordingScreen(true);
      isRecordingRef.current = true;
      setHideControls(true); // Automatically hide all UI for 100% clean capture
    } catch (e) {
      console.warn('Failed to start live screen capture:', e);
      setIsRecordingScreen(false);
      isRecordingRef.current = false;
      setRecordingNotice('Не удалось начать запись экрана.');
    }
  };

  // Lock body scroll while fullscreen player is active
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999999] w-screen h-screen bg-black flex flex-col items-center justify-center select-none overflow-hidden"
    >
      {/* Active Recording Floating Status Pill (with seconds timer and direct stop) */}
      {isRecordingScreen && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-black/90 backdrop-blur-md border border-rose-500/50 px-3.5 py-1.5 rounded-full shadow-2xl animate-fade-in">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
          <span className="text-white text-xs font-semibold select-none">
            {fixMode === 'txt'
              ? `Запись Fix Txt: ${recordingProgressSec.toFixed(1)} / ${totalDuration.toFixed(1)}с`
              : fixMode === 'vid'
              ? `Запись Fix Vid: ${recordingProgressSec.toFixed(1)} / ${videoDuration.toFixed(1)}с`
              : `Запись холста: ${recordingProgressSec.toFixed(1)}с`}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              stopLiveScreenRecord();
            }}
            className="px-2.5 py-0.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer transition-colors shadow-sm active:scale-95"
            title="Остановить запись сейчас"
          >
            ⏹ Стоп
          </button>
        </div>
      )}

      {/* Recording Finished Success Notification Banner */}
      {recordingSuccessMsg && !isRecordingScreen && (
        <div className="absolute top-12 sm:top-14 left-1/2 -translate-x-1/2 max-w-sm w-11/12 bg-zinc-900/90 border border-emerald-500/50 text-emerald-200 px-3 py-1.5 rounded-xl text-xs z-50 shadow-2xl backdrop-blur-md flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-100 truncate text-[11px] sm:text-xs">
              {recordingSuccessMsg}
            </span>
          </div>
          <button
            onClick={() => setRecordingSuccessMsg(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-emerald-400 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Floating Control Bar */}
      <div
        className={`absolute top-0 inset-x-0 p-2 sm:p-3 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-2 z-30 transition-all duration-300 pointer-events-none ${
          hideControls ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Left: Always-visible Back to Editor button */}
        <button
          onClick={onClose}
          className="pointer-events-auto shrink-0 h-8 px-2.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1.5 border border-white/15 shadow-lg cursor-pointer transition-all active:scale-95"
          title="Вернуться в редактор"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-purple-400" />
          <span>Назад</span>
        </button>

        {/* Center: Aspect Ratio & Format Selector */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Aspect Ratio Selector */}
          <div className="flex items-center gap-0.5 bg-black/80 backdrop-blur-md border border-white/15 rounded-xl p-0.5 shadow-lg shrink-0">
            <button
              onClick={() => onChange({ aspectRatio: '9:16' })}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                state.aspectRatio === '9:16' ? 'bg-purple-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3 h-3" /> 9:16
            </button>
            <button
              onClick={() => onChange({ aspectRatio: '16:9' })}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                state.aspectRatio === '16:9' ? 'bg-purple-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3 h-3" /> 16:9
            </button>
            <button
              onClick={() => onChange({ aspectRatio: '1:1' })}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                state.aspectRatio === '1:1' ? 'bg-purple-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Square className="w-3 h-3" /> 1:1
            </button>
          </div>

          {/* Export Video Format Selector (MP4, WEBM, MOV, AVI) */}
          <div className="flex items-center gap-0.5 bg-black/80 backdrop-blur-md border border-white/15 rounded-xl p-0.5 shadow-lg shrink-0">
            {(['mp4', 'webm', 'mov', 'avi'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => {
                  setExportFormat(fmt);
                  try {
                    localStorage.setItem('animator_export_format', fmt);
                  } catch {}
                }}
                className={`px-1.5 sm:px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase transition-all cursor-pointer ${
                  exportFormat === fmt
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={`Формат видео: ${fmt.toUpperCase()}`}
              >
                .{fmt}
              </button>
            ))}
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="pointer-events-auto flex items-center gap-1 shrink-0">
          <button
            onClick={() => setHideControls(true)}
            className="h-8 px-2 sm:px-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 hover:text-white border border-purple-400/30 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-lg backdrop-blur-md"
            title="Скрыть всё меню для чистого экрана"
          >
            <EyeOff className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Чистый экран</span>
          </button>
        </div>
      </div>

      {/* Floating return controls when in clean recording mode */}
      {hideControls && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setHideControls(false);
            }}
            className="absolute top-4 left-4 z-40 bg-black/70 hover:bg-black/90 text-white/90 border border-white/25 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xl backdrop-blur-md transition-all cursor-pointer active:scale-95"
            title="Вернуть меню управления"
          >
            <ArrowLeft className="w-4 h-4 text-purple-400" />
            <span>Вернуть меню</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-4 right-4 z-40 bg-rose-600/40 hover:bg-rose-600/70 text-white border border-rose-400/40 p-2 rounded-xl text-xs font-bold shadow-2xl backdrop-blur-md transition-all cursor-pointer active:scale-95"
            title="Закрыть плеер"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-40 hover:opacity-100 transition-opacity bg-black/80 border border-white/15 px-4 py-1.5 rounded-full text-xs text-zinc-300 pointer-events-none">
            Нажмите в любое место, чтобы вернуть кнопки
          </div>
        </>
      )}

      {/* Recording Notice / Error Banner with Direct Action */}
      {recordingNotice && (
        <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 max-w-md w-11/12 bg-zinc-900/95 border border-purple-500/40 text-zinc-100 px-4 py-3.5 rounded-2xl text-xs z-50 shadow-2xl backdrop-blur-lg flex flex-col gap-2.5 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed text-zinc-200">{recordingNotice}</span>
            </div>
            <button
              onClick={() => setRecordingNotice(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Fullscreen Stage (Click anywhere to restore controls or toggle pause) */}
      <div
        onClick={() => {
          if (hideControls) {
            setHideControls(false);
          } else {
            setIsPlaying(!isPlaying);
          }
        }}
        className="w-full h-full flex items-center justify-center relative cursor-pointer"
      >
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full object-contain shadow-2xl"
          style={{
            aspectRatio:
              state.aspectRatio === '9:16'
                ? '9/16'
                : state.aspectRatio === '16:9'
                ? '16/9'
                : '1/1',
          }}
        />
      </div>

      {/* Bottom Floating Controls Bar - Ultra-compact Centered Dock */}
      <div
        className={`absolute bottom-2 sm:bottom-3 inset-x-0 px-2 flex justify-center z-30 transition-all duration-300 pointer-events-none ${
          hideControls ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="flex items-center gap-1 sm:gap-1.5 justify-center bg-black/90 backdrop-blur-md border border-white/15 rounded-2xl p-1 shadow-2xl pointer-events-auto shrink-0 select-none">
          {/* Play/Pause - Icon Only */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPlaying(!isPlaying);
            }}
            className="w-7.5 h-7.5 sm:w-8 sm:h-8 shrink-0 rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-purple-600/30 active:scale-95"
            title={isPlaying ? 'Пауза' : 'Воспроизведение'}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          {/* Restart from Beginning - Icon Only */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setRecordedVideoUrl(null);
              currentTimeRef.current = 0;
              lastTimeRef.current = performance.now();
              if (bgMediaElement instanceof HTMLVideoElement) {
                bgMediaElement.currentTime = 0;
                bgMediaElement.play().catch(() => {});
              }
              if (isPlaying && !isMuted && state.audio.enabled && state.audio.sourceType !== 'none') {
                audioMixer.play(state.audio, totalDuration, 0);
              }
              drawFrame(0);
            }}
            className="w-7.5 h-7.5 sm:w-8 sm:h-8 shrink-0 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
            title="С начала"
            aria-label="С начала"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Sound Mute/Unmute - Icon Only */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (bgMediaElement instanceof HTMLVideoElement) {
                bgMediaElement.muted = nextMuted;
              }
              if (nextMuted) {
                audioMixer.stop();
              } else if (isPlaying && state.audio.enabled && state.audio.sourceType !== 'none') {
                audioMixer.play(state.audio, totalDuration, currentTimeRef.current);
              }
            }}
            className={`w-7.5 h-7.5 sm:w-8 sm:h-8 shrink-0 rounded-xl flex items-center justify-center transition-all cursor-pointer border active:scale-95 ${
              isMuted
                ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 border-white/10'
                : 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white border-white/20'
            }`}
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
            aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>

          {/* Fix Txt & Fix Vid + Capture Button Group */}
          <div className="flex items-center gap-0.5 sm:gap-1 p-0.5 bg-zinc-900/90 border border-white/15 rounded-xl shrink-0">
            {/* Fix Txt Toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSetFixMode(fixMode === 'txt' ? 'none' : 'txt');
              }}
              className={`px-1.5 sm:px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer select-none whitespace-nowrap ${
                fixMode === 'txt'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/40'
                  : 'text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
              title={`Fix Txt: Записать 1 цикл текста (${totalDuration.toFixed(1)}с)`}
            >
              <span
                className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                  fixMode === 'txt'
                    ? 'border-white bg-white text-purple-700'
                    : 'border-zinc-500 bg-black/40'
                }`}
              >
                {fixMode === 'txt' && <Check className="w-2 h-2 stroke-[3]" />}
              </span>
              <span>Txt</span>
              <span className="text-[9px] sm:text-[10px] opacity-75 font-mono">
                {totalDuration.toFixed(1)}с
              </span>
            </button>

            {/* Fix Vid Toggle (Always visible) */}
            <button
              type="button"
              disabled={!hasVideoBg}
              onClick={(e) => {
                e.stopPropagation();
                if (!hasVideoBg) return;
                handleSetFixMode(fixMode === 'vid' ? 'none' : 'vid');
              }}
              className={`px-1.5 sm:px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all select-none whitespace-nowrap ${
                !hasVideoBg
                  ? 'opacity-40 cursor-not-allowed text-zinc-500'
                  : fixMode === 'vid'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/40 cursor-pointer'
                  : 'text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer'
              }`}
              title={
                hasVideoBg
                  ? `Fix Vid: Записать 1 цикл видео (${videoDuration.toFixed(1)}с)`
                  : 'Fix Vid: Доступен при загруженной видео-подложке'
              }
            >
              <span
                className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                  fixMode === 'vid'
                    ? 'border-white bg-white text-purple-700'
                    : 'border-zinc-500 bg-black/40'
                }`}
              >
                {fixMode === 'vid' && <Check className="w-2 h-2 stroke-[3]" />}
              </span>
              <span>Vid</span>
              {hasVideoBg && (
                <span className="text-[9px] sm:text-[10px] opacity-75 font-mono">
                  {videoDuration.toFixed(1)}с
                </span>
              )}
            </button>

            {/* Separator */}
            <div className="w-px h-3 bg-white/20 my-auto" />

            {/* Capture Button (Replaced by Download Button once video is captured) */}
            {recordedVideoUrl && !isRecordingScreen ? (
              <a
                href={recordedVideoUrl}
                download={`animator-capture-${Date.now()}.${recordedVideoExt}`}
                onClick={(e) => {
                  e.stopPropagation();
                  // Reset recorded state after download so user can record again if desired
                  setTimeout(() => {
                    setRecordedVideoUrl(null);
                  }, 2500);
                }}
                className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/40 transition-all cursor-pointer select-none active:scale-95 animate-bounce shrink-0"
                title={`Скачать готовое видео (.${recordedVideoExt})`}
                aria-label="Скачать готовое видео"
              >
                <Download className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </a>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLiveScreenRecord();
                }}
                className={`w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-lg flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
                  isRecordingScreen
                    ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/40'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/30'
                }`}
                title={
                  isRecordingScreen
                    ? 'Остановить запись'
                    : fixMode === 'txt'
                    ? `Захват Fix Txt (${totalDuration.toFixed(1)}с)`
                    : fixMode === 'vid'
                    ? `Захват Fix Vid (${videoDuration.toFixed(1)}с)`
                    : 'Захват холста'
                }
                aria-label={isRecordingScreen ? 'Остановить запись' : 'Захват видео'}
              >
                {isRecordingScreen ? (
                  <Square className="w-3 h-3 fill-white text-white" />
                ) : (
                  <Video className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
