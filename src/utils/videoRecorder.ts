import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { VideoProjectState } from '../types';
import { getDimensionsForAspect, particleEngine, renderCanvasFrame } from './canvasRenderer';
import { splitTextIntoSegments } from './textSplitter';
import { audioMixer, mixAudioBuffers } from './audioMixer';

export interface ExportProgress {
  isExporting: boolean;
  progress: number; // 0 to 100
  statusText: string;
  downloadUrl: string | null;
  fileBlob: Blob | null;
  fileExtension: string;
  error: string | null;
}

/**
 * Initializes and prepares a dedicated offscreen video element for export.
 */
function prepareExportVideoElement(mediaUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    if (!mediaUrl.startsWith('blob:') && !mediaUrl.startsWith('data:')) {
      video.crossOrigin = 'anonymous';
    }
    video.src = mediaUrl;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = false;
    video.preload = 'auto';

    const onCanPlay = () => {
      video.removeEventListener('canplaythrough', onCanPlay);
      video.removeEventListener('loadeddata', onCanPlay);
      video.currentTime = 0;
      resolve(video);
    };

    video.addEventListener('canplaythrough', onCanPlay, { once: true });
    video.addEventListener('loadeddata', onCanPlay, { once: true });

    video.onerror = () => {
      reject(new Error('Не удалось загрузить фоновое видео для экспорта.'));
    };

    if (video.readyState >= 2) {
      video.currentTime = 0;
      resolve(video);
    }
  });
}

/**
 * Encodes audio buffer into mp4-muxer using WebCodecs AudioEncoder
 */
async function encodeAudioWithWebCodecs(
  audioBuffer: AudioBuffer,
  muxer: Muxer<ArrayBufferTarget>,
  targetDurationSeconds: number
): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return false;
  }

  try {
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = Math.min(2, audioBuffer.numberOfChannels);

    let isSupported = false;
    try {
      const config = {
        codec: 'mp4a.40.2',
        numberOfChannels,
        sampleRate,
        bitrate: 128_000,
      };
      const support = await AudioEncoder.isConfigSupported(config);
      isSupported = !!support.supported;
    } catch {
      isSupported = true;
    }

    if (!isSupported) return false;

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.warn('AudioEncoder warning:', e),
    });

    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels,
      sampleRate,
      bitrate: 128_000,
    });

    // Chunk size in sample frames
    const chunkSize = 2048;
    const totalTargetSamples = Math.ceil(targetDurationSeconds * sampleRate);
    const channel0 = audioBuffer.getChannelData(0);
    const channel1 = numberOfChannels > 1 ? audioBuffer.getChannelData(1) : channel0;

    let currentSample = 0;
    while (currentSample < totalTargetSamples) {
      const remaining = totalTargetSamples - currentSample;
      const currentChunkSize = Math.min(chunkSize, remaining);

      // Interleaved Float32 buffer
      const planarData = new Float32Array(currentChunkSize * numberOfChannels);

      if (numberOfChannels === 1) {
        for (let i = 0; i < currentChunkSize; i++) {
          const srcIdx = (currentSample + i) % channel0.length;
          planarData[i] = channel0[srcIdx];
        }
      } else {
        // Planar arrangement: channel 0 then channel 1
        for (let i = 0; i < currentChunkSize; i++) {
          const srcIdx = (currentSample + i) % channel0.length;
          planarData[i] = channel0[srcIdx];
          planarData[currentChunkSize + i] = channel1[srcIdx];
        }
      }

      const timestampMicros = Math.round((currentSample / sampleRate) * 1_000_000);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: currentChunkSize,
        numberOfChannels,
        timestamp: timestampMicros,
        data: planarData,
      });

      audioEncoder.encode(audioData);
      audioData.close();

      currentSample += currentChunkSize;
    }

    await audioEncoder.flush();
    audioEncoder.close();
    return true;
  } catch (err) {
    console.warn('WebCodecs audio encoding failed:', err);
    return false;
  }
}

/**
 * WebCodecs Frame-By-Frame High Quality MP4 Export (100% timing accuracy)
 */
