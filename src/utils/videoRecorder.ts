import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import { safeFixWebm } from './safeWebmFix';
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
 * Check if WebCodecs VideoEncoder is available and supports given codec
 */
async function checkVideoEncoderSupport(codec: string, width: number, height: number, fps: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const res = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate: 8_000_000,
      framerate: fps,
    });
    return !!res.supported;
  } catch {
    return false;
  }
}

/**
 * Finds first supported AVC (H.264) codec supported by browser's VideoEncoder
 */
async function findSupportedAvcCodec(width: number, height: number, fps: number): Promise<string | null> {
  const candidates = [
    'avc1.42001f', // Baseline 3.1
    'avc1.420028', // Baseline 4.0
    'avc1.42002a', // Baseline 4.2
    'avc1.4d001f', // Main 3.1
    'avc1.4d0028', // Main 4.0
    'avc1.4d002a', // Main 4.2
    'avc1.4d0033', // Main 5.1
    'avc1.640028', // High 4.0
    'avc1.64002a', // High 4.2
    'avc1.640033', // High 5.1
    'avc1.42e01f', // Constrained Baseline 3.1
    'avc1.42e028', // Constrained Baseline 4.0
    'avc1.42e02a', // Constrained Baseline 4.2
  ];
  for (const c of candidates) {
    if (await checkVideoEncoderSupport(c, width, height, fps)) {
      return c;
    }
  }
  return null;
}

/**
 * Check if WebCodecs AudioEncoder supports AAC or Opus
 */
async function checkAudioEncoderSupport(codec: string, sampleRate: number, numberOfChannels: number): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return false;
  try {
    const res = await AudioEncoder.isConfigSupported({
      codec,
      numberOfChannels: Math.min(2, Math.max(1, numberOfChannels)),
      sampleRate,
      bitrate: 128_000,
    });
    return !!res.supported;
  } catch {
    return false;
  }
}

/**
 * Encodes audio buffer into MP4 AAC muxer using WebCodecs AudioEncoder
 * Crucial: AAC frames MUST be multiples of 1024 samples, otherwise encoders fail!
 */
async function encodeAudioAacWebCodecs(
  audioBuffer: AudioBuffer,
  muxer: Mp4Muxer<Mp4ArrayBufferTarget>,
  targetDurationSeconds: number
): Promise<boolean> {
  try {
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = Math.min(2, audioBuffer.numberOfChannels);

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.warn('AudioEncoder AAC warning:', e),
    });

    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels,
      sampleRate,
      bitrate: 128_000,
    });

    const chunkSize = 1024; // Standard AAC frame size
    const totalTargetSamples = Math.ceil(targetDurationSeconds * sampleRate);
    const totalPaddedSamples = Math.ceil(totalTargetSamples / chunkSize) * chunkSize;

    const channel0 = audioBuffer.getChannelData(0);
    const channel1 = numberOfChannels > 1 ? audioBuffer.getChannelData(1) : channel0;

    let currentSample = 0;
    while (currentSample < totalPaddedSamples) {
      const planarData = new Float32Array(chunkSize * numberOfChannels);

      for (let i = 0; i < chunkSize; i++) {
        const sampleIdx = currentSample + i;
        if (sampleIdx < totalTargetSamples) {
          const srcIdx = sampleIdx % channel0.length;
          planarData[i] = channel0[srcIdx];
          if (numberOfChannels > 1) {
            planarData[chunkSize + i] = channel1[srcIdx];
          }
        } else {
          // Zero padding for trailing AAC frame
          planarData[i] = 0;
          if (numberOfChannels > 1) {
            planarData[chunkSize + i] = 0;
          }
        }
      }

      const timestampMicros = Math.round((currentSample / sampleRate) * 1_000_000);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: chunkSize,
        numberOfChannels,
        timestamp: timestampMicros,
        data: planarData,
      });

      audioEncoder.encode(audioData);
      audioData.close();

      currentSample += chunkSize;
    }

    await audioEncoder.flush();
    audioEncoder.close();
    return true;
  } catch (err) {
    console.warn('AAC Audio encoding failed:', err);
    return false;
  }
}

/**
 * Encodes audio buffer into WebM or MP4 Opus muxer using WebCodecs AudioEncoder
 */
