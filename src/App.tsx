import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Download } from 'lucide-react';
import { Header } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { BackgroundSection } from './components/BackgroundSection';
import { TextInputSection, EditingFocusInfo } from './components/TextInputSection';
import { AudioSection } from './components/AudioSection';
import { FontSection } from './components/FontSection';
import { TextModeSection } from './components/TextModeSection';
import { AnimationStyleSection } from './components/AnimationStyleSection';
import { EffectsSection } from './components/EffectsSection';
import { SpeedSection } from './components/SpeedSection';
import { ExportModal } from './components/ExportModal';
import { UploadModal } from './components/UploadModal';
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
  bgOverlayOpacity: 0.20,

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
    particles: false,
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
  const [fileName, setFileName] = useState<string | null>(() => {
    const saved = loadProjectState();
    return saved?.savedBgFileName || null;
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isMediaLoading, setIsMediaLoading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [editingInfo, setEditingInfo] = useState<EditingFocusInfo | null>(null);

  const [bgMediaElement, setBgMediaElement] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const bgMediaElementRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  bgMediaElementRef.current = bgMediaElement;
  const hasRestoredMediaRef = useRef<boolean>(false);
  const handleFileUploadRef = useRef<(file: File, isRestoration?: boolean) => void>(() => {});

  const mediaUrlRef = useRef<string | null>(null);
  const lastUploadedFileRef = useRef<File | null>(null);

  // Compute total duration
  const { totalDuration } = splitTextIntoSegments(
    projectState.rawText,
    projectState.textMode,
    projectState.speedMultiplier,
    projectState.pauseBetweenSeconds,
    undefined,
    projectState.animationStyle
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

  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  const handleStateChange = useCallback((patch: Partial<VideoProjectState>) => {
    setProjectState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Automatic debounced persistence of user's project settings & text
  useEffect(() => {
    const timer = setTimeout(() => {
      saveProjectState(projectState, { fileName });
    }, 200);
    return () => clearTimeout(timer);
  }, [projectState, fileName]);

  // Handle media file upload (rock-solid, clean, instant video and image loading)
  const handleFileUpload = useCallback(async (file: File, isRestoration = false) => {
    setUploadError(null);
    setUploadSuccess(false);
    setIsMediaLoading(true);
    lastUploadedFileRef.current = file;

    // Release any previous video element safely
    if (bgMediaElementRef.current instanceof HTMLVideoElement) {
      try {
        bgMediaElementRef.current.pause();
        bgMediaElementRef.current.onloadedmetadata = null;
        bgMediaElementRef.current.onloadeddata = null;
        bgMediaElementRef.current.oncanplay = null;
        bgMediaElementRef.current.onerror = null;
        bgMediaElementRef.current.src = '';
      } catch {}
    }
    bgMediaElementRef.current = null;
    setBgMediaElement(null);

    if (mediaUrlRef.current) {
      try {
        URL.revokeObjectURL(mediaUrlRef.current);
      } catch {}
      mediaUrlRef.current = null;
    }

    const isVideo =
      file.type.startsWith('video/') ||
      /\.(mp4|webm|mov|m4v|mkv|avi|3gp)$/i.test(file.name);

    const blobUrl = URL.createObjectURL(file);
    mediaUrlRef.current = blobUrl;

    if (isVideo) {
      const video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('muted', '');
      video.preload = 'auto';

      let isReady = false;
      let pollTimer: any = null;

      const onReady = () => {
        if (isReady) return;
        isReady = true;
        if (pollTimer) clearInterval(pollTimer);

        setFileName(file.name);
        setIsMediaLoading(false);
        setUploadError(null);
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2000);

        if (!isRestoration) {
          saveMediaFile('background', file, file.name, file.type || 'video/mp4');
        }

        video.play().catch(() => {});
        bgMediaElementRef.current = video;
        setBgMediaElement(video);
        setProjectState((prev) => ({
          ...prev,
          bgType: 'video',
          bgMediaUrl: blobUrl,
          bgMediaType: 'video',
          audio: {
            ...prev.audio,
            videoAudioEnabled: prev.audio.videoAudioEnabled ?? true,
            videoVolume: prev.audio.videoVolume ?? 0.8,
          },
        }));
      };

      video.onloadedmetadata = onReady;
      video.onloadeddata = onReady;
      video.oncanplay = onReady;
      video.oncanplaythrough = onReady;
      video.onplay = onReady;
      video.onplaying = onReady;
      video.ontimeupdate = () => {
        if (video.currentTime > 0) onReady();
      };

      video.onerror = () => {
        if (video.readyState >= 1 && video.videoWidth > 0) {
          onReady();
        }
      };

      video.src = blobUrl;

      if (video.readyState >= 1 && video.videoWidth > 0) {
        onReady();
      } else {
        let count = 0;
        pollTimer = setInterval(() => {
          count++;
          if (isReady) {
            clearInterval(pollTimer);
            return;
          }
          if (video.readyState >= 1 || video.videoWidth > 0 || video.duration > 0) {
            onReady();
            clearInterval(pollTimer);
          } else if (count > 60) {
            clearInterval(pollTimer);
            if (!isReady) {
              setIsMediaLoading(false);
              setUploadError('Не удалось загрузить видео. Попробуйте еще раз или выберите другой файл.');
            }
          }
        }, 100);
      }
    } else {
      const img = new Image();
      let isReady = false;

      const onImageReady = () => {
        if (isReady) return;
        isReady = true;
        setFileName(file.name);
        setIsMediaLoading(false);
        setUploadError(null);
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2000);

        if (!isRestoration) {
          saveMediaFile('background', file, file.name, file.type || 'image/jpeg');
        }

        bgMediaElementRef.current = img;
        setBgMediaElement(img);
        setProjectState((prev) => ({
          ...prev,
          bgType: 'image',
          bgMediaUrl: blobUrl,
          bgMediaType: 'image',
        }));
      };

      img.onload = onImageReady;
      img.onerror = () => {
        setIsMediaLoading(false);
        setUploadError('Не удалось загрузить изображение.');
      };

      img.src = blobUrl;
      if (img.complete && img.naturalWidth > 0) {
        onImageReady();
      }
    }
  }, []);

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
          const restoredName = bgRecord.fileName || 'custom-background';
          setFileName(restoredName);
          const restoredFile = new File([bgRecord.blob], restoredName, {
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
      try {
        bgMediaElementRef.current.pause();
        bgMediaElementRef.current.src = '';
      } catch {}
    }
    bgMediaElementRef.current = null;
    if (mediaUrlRef.current) {
      try {
        URL.revokeObjectURL(mediaUrlRef.current);
      } catch {}
      mediaUrlRef.current = null;
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
    const userFormat = 'webm';

    try {
      setExportProgress({
        isExporting: true,
        progress: 0,
        statusText: 'Подготовка к созданию WebM видео...',
        downloadUrl: null,
        fileBlob: null,
        fileExtension: 'webm',
        error: null,
      });

      const hasVideo = bgMediaElement instanceof HTMLVideoElement && bgMediaElement.duration > 0;
      const vidDuration =
        hasVideo && projectState.syncWithVideo ? (bgMediaElement as HTMLVideoElement).duration : undefined;

      const result = await exportVideo({
        state: projectState,
        bgMediaElement,
        targetFormat: 'webm',
        durationOverride: vidDuration,
        textTimingMode: projectState.textLoopMode || 'stretch',
        onProgress: (progress) => {
          setExportProgress(progress);
        },
      });

      if (result && result.downloadUrl) {
        // Automatically start file download in browser
        const ext = result.fileExtension || 'webm';
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
        fileExtension: 'webm',
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

  const activeBgFileName =
    (projectState.bgType === 'video' || projectState.bgType === 'image') && bgMediaElement
      ? fileName
      : null;

  return (
    <div className="min-h-screen bg-[#0F0F12] text-zinc-100 flex flex-col font-sans selection:bg-purple-600/30 selection:text-purple-200 overflow-x-clip w-full max-w-[100vw]">
      {/* Top Header with File Upload Action */}
      <Header
        onFileUpload={handleFileUpload}
        fileName={activeBgFileName}
        onClearFile={handleClearBackgroundMedia}
        onResetProject={handleResetAll}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
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
            editingInfo={editingInfo}
          />
        </div>

        {/* Detailed Controls Column (Below Preview on Mobile, Right on Desktop) */}
        <div className="order-2 lg:order-2 lg:col-span-7 space-y-4 sm:space-y-5">
          {/* Step 1: Text Input */}
          <TextInputSection
            state={projectState}
            onChange={handleStateChange}
            onEditingFocus={setEditingInfo}
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
            fileName={activeBgFileName}
            onOpenUploadModal={() => setIsUploadModalOpen(true)}
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

      {/* Upload Modal with 35 MB Reminder */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onFileUpload={handleFileUpload}
        currentFileName={activeBgFileName}
      />
    </div>
  );
}