async function exportWithWebCodecs({
  state,
  dimensions,
  safeTotalDuration,
  exportCanvas,
  ctx,
  exportBgElement,
  audioBuffer,
  onProgress,
}: {
  state: VideoProjectState;
  dimensions: { width: number; height: number };
  safeTotalDuration: number;
  exportCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  exportBgElement: HTMLImageElement | HTMLVideoElement | null;
  audioBuffer: AudioBuffer | null;
  onProgress: (progress: ExportProgress) => void;
}): Promise<{ downloadUrl: string; blob: Blob }> {
  const fps = 30;
  const frameIntervalMicros = Math.round(1_000_000 / fps);
  const totalFrames = Math.max(1, Math.round(safeTotalDuration * fps));

  // Determine AVC (H.264) codec string
  let codecString = 'avc1.42001f'; // Baseline 3.1
  if (dimensions.height >= 1080) {
    codecString = 'avc1.4d002a'; // Main 4.2
  }

  // Check supported VideoEncoder config
  let videoConfig = {
    codec: codecString,
    width: dimensions.width,
    height: dimensions.height,
    bitrate: 8_000_000,
    framerate: fps,
  };

  try {
    const isSupported = await VideoEncoder.isConfigSupported(videoConfig);
    if (!isSupported.supported) {
      videoConfig.codec = 'avc1.42001e';
    }
  } catch {
    // proceed
  }

  const hasAudio = !!(audioBuffer && audioBuffer.length > 0);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: dimensions.width,
      height: dimensions.height,
    },
    audio: hasAudio
      ? {
          codec: 'aac',
          numberOfChannels: Math.min(2, audioBuffer!.numberOfChannels),
          sampleRate: audioBuffer!.sampleRate,
        }
      : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      console.error('VideoEncoder error:', e);
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  videoEncoder.configure(videoConfig);

  // Encode Audio Track first if present
  if (hasAudio && audioBuffer) {
    onProgress({
      isExporting: true,
      progress: 5,
      statusText: 'Обработка и сведение аудиодорожки...',
      downloadUrl: null,
      fileBlob: null,
      fileExtension: 'mp4',
      error: null,
    });
    await encodeAudioWithWebCodecs(audioBuffer, muxer, safeTotalDuration);
  }

  particleEngine.reset();

  // Render every frame sequentially with exact timestamp
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    if (encoderError) {
      throw encoderError;
    }

    const frameTime = (frameIndex / totalFrames) * safeTotalDuration;

    // Background video seek if present
    if (exportBgElement instanceof HTMLVideoElement && exportBgElement.duration) {
      exportBgElement.currentTime = frameTime % exportBgElement.duration;
    }

    // Render frame to canvas
    renderCanvasFrame({
      ctx,
      state,
      currentTime: frameTime,
      bgMediaElement: exportBgElement,
      dimensions,
    });

    const timestamp = frameIndex * frameIntervalMicros;
    const isKeyframe = frameIndex % (fps * 2) === 0;

    const videoFrame = new VideoFrame(exportCanvas, {
      timestamp,
      duration: frameIntervalMicros,
    });

    videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close();

    // Update progress
    const pct = Math.min(96, Math.max(5, Math.floor((frameIndex / totalFrames) * 96)));
    if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) {
      onProgress({
        isExporting: true,
        progress: pct,
        statusText: `Рендеринг видео: ${frameTime.toFixed(1)}с / ${safeTotalDuration.toFixed(1)}с (${pct}%)`,
        downloadUrl: null,
        fileBlob: null,
        fileExtension: 'mp4',
        error: null,
      });
      // Yield to event loop to keep UI smooth and prevent thread starvation
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (encoderError) {
    throw encoderError;
  }

  onProgress({
    isExporting: true,
    progress: 98,
    statusText: 'Финализация MP4 контейнера...',
    downloadUrl: null,
    fileBlob: null,
    fileExtension: 'mp4',
    error: null,
  });

  await videoEncoder.flush();
  videoEncoder.close();
  muxer.finalize();

  const buffer = muxer.target.buffer;
  const finalBlob = new Blob([buffer], { type: 'video/mp4' });
  const downloadUrl = URL.createObjectURL(finalBlob);

  onProgress({
    isExporting: false,
    progress: 100,
    statusText: 'Готово!',
    downloadUrl,
    fileBlob: finalBlob,
    fileExtension: 'mp4',
    error: null,
  });

  return { downloadUrl, blob: finalBlob };
}

/**
 * Fallback MediaRecorder Export when WebCodecs is not supported.
 */