async function encodeAudioOpusWebCodecs(
  audioBuffer: AudioBuffer,
  muxer: Mp4Muxer<Mp4ArrayBufferTarget> | WebmMuxer<WebmArrayBufferTarget>,
  targetDurationSeconds: number
): Promise<boolean> {
  try {
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = Math.min(2, audioBuffer.numberOfChannels);

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.warn('AudioEncoder Opus warning:', e),
    });

    audioEncoder.configure({
      codec: 'opus',
      numberOfChannels,
      sampleRate,
      bitrate: 128_000,
    });

    const chunkSize = 960; // 20ms at 48000Hz or standard Opus frame
    const totalTargetSamples = Math.ceil(targetDurationSeconds * sampleRate);
    const totalPaddedSamples = Math.ceil(totalTargetSamples / chunkSize) * chunkSize;

    const channel0 = audioBuffer.getChannelData(0);
    const channel1 = numberOfChannels > 1 ? audioBuffer.getChannelData(1) : channel0;

    let currentSample = 0;
    while (currentSample < totalPaddedSamples) {
      const planarData = new Float32Array(chunkSize * numberOfChannels);

      for (let i = 0; i < chunkSize; i++) {
        const sampleIdx = currentSample + i;
        if (sampleIdx < totalTargetSamples) {
          const srcIdx = sampleIdx % channel0.length;
          planarData[i] = channel0[srcIdx];
          if (numberOfChannels > 1) {
            planarData[chunkSize + i] = channel1[srcIdx];
          }
        } else {
          planarData[i] = 0;
          if (numberOfChannels > 1) {
            planarData[chunkSize + i] = 0;
          }
        }
      }

      const timestampMicros = Math.round((currentSample / sampleRate) * 1_000_000);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: chunkSize,
        numberOfChannels,
        timestamp: timestampMicros,
        data: planarData,
      });

      audioEncoder.encode(audioData);
      audioData.close();

      currentSample += chunkSize;
    }

    await audioEncoder.flush();
    audioEncoder.close();
    return true;
  } catch (err) {
    console.warn('Opus Audio encoding failed:', err);
    return false;
  }
}

/**
 * Asynchronously seek HTMLVideoElement and await decode to avoid frozen background frames during offline rendering
 */
function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (!Number.isFinite(time) || Math.abs(video.currentTime - time) < 0.03) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      if (timer) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }, 120);
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = time;
  });
}

/**
 * 1. WebCodecs MP4 Export (Frame-by-frame exact rendering + AAC/Opus Audio)
 */
