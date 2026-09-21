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
  Square,
  ArrowLeft,
  Volume2,
  VolumeX,
  Clock,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { VideoProjectState } from '../types';
import { getDimensionsForAspect, renderCanvasFrame } from '../utils/canvasRenderer';
import { splitTextIntoSegments } from '../utils/textSplitter';
import { audioMixer, prepareDualAudioTrack } from '../utils/audioMixer';
import { safeFixWebm } from '../utils/safeWebmFix';

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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [hideControls, setHideControls] = useState<boolean>(false);

  // Live WebM recording states
  const [isRecordingScreen, setIsRecordingScreen] = useState<boolean>(false);
  const [recordingProgressSec, setRecordingProgressSec] = useState<number>(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState<boolean>(false);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [recordingSuccessMsg, setRecordingSuccessMsg] = useState<string | null>(null);

  const [videoDuration, setVideoDuration] = useState<number>(0);

  const currentTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const isPlayingRef = useRef<boolean>(true);
  const isRecordingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const recordingElapsedRef = useRef<number>(0);
  const recordingStartTimeRef = useRef<number>(0);
  const lastProgressUpdateRef = useRef<number>(0);
  const targetCycleDurationRef = useRef<number>(0);
  const recordedBlobRef = useRef<Blob | null>(null);
  const captureAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const captureAudioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const handleResetRecording = useCallback(() => {
    // Never reset while recording or processing is actively ongoing
    if (isRecordingRef.current || isProcessingRef.current) {
      return;
    }
    if (recordedVideoUrl) {
      try {
        URL.revokeObjectURL(recordedVideoUrl);
      } catch {}
    }
    setRecordedVideoUrl(null);
    recordedBlobRef.current = null;
    recordedChunksRef.current = [];
    setRecordingSuccessMsg(null);
    setRecordingNotice(null);
    setIsRecordingScreen(false);
    isRecordingRef.current = false;
  }, [recordedVideoUrl]);

  // Automatically reset previous recording ONLY when background media URL actually changes
  const prevBgUrlRef = useRef<string | null>(state.bgMediaUrl || null);
  useEffect(() => {
    if (state.bgMediaUrl !== prevBgUrlRef.current) {
      prevBgUrlRef.current = state.bgMediaUrl || null;
      if (!isRecordingRef.current && !isProcessingRef.current) {
        handleResetRecording();
      }
    }
  }, [state.bgMediaUrl, handleResetRecording]);

  // Clean up recording state whenever fullscreen modal closes so next session starts fresh
  useEffect(() => {
    if (!isOpen) {
      if (isRecordingRef.current) {
        stopLiveScreenRecord();
      }
      if (!isProcessingRef.current) {
        handleResetRecording();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    isRecordingRef.current = isRecordingScreen;
  }, [isRecordingScreen]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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

  // Natural text duration
  const { totalDuration: naturalTextDuration } = splitTextIntoSegments(
    state.rawText,
    state.textMode,
    state.speedMultiplier,
    state.pauseBetweenSeconds,
    undefined,
    state.animationStyle
  );

  // Synchronized with video duration if has video background and syncWithVideo is on
  const isSyncWithVideo = Boolean(state.syncWithVideo) && hasVideoBg;
  const effectiveDuration = isSyncWithVideo ? videoDuration : Math.max(1.0, naturalTextDuration);

  // Update target cycle duration ref
  useEffect(() => {
    targetCycleDurationRef.current = effectiveDuration;
  }, [effectiveDuration]);

  // Auto-dismiss success notification
  useEffect(() => {
    if (recordingSuccessMsg) {
      const timer = setTimeout(() => setRecordingSuccessMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [recordingSuccessMsg]);

  // Escape key handler
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

  // Sync background video element playback
  useEffect(() => {
    if (!isOpen) return;
    if (bgMediaElement instanceof HTMLVideoElement) {
      const isVideoAudioActive =
        !isMuted &&
        state.audio.videoAudioEnabled !== false &&
        (state.audio.videoVolume ?? 0.8) > 0;

      bgMediaElement.muted = !isVideoAudioActive;
      bgMediaElement.volume = Number.isFinite(state.audio.videoVolume)
        ? Math.max(0, Math.min(1, state.audio.videoVolume ?? 0.8))
        : 0.8;

      if (isPlaying) {
        bgMediaElement.play().catch(() => {});
      } else {
        bgMediaElement.pause();
      }
    }
  }, [
    isOpen,
    isPlaying,
    isMuted,
    bgMediaElement,
    state.audio.videoAudioEnabled,
    state.audio.videoVolume,
  ]);

  // Sync audio mixer playback
  useEffect(() => {
    if (!isOpen) {
      audioMixer.stop();
      return;
    }

    if (
      isPlaying &&
      !isMuted &&
      state.audio.enabled &&
      state.audio.sourceType !== 'none' &&
      state.audio.sourceType !== 'video' &&
      (state.audio.volume ?? 0.7) > 0
    ) {
      audioMixer.play(state.audio, effectiveDuration, currentTimeRef.current);
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
    state.audio.seed,
    state.audio.audioUrl,
    state.audio.volume,
    effectiveDuration,
  ]);

  const dimensions = getDimensionsForAspect(state.aspectRatio);

  // Canvas drawing callback
  const drawFrame = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dims = getDimensionsForAspect(state.aspectRatio);
      if (canvas.width !== dims.width || canvas.height !== dims.height) {
        canvas.width = dims.width;
        canvas.height = dims.height;
      }

      if (bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration) {
        if (!isPlayingRef.current) {
          const targetTime = time % bgMediaElement.duration;
          if (Math.abs(bgMediaElement.currentTime - targetTime) > 0.05) {
            bgMediaElement.currentTime = targetTime;
          }
        }
      }

      const hasVideo = bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration > 0;
      const vidDur = hasVideo ? (bgMediaElement as HTMLVideoElement).duration : 0;
      const isSync = Boolean(state.syncWithVideo) && vidDur > 0;
      const renderTargetDur = isSync ? vidDur : undefined;

      renderCanvasFrame({
        ctx,
        state,
        currentTime: time,
        bgMediaElement,
        dimensions: dims,
        targetDuration: renderTargetDur,
      });
    },
    [state, bgMediaElement]
  );

  // Stop live recording cleanly
  const stopLiveScreenRecord = useCallback((cycleDuration?: number) => {
    if (cycleDuration) {
      targetCycleDurationRef.current = cycleDuration;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      isProcessingRef.current = true;
      setIsProcessingVideo(true);
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error stopping media recorder:', err);
        isProcessingRef.current = false;
        setIsProcessingVideo(false);
      }
    }
    setIsRecordingScreen(false);
    isRecordingRef.current = false;
    setHideControls(false);
  }, []);

  // Continuous animation and capture loop
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
      audioMixer.play(state.audio, effectiveDuration, 0, state.bgMediaUrl || undefined);
    }

    const loop = (now: number) => {
      if (isPlayingRef.current) {
        const isRecording = isRecordingRef.current;

        if (isRecording) {
          const nowMs = performance.now();
          const elapsed = (nowMs - recordingStartTimeRef.current) / 1000;
          recordingElapsedRef.current = elapsed;

          if (nowMs - lastProgressUpdateRef.current > 80) {
            lastProgressUpdateRef.current = nowMs;
            setRecordingProgressSec(Math.min(effectiveDuration, elapsed));
          }

          if (elapsed >= effectiveDuration) {
            // Reached exactly 1 full cycle
            currentTimeRef.current = effectiveDuration;
            drawFrame(effectiveDuration);
            stopLiveScreenRecord(effectiveDuration);

            // Seamlessly loop and keep playback running smoothly without freezing
            currentTimeRef.current = 0;
            lastTimeRef.current = now;
            if (bgMediaElement instanceof HTMLVideoElement) {
              bgMediaElement.currentTime = 0;
              bgMediaElement.play().catch(() => {});
            }
            if (state.audio.enabled && state.audio.sourceType !== 'none') {
              audioMixer.play(state.audio, effectiveDuration, 0, state.bgMediaUrl || undefined);
            }
          } else {
            currentTimeRef.current = elapsed;
            drawFrame(elapsed);
          }
        } else {
          // Standard playback (not recording)
          const delta = Math.min(0.1, (now - lastTimeRef.current) / 1000);
          lastTimeRef.current = now;

          let nextTime = currentTimeRef.current + delta;
          if (nextTime >= effectiveDuration) {
            nextTime = 0;
            if (bgMediaElement instanceof HTMLVideoElement) {
              bgMediaElement.currentTime = 0;
              bgMediaElement.play().catch(() => {});
            }
            if (state.audio.enabled && state.audio.sourceType !== 'none') {
              audioMixer.play(state.audio, effectiveDuration, 0, state.bgMediaUrl || undefined);
            }
          }
          currentTimeRef.current = nextTime;
          drawFrame(nextTime);
        }

        // Loop background video seamlessly
        if (bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration) {
          const vidDur = bgMediaElement.duration;
          const targetVidTime = vidDur > 0 ? (currentTimeRef.current % vidDur) : 0;
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
  }, [isOpen, effectiveDuration, drawFrame, bgMediaElement, state.audio, stopLiveScreenRecord]);

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

  // Direct Live Screen Capture from Canvas in WebM format
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
    recordedBlobRef.current = null;
    recordedChunksRef.current = [];
    recordingElapsedRef.current = 0;
    setRecordingProgressSec(0);
    targetCycleDurationRef.current = effectiveDuration;

    // Pre-flight check: ensure canvas.captureStream exists
    if (typeof canvas.captureStream !== 'function') {
      setRecordingNotice(
        'Функция захвата видеопотока не поддерживается данным браузером.'
      );
      return;
    }

    // Ensure canvas dimensions are set and frame 0 is drawn before capturing stream
    const dims = getDimensionsForAspect(state.aspectRatio);
    if (canvas.width !== dims.width || canvas.height !== dims.height) {
      canvas.width = dims.width;
      canvas.height = dims.height;
    }
    currentTimeRef.current = 0;
    drawFrame(0);

    let canvasStream: MediaStream;
    try {
      canvasStream = canvas.captureStream(30);
    } catch (captureErr) {
      console.warn('Live screen capture unavailable on canvas:', captureErr);
      setRecordingNotice('Не удалось захватить видеопоток с холста.');
      return;
    }

    // Prepare audio track (video audio + music generator/file)
    const isBgVideo =
      (state.bgType === 'video' || state.bgMediaType === 'video' || bgMediaElement instanceof HTMLVideoElement) &&
      Boolean(state.bgMediaUrl);

    let mixedAudioBuffer: AudioBuffer | null = null;
    try {
      mixedAudioBuffer = await prepareDualAudioTrack(
        state.audio,
        state.bgMediaUrl,
        isBgVideo,
        effectiveDuration
      );
    } catch (audioPrepErr) {
      console.warn('Could not prepare dual audio track:', audioPrepErr);
    }

    const combinedStream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

    if (mixedAudioBuffer) {
      try {
        const audioCtx = audioMixer.getAudioContext();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        const audioDest = audioCtx.createMediaStreamDestination();
        captureAudioDestRef.current = audioDest;

        const sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = mixedAudioBuffer;
        sourceNode.loop = true;
        captureAudioSourceRef.current = sourceNode;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);

        sourceNode.connect(gainNode);
        gainNode.connect(audioDest);
        if (!isMuted) {
          gainNode.connect(audioCtx.destination);
        }

        const tracks = audioDest.stream.getAudioTracks();
        if (tracks.length > 0) {
          combinedStream.addTrack(tracks[0]);
        }
      } catch (audioSetupErr) {
        console.warn('Audio setup error during capture:', audioSetupErr);
      }
    }

    try {
      const hasAudioTrack = combinedStream.getAudioTracks().length > 0;
      let mimeType = 'video/webm';
      if (hasAudioTrack) {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
          mimeType = 'video/webm;codecs=vp8,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          mimeType = 'video/webm;codecs=vp9,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        }
      } else {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
          mimeType = 'video/webm;codecs=vp8';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        }
      }

      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: 4_500_000,
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

      recorder.onstop = async () => {
        isProcessingRef.current = true;
        setIsProcessingVideo(true);

        // Stop & disconnect recording audio source
        if (captureAudioSourceRef.current) {
          try {
            captureAudioSourceRef.current.stop();
            captureAudioSourceRef.current.disconnect();
          } catch {}
          captureAudioSourceRef.current = null;
        }
        if (captureAudioDestRef.current) {
          try {
            captureAudioDestRef.current.disconnect();
          } catch {}
          captureAudioDestRef.current = null;
        }

        // Restore video element audio mute state
        if (bgMediaElement instanceof HTMLVideoElement) {
          bgMediaElement.muted = isMuted;
        }

        try {
          if (!recordedChunksRef.current || recordedChunksRef.current.length === 0) {
            throw new Error('Файл записи не содержит данных (0 фрагментов).');
          }

          const rawBlob = new Blob(recordedChunksRef.current, { type: mimeType });
          if (rawBlob.size === 0) {
            throw new Error('Записанный файл пуст (0 байт).');
          }

          const durSec = targetCycleDurationRef.current || effectiveDuration;
          let finalBlob = rawBlob;

          try {
            finalBlob = await safeFixWebm(rawBlob, durSec);
          } catch (fixErr) {
            console.warn('Could not remux WebM duration, using raw blob:', fixErr);
            finalBlob = rawBlob;
          }

          if (!finalBlob || finalBlob.size === 0) {
            finalBlob = rawBlob;
          }

          const url = URL.createObjectURL(finalBlob);
          recordedBlobRef.current = finalBlob;
          setRecordedVideoUrl(url);
          setRecordingSuccessMsg(`Готово! Видео WebM (${durSec.toFixed(1)}с) готово к скачиванию`);
        } catch (err) {
          console.error('Error in onstop:', err);
          setRecordingNotice('Не удалось сохранить видео WebM. Попробуйте еще раз.');
        } finally {
          isProcessingRef.current = false;
          setIsProcessingVideo(false);
          setIsRecordingScreen(false);
          isRecordingRef.current = false;
        }
      };

      recorder.onerror = (e) => {
        console.warn('MediaRecorder error during capture:', e);
        if (captureAudioSourceRef.current) {
          try {
            captureAudioSourceRef.current.stop();
            captureAudioSourceRef.current.disconnect();
          } catch {}
          captureAudioSourceRef.current = null;
        }
        if (bgMediaElement instanceof HTMLVideoElement) {
          bgMediaElement.muted = isMuted;
        }
        isProcessingRef.current = false;
        setIsProcessingVideo(false);
        setIsRecordingScreen(false);
        isRecordingRef.current = false;
        setRecordingNotice('Ошибка при записи видео.');
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;

      if (captureAudioSourceRef.current) {
        try {
          captureAudioSourceRef.current.start(0);
        } catch {}
      }

      if (bgMediaElement instanceof HTMLVideoElement) {
        bgMediaElement.muted = true;
        bgMediaElement.currentTime = 0;
        bgMediaElement.play().catch(() => {});
      }

      // Start timing exactly with recorder start
      recordingStartTimeRef.current = performance.now();
      lastTimeRef.current = performance.now();
      setIsPlaying(true);
      isPlayingRef.current = true;
      setIsRecordingScreen(true);
      isRecordingRef.current = true;
    } catch (err) {
      console.error('Error starting live screen recording:', err);
      if (captureAudioSourceRef.current) {
        try {
          captureAudioSourceRef.current.stop();
          captureAudioSourceRef.current.disconnect();
        } catch {}
        captureAudioSourceRef.current = null;
      }
      setIsRecordingScreen(false);
      isRecordingRef.current = false;
      setRecordingNotice('Не удалось начать запись экрана. Попробуйте еще раз.');
    }
  };

  const handleSaveRecordedVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    const durSec = targetCycleDurationRef.current || effectiveDuration;
    const filename = `animator-quote-${Math.round(durSec)}s-${Date.now()}.webm`;

    const blob = recordedBlobRef.current;
    if (!blob || blob.size === 0) {
      setRecordingNotice('Файл записи еще не сформирован или пуст. Повторите захват.');
      return;
    }

    const url = URL.createObjectURL(blob);

    try {
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      setRecordingSuccessMsg('Скачивание WebM начато!');

      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch {}
      }, 60000);
    } catch (dlErr) {
      console.error('Download error:', dlErr);
      setRecordingNotice('Не удалось начать скачивание. Попробуйте нажать кнопку еще раз.');
    }
  };

  const handleRestart = () => {
    currentTimeRef.current = 0;
    lastTimeRef.current = performance.now();
    if (bgMediaElement instanceof HTMLVideoElement) {
      bgMediaElement.currentTime = 0;
      bgMediaElement.play().catch(() => {});
    }
    if (state.audio.enabled && state.audio.sourceType !== 'none') {
      audioMixer.play(state.audio, effectiveDuration, 0, state.bgMediaUrl || undefined);
    }
    drawFrame(0);
    setIsPlaying(true);
    isPlayingRef.current = true;
  };

  const togglePlay = () => {
    const nextPlay = !isPlaying;
    setIsPlaying(nextPlay);
    isPlayingRef.current = nextPlay;
    if (nextPlay) {
      lastTimeRef.current = performance.now();
      if (bgMediaElement instanceof HTMLVideoElement) {
        bgMediaElement.play().catch(() => {});
      }
      if (state.audio.enabled && state.audio.sourceType !== 'none') {
        audioMixer.play(state.audio, effectiveDuration, currentTimeRef.current, state.bgMediaUrl || undefined);
      }
    } else {
      if (bgMediaElement instanceof HTMLVideoElement) {
        bgMediaElement.pause();
      }
      audioMixer.stop();
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (bgMediaElement instanceof HTMLVideoElement) {
      bgMediaElement.muted = nextMute;
    }
    if (nextMute) {
      audioMixer.stop();
    } else if (isPlaying && state.audio.enabled && state.audio.sourceType !== 'none') {
      audioMixer.play(state.audio, effectiveDuration, currentTimeRef.current, state.bgMediaUrl || undefined);
    }
  };

  // Lock body scroll when fullscreen is active
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
      {/* Active Recording Floating Status Pill */}
      {isRecordingScreen && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-black/90 backdrop-blur-md border border-rose-500/50 px-3.5 py-1.5 rounded-full shadow-2xl animate-fade-in">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
          <span className="text-white text-xs font-semibold select-none">
            Запись WebM: {recordingProgressSec.toFixed(1)} / {effectiveDuration.toFixed(1)}с
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
        className={`absolute top-0 inset-x-0 p-2 sm:p-3 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-1 sm:gap-2 z-30 transition-all duration-300 pointer-events-none ${
          hideControls ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Left: Back to Editor button */}
        <button
          onClick={onClose}
          className="pointer-events-auto shrink-0 h-8 w-8 sm:w-auto px-0 sm:px-2.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/15 shadow-lg cursor-pointer transition-all active:scale-95"
          title="Вернуться в редактор"
        >
          <ArrowLeft className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="hidden sm:inline">Назад</span>
        </button>

        {/* Right Action Controls */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Mute / Unmute Sound Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className={`h-8 w-8 rounded-xl border flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0 backdrop-blur-md shadow-lg ${
              isMuted
                ? 'bg-zinc-800/80 hover:bg-zinc-700 text-rose-400 border-white/10'
                : 'bg-zinc-800/90 hover:bg-zinc-700 text-emerald-400 border-white/20'
            }`}
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
            aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <button
            onClick={() => setHideControls(true)}
            className="h-8 w-8 sm:w-auto px-0 sm:px-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 hover:text-white border border-purple-400/30 text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-lg backdrop-blur-md"
            title="Скрыть всё меню для чистого экрана"
          >
            <EyeOff className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="hidden sm:inline">Чистый экран</span>
          </button>

          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/15 flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-lg"
            title="Закрыть полноэкранный режим"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {recordingNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 max-w-md w-11/12 bg-amber-500/15 border border-amber-500/40 text-amber-200 px-3.5 py-2 rounded-xl text-xs z-40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-2 animate-fade-in">
          <span>{recordingNotice}</span>
          <button
            onClick={() => setRecordingNotice(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-amber-300 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Restore Controls Button */}
      {hideControls && (
        <button
          onClick={() => setHideControls(false)}
          className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white text-xs border border-white/20 backdrop-blur-md flex items-center gap-1.5 cursor-pointer shadow-2xl transition-all animate-fade-in active:scale-95"
          title="Показать элементы управления"
        >
          <span>Показать меню</span>
        </button>
      )}

      {/* Main Canvas Viewport */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden p-2 sm:p-4"
        onClick={() => {
          if (hideControls) {
            setHideControls(false);
          } else {
            togglePlay();
          }
        }}
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="max-h-full max-w-full object-contain shadow-2xl rounded-sm sm:rounded-lg cursor-pointer transition-transform"
          style={{
            aspectRatio: `${dimensions.width} / ${dimensions.height}`,
          }}
        />
      </div>

      {/* Bottom Floating Control Bar */}
      <div
        className={`absolute bottom-3 sm:bottom-4 inset-x-0 flex justify-center items-center z-30 transition-all duration-300 pointer-events-none px-2 ${
          hideControls ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 bg-black/90 backdrop-blur-xl border border-white/15 px-2 py-1.5 rounded-2xl shadow-2xl overflow-hidden flex-nowrap shrink-0 max-w-full">
          {/* Play / Pause Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="w-8 h-8 rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-md shadow-purple-600/40 cursor-pointer transition-all active:scale-95 shrink-0"
            title={isPlaying ? 'Пауза (Пробел)' : 'Воспроизведение (Пробел)'}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>

          {/* Restart Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRestart();
            }}
            className="w-8 h-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0"
            title="С начала"
            aria-label="С начала"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* ФиксТхт Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ syncWithVideo: false });
            }}
            className={`px-2 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
              !isSyncWithVideo
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/40 border border-purple-400/40'
                : 'bg-zinc-800/90 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-white/10'
            }`}
            title={`ФиксТхт: хронометраж по тексту (${naturalTextDuration.toFixed(1)}с)`}
          >
            <span>ФиксТхт ({naturalTextDuration.toFixed(1)}с)</span>
          </button>

          {/* ФиксВид Button */}
          {hasVideoBg && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ syncWithVideo: true });
                }}
                className={`px-2 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
                  isSyncWithVideo
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/40 border border-purple-400/40'
                    : 'bg-zinc-800/90 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-white/10'
                }`}
                title={`ФиксВид: синхронизация по длине видео (${videoDuration.toFixed(1)}с)`}
              >
                <span>ФиксВид ({videoDuration.toFixed(1)}с)</span>
              </button>

              {/* Sub-mode: Цикл или Плавная */}
              {isSyncWithVideo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ textLoopMode: state.textLoopMode === 'loop' ? 'stretch' : 'loop' });
                  }}
                  className="px-2 py-1 rounded-xl text-[10px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-purple-300 border border-purple-500/30 transition-all cursor-pointer select-none whitespace-nowrap shrink-0"
                  title={state.textLoopMode === 'loop' ? 'Режим текста: цикл (нажмите для плавного растягивания)' : 'Режим текста: плавное растягивание (нажмите для цикла)'}
                >
                  {state.textLoopMode === 'loop' ? 'Цикл' : 'Плавная'}
                </button>
              )}
            </>
          )}

          {/* Separator */}
          <div className="w-px h-4 bg-white/20 shrink-0 my-auto" />

          {/* Record / Processing / Download WebM Button */}
          {recordedVideoUrl && !isRecordingScreen && !isProcessingVideo ? (
            <button
              type="button"
              onClick={handleSaveRecordedVideo}
              className="w-8 h-8 rounded-xl bg-teal-500 hover:bg-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/40 transition-all cursor-pointer select-none active:scale-95 animate-bounce shrink-0"
              title="Скачать видео WebM в Галерею / Загрузки"
              aria-label="Скачать видео WebM"
            >
              <Download className="w-4 h-4 text-white stroke-[2.5]" />
            </button>
          ) : isProcessingVideo ? (
            <button
              type="button"
              disabled
              className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-400 border border-zinc-700/60 flex items-center justify-center cursor-not-allowed opacity-80 shrink-0 select-none"
              title="Обработка и сохранение WebM..."
              aria-label="Обработка..."
            >
              <Sparkles className="w-4 h-4 text-purple-400 animate-spin" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleLiveScreenRecord();
              }}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
                isRecordingScreen
                  ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
              }`}
              title={
                isRecordingScreen
                  ? 'Остановить запись'
                  : `Захват видео WebM (${effectiveDuration.toFixed(1)}с)`
              }
              aria-label={
                isRecordingScreen ? 'Остановить запись' : 'Захват видео WebM'
              }
            >
              {isRecordingScreen ? (
                <Square className="w-3.5 h-3.5 fill-white text-white" />
              ) : (
                <Video className="w-4 h-4 text-white" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