async function exportWithMediaRecorder({
  state,
  dimensions,
  safeTotalDuration,
  exportCanvas,
  ctx,
  exportBgElement,
  dedicatedVideo,
  audioBuffer,
  onProgress,
}: {
  state: VideoProjectState;
  dimensions: { width: number; height: number };
  safeTotalDuration: number;
  exportCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  exportBgElement: HTMLImageElement | HTMLVideoElement | null;
  dedicatedVideo: HTMLVideoElement | null;
  audioBuffer: AudioBuffer | null;
  onProgress: (progress: ExportProgress) => void;
}): Promise<{ downloadUrl: string; blob: Blob }> {
  let audioStreamDestination: MediaStreamAudioDestinationNode | null = null;
  let audioContext: AudioContext | null = null;
  let audioBufferSource: AudioBufferSourceNode | null = null;

  if (audioBuffer && audioBuffer.length > 0) {
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioCtxClass();
      audioStreamDestination = audioContext.createMediaStreamDestination();
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(1.0, 0);
      gainNode.connect(audioStreamDestination);

      audioBufferSource = audioContext.createBufferSource();
      audioBufferSource.buffer = audioBuffer;
      audioBufferSource.loop = true;
      audioBufferSource.connect(gainNode);
    } catch {
      // ignore
    }
  }

  let mimeType = 'video/mp4';
  let fileExt = 'mp4';

  if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
    mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
    fileExt = 'mp4';
  } else if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
    fileExt = 'mp4';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
    mimeType = 'video/webm;codecs=vp9,opus';
    fileExt = 'webm';
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    mimeType = 'video/webm';
    fileExt = 'webm';
  }

  // Attach canvas to DOM offscreen to ensure compositor frame pumping across all browsers
  exportCanvas.style.position = 'fixed';
  exportCanvas.style.top = '-99999px';
  exportCanvas.style.left = '-99999px';
  exportCanvas.style.pointerEvents = 'none';
  exportCanvas.style.opacity = '0';
  document.body.appendChild(exportCanvas);

  const fps = 30;
  const canvasStream = exportCanvas.captureStream(fps);
  const combinedStream = new MediaStream();
  canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

  if (audioStreamDestination) {
    audioStreamDestination.stream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));
  }

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const recordedChunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  particleEngine.reset();

  return new Promise((resolve, reject) => {
    let animId: number | null = null;
    let isDone = false;

    const cleanup = () => {
      isDone = true;
      if (animId !== null) cancelAnimationFrame(animId);
      if (exportCanvas.parentNode) {
        exportCanvas.parentNode.removeChild(exportCanvas);
      }
      if (dedicatedVideo) {
        try {
          dedicatedVideo.pause();
          dedicatedVideo.src = '';
        } catch {
          // ignore
        }
      }
      if (audioBufferSource) {
        try {
          audioBufferSource.stop();
        } catch {
          // ignore
        }
      }
      if (audioContext) audioContext.close().catch(() => {});
    };

    const startRecording = async () => {
      if (exportBgElement instanceof HTMLVideoElement) {
        exportBgElement.currentTime = 0;
        try {
          await exportBgElement.play();
        } catch {
          // ignore
        }
      }

      if (audioBufferSource && audioContext) {
        if (audioContext.state === 'suspended') await audioContext.resume();
        audioBufferSource.start(0);
      }

      mediaRecorder.start(100);
      const startTime = performance.now();

      const loop = () => {
        if (isDone) return;
        const now = performance.now();
        const elapsed = (now - startTime) / 1000;

        if (elapsed >= safeTotalDuration) {
          isDone = true;
          mediaRecorder.onstop = () => {
            cleanup();
            const blob = new Blob(recordedChunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            onProgress({
              isExporting: false,
              progress: 100,
              statusText: 'Готово!',
              downloadUrl: url,
              fileBlob: blob,
              fileExtension: fileExt,
              error: null,
            });
            resolve({ downloadUrl: url, blob });
          };
          mediaRecorder.stop();
          return;
        }

        renderCanvasFrame({
          ctx,
          state,
          currentTime: elapsed,
          bgMediaElement: exportBgElement,
          dimensions,
        });

        const pct = Math.min(98, Math.max(3, Math.floor((elapsed / safeTotalDuration) * 98)));
        onProgress({
          isExporting: true,
          progress: pct,
          statusText: `Запись: ${elapsed.toFixed(1)}с / ${safeTotalDuration.toFixed(1)}с (${pct}%)`,
          downloadUrl: null,
          fileBlob: null,
          fileExtension: fileExt,
          error: null,
        });

        animId = requestAnimationFrame(loop);
      };

      animId = requestAnimationFrame(loop);
    };

    startRecording().catch(reject);
  });
}

