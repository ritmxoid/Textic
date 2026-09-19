import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Download } from 'lucide-react';
import { Header } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { BackgroundSection } from './components/BackgroundSection';
import { TextInputSection } from './components/TextInputSection';
import { AudioSection } from './components/AudioSection';
import { FontSection } from './components/FontSection';
import { TextModeSection } from './components/TextModeSection';
import { AnimationStyleSection } from './components/AnimationStyleSection';
import { EffectsSection } from './components/EffectsSection';
import { SpeedSection } from './components/SpeedSection';
import { ExportModal } from './components/ExportModal';
import { SAMPLE_TEXTS } from './data/presets';
import { VideoProjectState } from './types';
import { ExportProgress, exportVideo } from './utils/videoRecorder';
import { splitTextIntoSegments } from './utils/textSplitter';
import {
  saveProjectState,
  loadProjectState,
  saveMediaFile,
  loadMediaFile,
  clearMediaFile,
  clearAllProjectData,
} from './utils/projectStorage';

const DEFAULT_STATE: VideoProjectState = {
  // Background
  bgType: 'preset',
  bgMediaUrl: null,
  bgMediaType: null,
  bgPresetId: 'midnight-violet',
  bgOverlayOpacity: 0.35,

  // Audio / Music
  audio: {
    enabled: false,
    sourceType: 'generator',
    audioUrl: null,
    audioFileName: null,
    presetId: 'lofi-chill',
    volume: 0.7,
    loop: true,
    audioDuration: 0,
  },

  // Text
  rawText: SAMPLE_TEXTS[0].text,
  authorText: '',
  textMode: 'sentence',
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 72,
  textColor: '#ffffff',
  strokeEnabled: false,
  strokeColor: '#000000',
  strokeWidth: 6,
  textAlign: 'center',
  textPosition: 'center',
  textPositionY: 50,
  isUppercase: false,

  // Animation & Effects
  animationStyle: 'typewriter',
  effects: {
    glow: false,
    sparkle: true,
    fire: false,
    neon: false,
    shadow: true,
  },
  neonColor: '#a855f7',
  speedMultiplier: 1.0,
  pauseBetweenSeconds: 0.8,

  // Canvas
  aspectRatio: '9:16',
};