async function exportWithWebCodecsMp4({
  state,
  dimensions,
  safeTotalDuration,
  exportCanvas,
  ctx,
  exportBgElement,
  audioBuffer,
  onProgress,
  targetFormat = 'mp4',
  textTimingMode = 'stretch',
  naturalTextDuration,
  durationOverride,
}: {
  state: VideoProjectState;
  dimensions: { width: number; height: number };
  safeTotalDuration: number;
  exportCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  exportBgElement: HTMLImageElement | HTMLVideoElement | null;
  audioBuffer: AudioBuffer | null;
  onProgress: (progress: ExportProgress) => void;
  targetFormat?: 'mp4' | 'mov' | 'avi';
  textTimingMode?: 'stretch' | 'loop';
  naturalTextDuration?: number;
  durationOverride?: number;
}): Promise<{ downloadUrl: string; blob: Blob; fileExtension: string }> {
  const fps = 30;
  const frameIntervalMicros = Math.round(1_000_000 / fps);
  const totalFrames = Math.max(1, Math.round(safeTotalDuration * fps));

  // Determine supported AVC codec across platforms (Desktop, Android, iOS)
  const avcCodec = await findSupportedAvcCodec(dimensions.width, dimensions.height, fps);
  if (!avcCodec) {
    throw new Error('H.264 VideoEncoder не поддерживается на данном устройстве.');
  }

  // Check AudioEncoder support: prioritize AAC, fallback to Opus
  const hasAudio = !!(audioBuffer && audioBuffer.length > 0);
  let audioCodec: 'aac' | 'opus' | null = null;
  if (hasAudio && audioBuffer) {
    const canAac = await checkAudioEncoderSupport('mp4a.40.2', audioBuffer.sampleRate, audioBuffer.numberOfChannels);
    if (canAac) {
      audioCodec = 'aac';
    } else {
      const canOpus = await checkAudioEncoderSupport('opus', audioBuffer.sampleRate, audioBuffer.numberOfChannels);
      if (canOpus) {
        audioCodec = 'opus';
      }
    }
  }

  const muxer = new Mp4Muxer({
    target: new Mp4ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: dimensions.width,
      height: dimensions.height,
    },
    audio: audioCodec && audioBuffer
      ? {
          codec: audioCodec,
          numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
          sampleRate: audioBuffer.sampleRate,
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

  videoEncoder.configure({
    codec: avcCodec,
    width: dimensions.width,
    height: dimensions.height,
    bitrate: 8_000_000,
    framerate: fps,
  });

  // 1. Encode Audio track first
  if (audioCodec === 'aac' && audioBuffer) {
    onProgress({
      isExporting: true,
      progress: 5,
      statusText: 'Кодирование звуковой дорожки (AAC)...',
      downloadUrl: null,
      fileBlob: null,
      fileExtension: targetFormat,
      error: null,
    });
    const audioSuccess = await encodeAudioAacWebCodecs(audioBuffer, muxer, safeTotalDuration);
    if (!audioSuccess) {
      console.warn('AAC Audio encoding failed, proceeding without audio track');
    }
  } else if (audioCodec === 'opus' && audioBuffer) {
    onProgress({
      isExporting: true,
      progress: 5,
      statusText: 'Кодирование звуковой дорожки (Opus)...',
      downloadUrl: null,
      fileBlob: null,
      fileExtension: targetFormat,
      error: null,
    });
    const audioSuccess = await encodeAudioOpusWebCodecs(audioBuffer, muxer, safeTotalDuration);
    if (!audioSuccess) {
      console.warn('Opus Audio encoding failed, proceeding without audio track');
    }
  }

  particleEngine.reset();

  // 2. Render all video frames sequentially
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    if (encoderError) throw encoderError;

    const frameTime = (frameIndex / totalFrames) * safeTotalDuration;

    if (exportBgElement instanceof HTMLVideoElement && exportBgElement.duration) {
      await seekVideoTo(exportBgElement, frameTime % exportBgElement.duration);
    }

    const renderTime =
      textTimingMode === 'loop' && naturalTextDuration && naturalTextDuration > 0
        ? frameTime % naturalTextDuration
        : frameTime;
    const renderTargetDuration =
      durationOverride && durationOverride > 0 && textTimingMode !== 'loop'
        ? durationOverride
        : undefined;

    renderCanvasFrame({
      ctx,
      state,
      currentTime: renderTime,
      bgMediaElement: exportBgElement,
      dimensions,
      targetDuration: renderTargetDuration,
    });

    const timestamp = frameIndex * frameIntervalMicros;
    const isKeyframe = frameIndex % (fps * 2) === 0;

    const videoFrame = new VideoFrame(exportCanvas, {
      timestamp,
      duration: frameIntervalMicros,
    });

    videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close();

    const pct = Math.min(96, Math.max(5, Math.floor((frameIndex / totalFrames) * 96)));
    if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) {
      onProgress({
        isExporting: true,
        progress: pct,
        statusText: `Рендеринг видео: ${frameTime.toFixed(1)}с / ${safeTotalDuration.toFixed(1)}с (${pct}%)`,
        downloadUrl: null,
        fileBlob: null,
        fileExtension: targetFormat,
        error: null,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (encoderError) throw encoderError;

  onProgress({
    isExporting: true,
    progress: 98,
    statusText: `Финализация ${targetFormat.toUpperCase()} файла...`,
    downloadUrl: null,
    fileBlob: null,
    fileExtension: targetFormat,
    error: null,
  });

  await videoEncoder.flush();
  videoEncoder.close();
  muxer.finalize();

  const buffer = muxer.target.buffer;
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('MP4 Muxer output buffer is 0 bytes.');
  }

  const mimeType = targetFormat === 'mov' ? 'video/quicktime' : 'video/mp4';
  const finalBlob = new Blob([buffer], { type: mimeType });
  const downloadUrl = URL.createObjectURL(finalBlob);

  onProgress({
    isExporting: false,
    progress: 100,
    statusText: 'Готово!',
    downloadUrl,
    fileBlob: finalBlob,
    fileExtension: targetFormat,
    error: null,
  });

  return { downloadUrl, blob: finalBlob, fileExtension: targetFormat };
}

/**
 * 2. WebCodecs WebM Export (VP9/VP8 + Opus Audio)
 */
async function exportWithWebCodecsWebm({
  state,
  dimensions,
  safeTotalDuration,
  exportCanvas,
  ctx,
  exportBgElement,
  audioBuffer,
  onProgress,
  textTimingMode = 'stretch',
  naturalTextDuration,
  durationOverride,
}: {
  state: VideoProjectState;
  dimensions: { width: number; height: number };
  safeTotalDuration: number;
  exportCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  exportBgElement: HTMLImageElement | HTMLVideoElement | null;
  audioBuffer: AudioBuffer | null;
  onProgress: (progress: ExportProgress) => void;
  textTimingMode?: 'stretch' | 'loop';
  naturalTextDuration?: number;
  durationOverride?: number;
}): Promise<{ downloadUrl: string; blob: Blob; fileExtension: string }> {
  const fps = 30;
  const frameIntervalMicros = Math.round(1_000_000 / fps);
  const totalFrames = Math.max(1, Math.round(safeTotalDuration * fps));

  let vpCodec = 'vp09.00.10.08';
  let isVpSupported = await checkVideoEncoderSupport(vpCodec, dimensions.width, dimensions.height, fps);
  if (!isVpSupported) {
    vpCodec = 'vp8';
    isVpSupported = await checkVideoEncoderSupport(vpCodec, dimensions.width, dimensions.height, fps);
  }

  if (!isVpSupported) {
    throw new Error('VP9/VP8 VideoEncoder not supported on this browser.');
  }

  const hasAudio = !!(audioBuffer && audioBuffer.length > 0);
  let canEncodeOpus = false;
  if (hasAudio && audioBuffer) {
    canEncodeOpus = await checkAudioEncoderSupport('opus', audioBuffer.sampleRate, audioBuffer.numberOfChannels);
  }

  const muxer = new WebmMuxer({
    target: new WebmArrayBufferTarget(),
    video: {
      codec: vpCodec.startsWith('vp09') ? 'V_VP9' : 'V_VP8',
      width: dimensions.width,
      height: dimensions.height,
    },
    audio: canEncodeOpus && audioBuffer
      ? {
          codec: 'A_OPUS',
          numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
          sampleRate: audioBuffer.sampleRate,
        }
      : undefined,
    firstTimestampBehavior: 'strict',
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      console.error('WebM VideoEncoder error:', e);
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  videoEncoder.configure({
    codec: vpCodec,
    width: dimensions.width,
    height: dimensions.height,
    bitrate: 8_000_000,
    framerate: fps,
  });

  if (canEncodeOpus && audioBuffer) {
    onProgress({
      isExporting: true,
      progress: 5,
      statusText: 'Кодирование звуковой дорожки (Opus)...',
      downloadUrl: null,
      fileBlob: null,
      fileExtension: 'webm',
      error: null,
    });
    const opusSuccess = await encodeAudioOpusWebCodecs(audioBuffer, muxer, safeTotalDuration);
    if (!opusSuccess) {
      throw new Error('Failed to encode Opus audio stream.');
    }
  }

  particleEngine.reset();

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    if (encoderError) throw encoderError;

    const frameTime = (frameIndex / totalFrames) * safeTotalDuration;

    if (exportBgElement instanceof HTMLVideoElement && exportBgElement.duration) {
      await seekVideoTo(exportBgElement, frameTime % exportBgElement.duration);
    }

    const renderTime =
      textTimingMode === 'loop' && naturalTextDuration && naturalTextDuration > 0
        ? frameTime % naturalTextDuration
        : frameTime;
    const renderTargetDuration =
      durationOverride && durationOverride > 0 && textTimingMode !== 'loop'
        ? durationOverride
        : undefined;

    renderCanvasFrame({
      ctx,
      state,
      currentTime: renderTime,
      bgMediaElement: exportBgElement,
      dimensions,
      targetDuration: renderTargetDuration,
    });

    const timestamp = frameIndex * frameIntervalMicros;
    const isKeyframe = frameIndex % (fps * 2) === 0;

    const videoFrame = new VideoFrame(exportCanvas, {
      timestamp,
      duration: frameIntervalMicros,
    });

    videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close();

    const pct = Math.min(96, Math.max(5, Math.floor((frameIndex / totalFrames) * 96)));
    if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) {
      onProgress({
        isExporting: true,
        progress: pct,
        statusText: `Рендеринг видео: ${frameTime.toFixed(1)}с / ${safeTotalDuration.toFixed(1)}с (${pct}%)`,
        downloadUrl: null,
        fileBlob: null,
        fileExtension: 'webm',
        error: null,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (encoderError) throw encoderError;

  onProgress({
    isExporting: true,
    progress: 98,
    statusText: 'Финализация WebM видео...',
    downloadUrl: null,
    fileBlob: null,
    fileExtension: 'webm',
    error: null,
  });

  await videoEncoder.flush();
  videoEncoder.close();
  muxer.finalize();

  const buffer = muxer.target.buffer;
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('WebM Muxer output buffer is 0 bytes.');
  }

  const finalBlob = new Blob([buffer], { type: 'video/webm' });
  const downloadUrl = URL.createObjectURL(finalBlob);

  onProgress({
    isExporting: false,
    progress: 100,
    statusText: 'Готово!',
    downloadUrl,
    fileBlob: finalBlob,
    fileExtension: 'webm',
    error: null,
  });

  return { downloadUrl, blob: finalBlob, fileExtension: 'webm' };
}

/**
 * 3. Fallback MediaRecorder Export
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
  targetFormat = 'webm',
  textTimingMode = 'stretch',
  naturalTextDuration,
  durationOverride,
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
  targetFormat?: 'mp4' | 'webm' | 'mov' | 'avi';
  textTimingMode?: 'stretch' | 'loop';
  naturalTextDuration?: number;
  durationOverride?: number;
}): Promise<{ downloadUrl: string; blob: Blob; fileExtension: string }> {
  let audioStreamDestination: MediaStreamAudioDestinationNode | null = null;
  let audioContext: AudioContext | null = null;
  let audioBufferSource: AudioBufferSourceNode | null = null;

  if (audioBuffer && audioBuffer.length > 0) {
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioCtxClass();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      audioStreamDestination = audioContext.createMediaStreamDestination();
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(1.0, 0);
      gainNode.connect(audioStreamDestination);

      audioBufferSource = audioContext.createBufferSource();
      audioBufferSource.buffer = audioBuffer;
      audioBufferSource.loop = true;
      audioBufferSource.connect(gainNode);
      audioBufferSource.start(0);
    } catch (e) {
      console.warn('MediaRecorder audio setup warning:', e);
    }
  }

  // Check supported mimeTypes with preference matching user requested format
  let mimeType = 'video/webm;codecs=vp9,opus';
  let fileExt = targetFormat || 'webm';

  if (targetFormat === 'mp4' || targetFormat === 'mov' || targetFormat === 'avi') {
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
      mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
      fileExt = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
      mimeType = 'video/mp4;codecs=avc1';
      fileExt = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
      fileExt = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      mimeType = 'video/webm;codecs=vp9,opus';
      fileExt = 'webm';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      mimeType = 'video/webm;codecs=vp8,opus';
      fileExt = 'webm';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeType = 'video/webm';
      fileExt = 'webm';
    }
  } else {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      mimeType = 'video/webm;codecs=vp9,opus';
      fileExt = 'webm';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      mimeType = 'video/webm;codecs=vp8,opus';
      fileExt = 'webm';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeType = 'video/webm';
      fileExt = 'webm';
    }
  }

  // Attach canvas to DOM offscreen
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
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
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
        } catch {}
      }
      if (audioBufferSource) {
        try {
          audioBufferSource.stop();
        } catch {}
      }
      if (audioContext) audioContext.close().catch(() => {});
    };

    const startRecording = async () => {
      if (exportBgElement instanceof HTMLVideoElement) {
        exportBgElement.currentTime = 0;
        try {
          await exportBgElement.play();
        } catch {}
      }

      mediaRecorder.start(100);
      const startTime = performance.now();

      const loop = () => {
        if (isDone) return;
        const now = performance.now();
        const elapsed = (now - startTime) / 1000;

        if (elapsed >= safeTotalDuration) {
          isDone = true;

          mediaRecorder.onstop = async () => {
            cleanup();
            if (recordedChunks.length === 0) {
              reject(new Error('Запись завершилась без данных (0 байт).'));
              return;
            }
            let blob = new Blob(recordedChunks, { type: mimeType });
            if (blob.size === 0) {
              reject(new Error('Размер записанного файла равен 0 байт.'));
              return;
            }

            // Remux WebM to ensure valid Duration and Cues indexing without corrupting clusters
            if (mimeType.includes('webm')) {
              try {
                blob = await safeFixWebm(blob, safeTotalDuration);
              } catch (fixErr) {
                console.warn('Could not remux WebM in MediaRecorder:', fixErr);
              }
            }

            const outExt = blob.type.includes('mp4') ? 'mp4' : 'webm';
            const url = URL.createObjectURL(blob);
            onProgress({
              isExporting: false,
              progress: 100,
              statusText: 'Готово!',
              downloadUrl: url,
              fileBlob: blob,
              fileExtension: outExt,
              error: null,
            });
            resolve({ downloadUrl: url, blob, fileExtension: outExt });
          };

          try {
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.requestData();
              mediaRecorder.stop();
            }
          } catch (e) {
            cleanup();
            reject(e);
          }
          return;
        }

        const renderTime =
          textTimingMode === 'loop' && naturalTextDuration && naturalTextDuration > 0
            ? elapsed % naturalTextDuration
            : elapsed;
        const renderTargetDuration =
          durationOverride && textTimingMode !== 'loop' ? durationOverride : undefined;

        renderCanvasFrame({
          ctx,
          state,
          currentTime: renderTime,
          bgMediaElement: exportBgElement,
          dimensions,
          targetDuration: renderTargetDuration,
        });

        const pct = Math.min(98, Math.max(3, Math.floor((elapsed / safeTotalDuration) * 98)));
        onProgress({
          isExporting: true,
          progress: pct,
          statusText: `Запись видео: ${elapsed.toFixed(1)}с / ${safeTotalDuration.toFixed(1)}с (${pct}%)`,
          downloadUrl: null,
          fileBlob: null,
          fileExtension: fileExt,
          error: null,
        });

        animId = requestAnimationFrame(loop);
      };

      animId = requestAnimationFrame(loop);
    };

    startRecording().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

/**
 * Universal Master Export function:
 * Tries MP4 WebCodecs -> WebM WebCodecs -> MediaRecorder
 */
export async function exportVideo({
  state,
  bgMediaElement,
  onProgress,
  targetFormat = 'mp4',
  durationOverride,
  textTimingMode = 'stretch',
}: {
  state: VideoProjectState;
  bgMediaElement: HTMLImageElement | HTMLVideoElement | null;
  onProgress: (progress: ExportProgress) => void;
  targetFormat?: 'mp4' | 'webm' | 'mov' | 'avi';
  durationOverride?: number;
  textTimingMode?: 'stretch' | 'loop';
}): Promise<{ downloadUrl: string; blob: Blob; fileExtension: string }> {
  const dimensions = getDimensionsForAspect(state.aspectRatio);
  const { totalDuration: naturalTextDuration } = splitTextIntoSegments(
    state.rawText,
    state.textMode,
    state.speedMultiplier,
    state.pauseBetweenSeconds,
    undefined,
    state.animationStyle
  );

  const safeTotalDuration = Math.max(1.0, durationOverride || naturalTextDuration);

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = dimensions.width;
  exportCanvas.height = dimensions.height;
  const ctx = exportCanvas.getContext('2d', { alpha: false, desynchronized: true });

  if (!ctx) {
    throw new Error('Не удалось создать 2D контекст рендеринга.');
  }

  let exportBgElement: HTMLImageElement | HTMLVideoElement | null = bgMediaElement;
  let dedicatedVideo: HTMLVideoElement | null = null;

  if (state.bgType === 'video' && state.bgMediaUrl) {
    onProgress({
      isExporting: true,
      progress: 2,
      statusText: 'Подготовка видеофона...',
      downloadUrl: null,
      fileBlob: null,
      fileExtension: targetFormat,
      error: null,
    });

    try {
      dedicatedVideo = await prepareExportVideoElement(state.bgMediaUrl);
      exportBgElement = dedicatedVideo;
    } catch {
      exportBgElement = bgMediaElement;
    }
  }

  // Pre-decode audio tracks for dual-layer audio mixing
  let bgVideoAudioBuffer: AudioBuffer | null = null;
  const isVideoAudioActive =
    (state.bgType === 'video' || state.bgMediaType === 'video') &&
    !!state.bgMediaUrl &&
    state.audio.videoAudioEnabled !== false &&
    (state.audio.videoVolume ?? 0.8) > 0;

  if (isVideoAudioActive && state.bgMediaUrl) {
    try {
      onProgress({
        isExporting: true,
        progress: 3,
        statusText: 'Извлечение звука из видеофона...',
        downloadUrl: null,
        fileBlob: null,
        fileExtension: targetFormat,
        error: null,
      });
      bgVideoAudioBuffer = await audioMixer.prepareBackgroundVideoAudioBuffer(state.bgMediaUrl);
    } catch (err) {
      console.warn('Could not extract background video audio:', err);
    }
  }

  let musicAudioBuffer: AudioBuffer | null = null;
  const isMusicActive =
    state.audio.enabled &&
    (state.audio.sourceType === 'generator' || state.audio.sourceType === 'file') &&
    (state.audio.volume ?? 0.7) > 0;

  if (isMusicActive) {
    try {
      musicAudioBuffer = await audioMixer.prepareAudioBuffer(state.audio, safeTotalDuration);
    } catch (err) {
      console.warn('Could not prepare music audio buffer:', err);
    }
  }

  // Final audio buffer composition with simultaneous dual-track mixing
  let audioBuffer: AudioBuffer | null = null;
  const videoVolume = state.audio.videoVolume ?? 0.8;
  const musicVolume = state.audio.volume ?? 0.7;

  if (bgVideoAudioBuffer && musicAudioBuffer) {
    // Both Video Audio (voice) and Background Music are active: mix them together!
    audioBuffer = await mixAudioBuffers(
      bgVideoAudioBuffer,
      videoVolume,
      musicAudioBuffer,
      musicVolume,
      safeTotalDuration
    );
  } else if (bgVideoAudioBuffer) {
    // Only original video audio
    audioBuffer = await mixAudioBuffers(
      bgVideoAudioBuffer,
      videoVolume,
      null,
      0,
      safeTotalDuration
    );
  } else if (musicAudioBuffer) {
    // Only music soundtrack
    audioBuffer = musicAudioBuffer;
  }

  const hasWebCodecs =
    typeof window !== 'undefined' &&
    'VideoEncoder' in window &&
    'VideoFrame' in window &&
    typeof VideoEncoder === 'function' &&
    typeof VideoFrame === 'function';

  const hasVideoBg =
    (state.bgType === 'video' && !!state.bgMediaUrl) ||
    exportBgElement instanceof HTMLVideoElement;

  // CRITICAL FIX FOR VIDEO BACKGROUNDS:
  // When the background is a video (HTMLVideoElement), synchronous WebCodecs loops cannot
  // step through HTMLVideoElement frames without freezing the video on a single frame.
  // exportWithMediaRecorder plays the video in real-time, completely eliminating frozen frames!
  if (hasVideoBg) {
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
      targetFormat,
      textTimingMode,
      naturalTextDuration,
      durationOverride,
    });
  }

  // 1. If user explicitly requested WebM
  if (targetFormat === 'webm') {
    if (hasWebCodecs) {
      try {
        return await exportWithWebCodecsWebm({
          state,
          dimensions,
          safeTotalDuration,
          exportCanvas,
          ctx,
          exportBgElement,
          audioBuffer,
          onProgress,
          textTimingMode,
          naturalTextDuration,
          durationOverride,
        });
      } catch (webmErr) {
        console.warn('WebM WebCodecs export bypassed:', webmErr);
      }
    }
  } else {
    // 2. MP4 / MOV / AVI: Try WebCodecs MP4 first!
    if (hasWebCodecs) {
      try {
        return await exportWithWebCodecsMp4({
          state,
          dimensions,
          safeTotalDuration,
          exportCanvas,
          ctx,
          exportBgElement,
          audioBuffer,
          onProgress,
          targetFormat,
          textTimingMode,
          naturalTextDuration,
          durationOverride,
        });
      } catch (mp4Err) {
        console.warn('MP4 WebCodecs export bypassed, attempting WebM pipeline:', mp4Err);
      }
    }
  }

  // 3. Fallback to WebCodecs WebM if MP4 failed
  if (hasWebCodecs && targetFormat !== 'webm') {
    try {
      return await exportWithWebCodecsWebm({
        state,
        dimensions,
        safeTotalDuration,
        exportCanvas,
        ctx,
        exportBgElement,
        audioBuffer,
        onProgress,
        textTimingMode,
        naturalTextDuration,
      });
    } catch (webmErr) {
      console.warn('WebM WebCodecs export bypassed:', webmErr);
    }
  }

  // 4. Fallback to MediaRecorder
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
    targetFormat,
    textTimingMode,
    naturalTextDuration,
    durationOverride,
  });
}