export async function exportVideo({
  state,
  bgMediaElement,
  onProgress,
}: {
  state: VideoProjectState;
  bgMediaElement: HTMLImageElement | HTMLVideoElement | null;
  onProgress: (progress: ExportProgress) => void;
}): Promise<{ downloadUrl: string; blob: Blob }> {
  const dimensions = getDimensionsForAspect(state.aspectRatio);
  const { totalDuration } = splitTextIntoSegments(
    state.rawText,
    state.textMode,
    state.speedMultiplier,
    state.pauseBetweenSeconds
  );

  const safeTotalDuration = Math.max(1.5, totalDuration);

  // Setup offscreen canvas with target resolution
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = dimensions.width;
  exportCanvas.height = dimensions.height;
  const ctx = exportCanvas.getContext('2d', { alpha: false, desynchronized: true });

  if (!ctx) {
    throw new Error('Не удалось инициализировать 2D контекст для рендеринга.');
  }

  // Dedicated background video element
  let exportBgElement: HTMLImageElement | HTMLVideoElement | null = bgMediaElement;
  let dedicatedVideo: HTMLVideoElement | null = null;

  if (state.bgType === 'video' && state.bgMediaUrl) {
    onProgress({
      isExporting: true,
      progress: 2,
      statusText: 'Подготовка фонового видео...',
      downloadUrl: null,
      fileBlob: null,
      fileExtension: 'mp4',
      error: null,
    });

    try {
      dedicatedVideo = await prepareExportVideoElement(state.bgMediaUrl);
      exportBgElement = dedicatedVideo;
    } catch {
      exportBgElement = bgMediaElement;
    }
  }

  // Pre-decode audio buffers:
  // 1. Check if background video has sound
  let bgVideoAudioBuffer: AudioBuffer | null = null;
  if ((state.bgType === 'video' || state.bgMediaType === 'video') && state.bgMediaUrl) {
    try {
      onProgress({
        isExporting: true,
        progress: 3,
        statusText: 'Извлечение звука из фонового видео...',
        downloadUrl: null,
        fileBlob: null,
        fileExtension: 'mp4',
        error: null,
      });
      bgVideoAudioBuffer = await audioMixer.prepareBackgroundVideoAudioBuffer(state.bgMediaUrl);
    } catch (err) {
      console.warn('Could not extract background video audio:', err);
    }
  }

  // 2. Check if soundtrack / music is enabled
  let musicAudioBuffer: AudioBuffer | null = null;
  if (state.audio.enabled && state.audio.sourceType !== 'none' && state.audio.volume > 0) {
    try {
      musicAudioBuffer = await audioMixer.prepareAudioBuffer(state.audio, safeTotalDuration);
    } catch (err) {
      console.warn('Could not prepare music audio buffer:', err);
    }
  }

  // 3. Combine / mix audio tracks (video sound + soundtrack)
  let audioBuffer: AudioBuffer | null = null;
  if (bgVideoAudioBuffer && musicAudioBuffer) {
    onProgress({
      isExporting: true,
      progress: 4,
      statusText: 'Сведение звука видеофона и музыки...',
      downloadUrl: null,
      fileBlob: null,
      fileExtension: 'mp4',
      error: null,
    });
    audioBuffer = await mixAudioBuffers(
      bgVideoAudioBuffer,
      1.0,
      musicAudioBuffer,
      state.audio.volume,
      safeTotalDuration
    );
  } else if (bgVideoAudioBuffer) {
    audioBuffer = bgVideoAudioBuffer;
  } else if (musicAudioBuffer) {
    audioBuffer = musicAudioBuffer;
  }

  // Check if WebCodecs VideoEncoder is available for frame-accurate rendering
  const hasWebCodecs =
    typeof window !== 'undefined' &&
    'VideoEncoder' in window &&
    'VideoFrame' in window &&
    typeof VideoEncoder === 'function' &&
    typeof VideoFrame === 'function';

  if (hasWebCodecs) {
    try {
      return await exportWithWebCodecs({
        state,
        dimensions,
        safeTotalDuration,
        exportCanvas,
        ctx,
        exportBgElement,
        audioBuffer,
        onProgress,
      });
    } catch (webCodecsErr) {
      console.warn('WebCodecs export encountered an issue, falling back to MediaRecorder:', webCodecsErr);
    }
  }

  // Fallback to MediaRecorder
  return await exportWithMediaRecorder({
    state,
    dimensions,
    safeTotalDuration,
    exportCanvas,
    ctx,
    exportBgElement,
    dedicatedVideo,
    audioBuffer,
    onProgress,
  });
}