export default function App() {
  // Initialize with saved state from localStorage if available (never lose user's typed text or settings!)
  const [projectState, setProjectState] = useState<VideoProjectState>(() => {
    const saved = loadProjectState();
    if (saved) {
      return {
        ...DEFAULT_STATE,
        ...saved,
        audio: {
          ...DEFAULT_STATE.audio,
          ...(saved.audio || {}),
          // audioUrl is a temporary blob that will be restored from IndexedDB
          audioUrl: null,
        },
        // bgMediaUrl is a temporary blob that will be restored from IndexedDB
        bgMediaUrl: null,
      };
    }
    return DEFAULT_STATE;
  });

  const [isFullscreenOpen, setIsFullscreenOpen] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isMediaLoading, setIsMediaLoading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);

  const [bgMediaElement, setBgMediaElement] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const bgMediaElementRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  bgMediaElementRef.current = bgMediaElement;
  const hasRestoredMediaRef = useRef<boolean>(false);
  const handleFileUploadRef = useRef<(file: File, isRestoration?: boolean) => void>(() => {});

  const mediaUrlRef = useRef<string | null>(null);
  const mediaSandboxRef = useRef<HTMLDivElement>(null);
  const lastUploadedFileRef = useRef<File | null>(null);

  // Helper to release hardware video decoders in mobile Chromium / Android MediaCodec
  const teardownVideoElement = (v: HTMLVideoElement | null) => {
    if (!v) return;
    try {
      v.pause();
      v.removeAttribute('src');
      while (v.firstChild) {
        v.removeChild(v.firstChild);
      }
      v.load();
    } catch (err) {
      console.warn('Error releasing video element:', err);
    }
  };

  // Compute total duration
  const { totalDuration } = splitTextIntoSegments(
    projectState.rawText,
    projectState.textMode,
    projectState.speedMultiplier,
    projectState.pauseBetweenSeconds
  );

  // Export State
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    isExporting: false,
    progress: 0,
    statusText: '',
    downloadUrl: null,
    fileBlob: null,
    fileExtension: 'mp4',
    error: null,
  });

  const handleStateChange = useCallback((patch: Partial<VideoProjectState>) => {
    setProjectState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Automatic debounced persistence of user's project settings & text
  useEffect(() => {
    const timer = setTimeout(() => {
      saveProjectState(projectState);
    }, 200);
    return () => clearTimeout(timer);
  }, [projectState]);

  // Handle media file upload (robust video/image detection, decoder management, and fallback pipeline)
  const handleFileUpload = useCallback((file: File, isRestoration = false) => {
    setUploadError(null);
    setUploadSuccess(false);
    setIsMediaLoading(true);
    lastUploadedFileRef.current = file;

    // Persist file into IndexedDB so tab reloads / Android Chrome memory eviction never loses it
    if (!isRestoration) {
      saveMediaFile('background', file, file.name, file.type);
    }

    // 1. Properly release any existing video element and hardware decoders
    if (bgMediaElementRef.current instanceof HTMLVideoElement) {
      teardownVideoElement(bgMediaElementRef.current);
    }
    if (mediaSandboxRef.current) {
      const existingVideos = mediaSandboxRef.current.querySelectorAll('video');
      existingVideos.forEach((v) => teardownVideoElement(v));
      mediaSandboxRef.current.innerHTML = '';
    }

    if (mediaUrlRef.current) {
      try {
        URL.revokeObjectURL(mediaUrlRef.current);
      } catch {}
      mediaUrlRef.current = null;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isVideo =
      file.type.startsWith('video/') ||
      /\.(mp4|webm|mov|m4v|mkv|avi|3gp)$/i.test(file.name);

    let resolvedMime = file.type;
    if (isVideo) {
      if (!resolvedMime || resolvedMime === 'application/octet-stream' || !resolvedMime.startsWith('video/')) {
        if (ext === 'webm') resolvedMime = 'video/webm';
        else if (ext === 'mov') resolvedMime = 'video/quicktime';
        else resolvedMime = 'video/mp4';
      }
    } else {
      if (!resolvedMime || resolvedMime === 'application/octet-stream' || !resolvedMime.startsWith('image/')) {
        if (ext === 'png') resolvedMime = 'image/png';
        else if (ext === 'webp') resolvedMime = 'image/webp';
        else resolvedMime = 'image/jpeg';
      }
    }

    const targetMime = resolvedMime || (isVideo ? 'video/mp4' : 'image/jpeg');

    if (isVideo) {
      // Create slice with explicit MIME type to guarantee Android MediaCodec detects the MP4 container correctly
      const typedBlob =
        file.type && file.type.startsWith('video/')
          ? file
          : file.slice(0, file.size, targetMime);

      const blobUrl = URL.createObjectURL(typedBlob);
      mediaUrlRef.current = blobUrl;

      const loadVideoSource = (sourceUrl: string, isFallbackAttempt = false) => {
        const video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;

        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('muted', '');
        video.setAttribute('autoplay', '');
        video.preload = 'auto';

        if (!sourceUrl.startsWith('blob:') && !sourceUrl.startsWith('data:')) {
          video.crossOrigin = 'anonymous';
        }

        // Attach to DOM sandbox BEFORE setting source so Chromium never aborts pipeline on insertion
        if (mediaSandboxRef.current) {
          mediaSandboxRef.current.innerHTML = '';
          mediaSandboxRef.current.appendChild(video);
        }

        // Explicit source tag with MIME hint
        const sourceEl = document.createElement('source');
        sourceEl.src = sourceUrl;
        sourceEl.type = targetMime;
        video.appendChild(sourceEl);

        video.src = sourceUrl;

        let initialized = false;
        let pollTimer: NodeJS.Timeout | null = null;
        let safetyTimer: NodeJS.Timeout | null = null;

        const cleanup = () => {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          if (safetyTimer) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
          }
        };

        safetyTimer = setTimeout(() => {
          if (!initialized) {
            failWithError(
              undefined,
              'Загрузка видео заняла слишком много времени. Проверьте формат файла или нажмите «Повторить».'
            );
          }
        }, 12000);

        const onReady = () => {
          if (initialized) return;
          initialized = true;
          cleanup();

          setFileName(file.name);
          setIsMediaLoading(false);
          setUploadError(null);
          setUploadSuccess(true);
          setTimeout(() => setUploadSuccess(false), 2000);

          video.play().catch(() => {});
          setBgMediaElement(video);
          handleStateChange({
            bgType: 'video',
            bgMediaUrl: sourceUrl,
            bgMediaType: 'video',
          });
        };

        const failWithError = (errCode?: number, customMsg?: string) => {
          if (initialized) return;
          initialized = true;
          cleanup();
          teardownVideoElement(video);
          setIsMediaLoading(false);

          let msg = customMsg || 'Браузер вашего устройства не смог открыть этот видеофайл.';
          if (!customMsg) {
            if (errCode === 4) {
              msg =
                'Браузер устройства временно не смог запустить видеокодек (код 4). Попробуйте нажать кнопку «Повторить» ниже или выберите видео снова.';
            } else if (errCode === 3) {
              msg =
                'Ошибка декодирования видео (код 3). Возможно, файл поврежден или использует несовместимый видеокодек.';
            }
          }

          setUploadError(msg);
        };

        video.onloadedmetadata = onReady;
        video.onloadeddata = onReady;
        video.oncanplay = onReady;
        video.oncanplaythrough = onReady;
        video.onplay = onReady;
        video.onended = () => {
          video.currentTime = 0;
          video.play().catch(() => {});
        };
        video.ontimeupdate = () => {
          if (video.currentTime > 0) onReady();
        };

        video.onerror = async () => {
          // Ignore aborted request code 1
          if (video.error && video.error.code === 1) {
            return;
          }

          if (video.readyState >= 1 && video.videoWidth > 0) {
            onReady();
            return;
          }

          // Automatic Fallbacks for Android Chrome / Chromium
          if (!isFallbackAttempt) {
            cleanup();
            teardownVideoElement(video);

            // Fallback 1: Try reading via in-memory ArrayBuffer to eliminate ContentProvider/file descriptor glitches
            try {
              const arrayBuf = await file.arrayBuffer();
              const memoryBlob = new Blob([arrayBuf], { type: targetMime });
              const freshUrl = URL.createObjectURL(memoryBlob);
              mediaUrlRef.current = freshUrl;
              loadVideoSource(freshUrl, true);
              return;
            } catch (bufErr) {
              console.warn('ArrayBuffer fallback failed, trying DataURL fallback:', bufErr);
            }

            // Fallback 2: Try Data URL for files under 60MB
            if (file.size <= 60 * 1024 * 1024) {
              try {
                const reader = new FileReader();
                reader.onload = () => {
                  if (reader.result && typeof reader.result === 'string') {
                    loadVideoSource(reader.result, true);
                  } else {
                    failWithError(video.error?.code);
                  }
                };
                reader.onerror = () => {
                  failWithError(video.error?.code);
                };
                reader.readAsDataURL(file);
                return;
              } catch (dataErr) {
                console.warn('DataURL fallback failed:', dataErr);
              }
            }
          }

          failWithError(video.error?.code);
        };

        video.load();

        if (video.readyState >= 1 && video.videoWidth > 0) {
          onReady();
          return;
        }

        pollTimer = setInterval(() => {
          if (initialized) {
            cleanup();
            return;
          }
          if (video.readyState >= 1 && video.videoWidth > 0) {
            onReady();
          }
        }, 100);

        setTimeout(() => {
          if (pollTimer) clearInterval(pollTimer);
        }, 6000);
      };

      loadVideoSource(blobUrl);
    } else {
      const blobUrl = URL.createObjectURL(file);
      mediaUrlRef.current = blobUrl;
      const img = new Image();
      if (!blobUrl.startsWith('blob:') && !blobUrl.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      let initialized = false;

      img.onload = () => {
        if (initialized) return;
        initialized = true;
        setFileName(file.name);
        setIsMediaLoading(false);
        setUploadError(null);
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2000);

        setBgMediaElement(img);
        handleStateChange({
          bgType: 'image',
          bgMediaUrl: blobUrl,
          bgMediaType: 'image',
        });
      };

      img.onerror = () => {
        if (initialized) return;
        initialized = true;
        setIsMediaLoading(false);
        setUploadError(
          'Не удалось открыть изображение. Проверьте формат файла (поддерживаются JPG, PNG, WEBP).'
        );
      };

      img.src = blobUrl;
      if (img.complete && img.naturalWidth > 0) {
        img.onload(new Event('load'));
      }
    }
  }, [handleStateChange]);

  useEffect(() => {
    handleFileUploadRef.current = handleFileUpload;
  }, [handleFileUpload]);

  // Restore cached media files from IndexedDB ONCE on initial startup
  useEffect(() => {
    if (hasRestoredMediaRef.current) return;
    hasRestoredMediaRef.current = true;
    let isMounted = true;

    async function restoreCachedMedia() {
      // 1. Restore background media
      try {
        const bgRecord = await loadMediaFile('background');
        if (isMounted && bgRecord && bgRecord.blob) {
          const restoredFile = new File([bgRecord.blob], bgRecord.fileName, {
            type: bgRecord.mimeType || bgRecord.blob.type,
          });
          handleFileUploadRef.current(restoredFile, true);
        }
      } catch (err) {
        console.warn('Could not restore background media:', err);
      }

      // 2. Restore custom audio file
      try {
        const audioRecord = await loadMediaFile('audio');
        if (isMounted && audioRecord && audioRecord.blob) {
          const audioUrl = URL.createObjectURL(audioRecord.blob);
          setProjectState((prev) => {
            if (prev.audio.audioUrl?.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(prev.audio.audioUrl);
              } catch {}
            }
            return {
              ...prev,
              audio: {
                ...prev.audio,
                enabled: true,
                sourceType: 'file',
                audioUrl,
                audioFileName: audioRecord.fileName,
                audioDuration: audioRecord.duration || prev.audio.audioDuration || 0,
              },
            };
          });
        }
      } catch (err) {
        console.warn('Could not restore audio media:', err);
      }
    }

    restoreCachedMedia();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRetryUpload = () => {
    if (lastUploadedFileRef.current) {
      handleFileUpload(lastUploadedFileRef.current);
    }
  };

  const handleClearBackgroundMedia = () => {
    if (bgMediaElementRef.current instanceof HTMLVideoElement) {
      teardownVideoElement(bgMediaElementRef.current);
    }
    if (mediaUrlRef.current) {
      try {
        URL.revokeObjectURL(mediaUrlRef.current);
      } catch {}
      mediaUrlRef.current = null;
    }
    if (mediaSandboxRef.current) {
      const existingVideos = mediaSandboxRef.current.querySelectorAll('video');
      existingVideos.forEach((v) => teardownVideoElement(v));
      mediaSandboxRef.current.innerHTML = '';
    }
    lastUploadedFileRef.current = null;
    clearMediaFile('background');
    setBgMediaElement(null);
    setFileName(null);
    setUploadError(null);
    setUploadSuccess(false);
    setIsMediaLoading(false);
    handleStateChange({
      bgType: 'preset',
      bgMediaUrl: null,
      bgMediaType: null,
    });
  };

  const handleResetAll = async () => {
    handleClearBackgroundMedia();
    if (projectState.audio.audioUrl) {
      try {
        URL.revokeObjectURL(projectState.audio.audioUrl);
      } catch {}
    }
    await clearAllProjectData();
    setProjectState(DEFAULT_STATE);
  };

  const handleExport = async () => {
    try {
      setExportProgress({
        isExporting: true,
        progress: 0,
        statusText: 'Подготовка к записи видео и звука...',
        downloadUrl: null,
        fileBlob: null,
        fileExtension: 'mp4',
        error: null,
      });

      const result = await exportVideo({
        state: projectState,
        bgMediaElement,
        onProgress: (progress) => {
          setExportProgress(progress);
        },
      });

      if (result && result.downloadUrl) {
        // Automatically start file download in browser
        const ext = result.blob?.type?.includes('mp4') ? 'mp4' : 'webm';
        const a = document.createElement('a');
        a.href = result.downloadUrl;
        a.download = `animated-quote-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      setExportProgress({
        isExporting: false,
        progress: 0,
        statusText: 'Ошибка экспорта',
        downloadUrl: null,
        fileBlob: null,
        fileExtension: 'mp4',
        error: String(err),
      });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaUrlRef.current) {
        URL.revokeObjectURL(mediaUrlRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0F0F12] text-zinc-100 flex flex-col font-sans selection:bg-purple-600/30 selection:text-purple-200 overflow-x-clip w-full max-w-[100vw]">
      {/* Top Header with File Upload Action */}
      <Header
        onFileUpload={handleFileUpload}
        fileName={fileName}
        onClearFile={handleClearBackgroundMedia}
        onResetProject={handleResetAll}
      />

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Preview Column (First on Mobile, Left on Desktop - Sticky full height) */}
        <div className="order-1 lg:order-1 lg:col-span-5 lg:sticky lg:top-14 lg:self-start">
          <VideoPreview
            state={projectState}
            onChange={handleStateChange}
            bgMediaElement={bgMediaElement}
            onExportClick={handleExport}
            isExporting={exportProgress.isExporting}
            onFileUpload={handleFileUpload}
            isMediaLoading={isMediaLoading}
            uploadSuccess={uploadSuccess}
            uploadError={uploadError}
            onDismissError={() => setUploadError(null)}
            onRetryUpload={handleRetryUpload}
            isFullscreenOpen={isFullscreenOpen}
            onOpenFullscreen={() => setIsFullscreenOpen(true)}
            onCloseFullscreen={() => setIsFullscreenOpen(false)}
          />
        </div>

        {/* Detailed Controls Column (Below Preview on Mobile, Right on Desktop) */}
        <div className="order-2 lg:order-2 lg:col-span-7 space-y-4 sm:space-y-5">
          {/* Step 1: Text Input */}
          <TextInputSection
            state={projectState}
            onChange={handleStateChange}
          />

          {/* Step 2: Fonts & Formatting */}
          <FontSection
            state={projectState}
            onChange={handleStateChange}
          />

          {/* Step 3: Background Selector & Presets */}
          <BackgroundSection
            state={projectState}
            onChange={handleStateChange}
            onClearBackgroundMedia={handleClearBackgroundMedia}
            fileName={fileName}
          />

          {/* Step 4: Music & Soundtrack */}
          <AudioSection
            state={projectState}
            onChange={handleStateChange}
            totalDuration={totalDuration}
          />

          {/* Step 5: Text Mode */}
          <TextModeSection
            state={projectState}
            onChange={handleStateChange}
          />

          {/* Step 6: Animation Style */}
          <AnimationStyleSection
            state={projectState}
            onChange={handleStateChange}
          />

          {/* Step 7: Extra Effects */}
          <EffectsSection
            state={projectState}
            onChange={handleStateChange}
          />

          {/* Step 8: Timing & Speed */}
          <SpeedSection
            state={projectState}
            onChange={handleStateChange}
          />

          {/* Final Step: Video Capture Button at the very bottom */}
          <div className="pt-2 pb-6 space-y-2">
            <button
              onClick={() => setIsFullscreenOpen(true)}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-base shadow-xl shadow-purple-600/30 flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:scale-[1.01] active:scale-98 border border-white/10 group"
            >
              <Video className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>Захват видео</span>
            </button>
            <p className="text-center text-xs text-zinc-400">
              Открывает развернутое превью с функциями захвата Fix Txt, Fix Vid и скачивания
            </p>
          </div>
        </div>
      </main>

      {/* Export Modal */}
      <ExportModal
        progress={exportProgress}
        onClose={() =>
          setExportProgress((p) => ({ ...p, downloadUrl: null, error: null }))
        }
        onRestart={() => {
          setExportProgress({
            isExporting: false,
            progress: 0,
            statusText: '',
            downloadUrl: null,
            fileBlob: null,
            fileExtension: 'webm',
            error: null,
          });
        }}
      />

      {/* Media sandbox kept in viewport to preserve active hardware video decoding in mobile Chrome */}
      <div
        ref={mediaSandboxRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0.001,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: -1,
        }}
        aria-hidden="true"
      />
    </div>
  );
}
