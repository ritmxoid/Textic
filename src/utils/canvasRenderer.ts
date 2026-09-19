import { BACKGROUND_PRESETS } from '../data/presets';
import { VideoProjectState } from '../types';
import { splitTextIntoSegments } from './textSplitter';

export interface CanvasDimensions {
  width: number;
  height: number;
}

export function getDimensionsForAspect(aspectRatio: string): CanvasDimensions {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1920, height: 1080 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '9:16':
    default:
      return { width: 1080, height: 1920 };
  }
}

// Easing functions
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Particle state for canvas effects
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  rotation: number;
  life: number;
  maxLife: number;
}

class ParticleEngine {
  sparkles: Particle[] = [];
  fireParticles: Particle[] = [];
  lastTime: number = 0;

  updateAndDrawSparkles(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    time: number
  ) {
    // Generate new sparkles
    if (this.sparkles.length < 35 && bounds.width > 0) {
      const margin = 50;
      this.sparkles.push({
        x: bounds.x - margin + Math.random() * (bounds.width + margin * 2),
        y: bounds.y - margin + Math.random() * (bounds.height + margin * 2),
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        size: 8 + Math.random() * 18,
        alpha: 0.1,
        color: Math.random() > 0.3 ? '#fde047' : '#ffffff',
        rotation: Math.random() * Math.PI,
        life: 0,
        maxLife: 1.2 + Math.random() * 1.5,
      });
    }

    const dt = 0.03;
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const p = this.sparkles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.sparkles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += 0.05;

      const progress = p.life / p.maxLife;
      // Fade in and out
      p.alpha = Math.sin(progress * Math.PI) * 0.95;

      // Draw 4-point star sparkle
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;

      const r = p.size;
      ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const radius = j % 2 === 0 ? r : r * 0.25;
        const angle = (j * Math.PI) / 4;
        const sx = Math.cos(angle) * radius;
        const sy = Math.sin(angle) * radius;
        if (j === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  updateAndDrawFire(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    time: number
  ) {
    if (bounds.width <= 0) return;

    // Spawn fire particles along the bottom baseline of the text
    if (this.fireParticles.length < 60) {
      for (let i = 0; i < 3; i++) {
        const px = bounds.x + Math.random() * bounds.width;
        const py = bounds.y + bounds.height - 10 + (Math.random() - 0.5) * 20;
        this.fireParticles.push({
          x: px,
          y: py,
          vx: (Math.random() - 0.5) * 45,
          vy: -60 - Math.random() * 90,
          size: 14 + Math.random() * 24,
          alpha: 0.9,
          color: Math.random() > 0.6 ? '#fbbf24' : Math.random() > 0.3 ? '#f97316' : '#ef4444',
          rotation: Math.random() * Math.PI,
          life: 0,
          maxLife: 0.8 + Math.random() * 0.8,
        });
      }
    }

    const dt = 0.03;
    for (let i = this.fireParticles.length - 1; i >= 0; i--) {
      const p = this.fireParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.fireParticles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt + Math.sin(time * 10 + p.y * 0.05) * 2;
      p.y += p.vy * dt;
      p.size = Math.max(1, p.size * 0.96);

      const progress = p.life / p.maxLife;
      p.alpha = (1 - progress) * 0.85;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  reset() {
    this.sparkles = [];
    this.fireParticles = [];
  }
}

export const particleEngine = new ParticleEngine();

export function renderCanvasFrame({
  ctx,
  state,
  currentTime,
  bgMediaElement,
  dimensions,
}: {
  ctx: CanvasRenderingContext2D;
  state: VideoProjectState;
  currentTime: number;
  bgMediaElement: HTMLImageElement | HTMLVideoElement | null;
  dimensions: CanvasDimensions;
}) {
  const { width, height } = dimensions;

  // 1. Reset canvas
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // 2. Calculate Text Segments & Timeline
  const { segments } = splitTextIntoSegments(
    state.rawText,
    state.textMode,
    state.speedMultiplier,
    state.pauseBetweenSeconds
  );

  // Find active segment for current time
  let activeSegmentIndex = segments.findIndex(
    (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime + 0.15
  );

  // Keep showing final segment if in pause before loop restart
  if (activeSegmentIndex === -1 && segments.length > 0 && currentTime >= segments[segments.length - 1].startTime) {
    activeSegmentIndex = segments.length - 1;
  }

  const activeSegment = activeSegmentIndex >= 0 ? segments[activeSegmentIndex] : null;

  // 3. Draw Background with active segment timing
  drawBackground(
    ctx,
    state,
    bgMediaElement,
    width,
    height,
    currentTime,
    activeSegment,
    activeSegmentIndex,
    segments.length
  );

  // 4. Draw Darkening Overlay
  if (state.bgOverlayOpacity > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${state.bgOverlayOpacity})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (activeSegment) {
    const isLastSegment = segments.length > 0 && activeSegment === segments[segments.length - 1];

    drawTextSegment({
      ctx,
      segment: activeSegment,
      state,
      currentTime,
      canvasWidth: width,
      canvasHeight: height,
      isLastSegment,
    });
  }

  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: VideoProjectState,
  bgMedia: HTMLImageElement | HTMLVideoElement | null,
  width: number,
  height: number,
  time: number,
  activeSegment: any = null,
  activeSegmentIndex: number = 0,
  totalSegmentsCount: number = 1
) {
  if (bgMedia && (state.bgType === 'image' || state.bgType === 'video')) {
    const isVideo = bgMedia instanceof HTMLVideoElement;
    const mediaWidth = isVideo ? (bgMedia as HTMLVideoElement).videoWidth : (bgMedia as HTMLImageElement).naturalWidth;
    const mediaHeight = isVideo ? (bgMedia as HTMLVideoElement).videoHeight : (bgMedia as HTMLImageElement).naturalHeight;

    if (mediaWidth > 0 && mediaHeight > 0) {
      // Calculate "cover" scale
      const scale = Math.max(width / mediaWidth, height / mediaHeight);
      const drawW = mediaWidth * scale;
      const drawH = mediaHeight * scale;
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;

      try {
        ctx.drawImage(bgMedia, drawX, drawY, drawW, drawH);
        return;
      } catch (err) {
        console.warn('Unable to draw background frame:', err);
      }
    }
  }

  // Fallback to preset
  const preset =
    BACKGROUND_PRESETS.find((p) => p.id === state.bgPresetId) ||
    BACKGROUND_PRESETS[0];

  if (preset.id === 'notebook-flip') {
    // 1. Блокнот с металлической пружиной слева и анимацией перелистывания страницы на каждое предложение/фразу
    // Базовый фон стола (элегантный теплый деревянный/нейтральный стол)
    const deskGrad = ctx.createLinearGradient(0, 0, width, height);
    deskGrad.addColorStop(0, '#1c1917');
    deskGrad.addColorStop(0.5, '#292524');
    deskGrad.addColorStop(1, '#0c0a09');
    ctx.fillStyle = deskGrad;
    ctx.fillRect(0, 0, width, height);

    // Параметры листа блокнота
    const padMarginX = width * 0.04;
    const padMarginY = height * 0.04;
    const padWidth = width - padMarginX * 2;
    const padHeight = height - padMarginY * 2;
    const springWidth = Math.max(48, width * 0.065);
    const pageX = padMarginX + springWidth * 0.6;
    const pageWidth = padWidth - springWidth * 0.6;

    // Тень под блокнотом
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 35;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 15;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(pageX, padMarginY, pageWidth, padHeight);
    ctx.restore();

    // Задние страницы блокнота (создают толщину пачки)
    for (let i = 4; i >= 1; i--) {
      ctx.fillStyle = i % 2 === 0 ? '#e2e8f0' : '#cbd5e1';
      ctx.fillRect(pageX + i * 2, padMarginY + i * 2, pageWidth - i * 2, padHeight - i * 2);
    }

    // Базовый статичный лист бумаги
    const drawPageContent = (targetX: number, targetW: number, shadowOpacity: number = 0) => {
      ctx.save();
      // Цвет бумаги
      const paperGrad = ctx.createLinearGradient(targetX, 0, targetX + targetW, 0);
      paperGrad.addColorStop(0, '#f1f5f9');
      paperGrad.addColorStop(0.08, '#ffffff');
      paperGrad.addColorStop(0.95, '#ffffff');
      paperGrad.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = paperGrad;
      ctx.fillRect(targetX, padMarginY, targetW, padHeight);

      // Горизонтальные линейки блокнота
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.6)';
      ctx.lineWidth = 1.5;
      const lineStep = 48;
      ctx.beginPath();
      for (let y = padMarginY + 80; y < padMarginY + padHeight - 40; y += lineStep) {
        ctx.moveTo(targetX + 20, y);
        ctx.lineTo(targetX + targetW - 20, y);
      }
      ctx.stroke();

      if (shadowOpacity > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
        ctx.fillRect(targetX, padMarginY, targetW, padHeight);
      }
      ctx.restore();
    };

    // Отрисовываем нижнюю страницу (новую открывающуюся страницу)
    drawPageContent(pageX, pageWidth, 0);

    // Рассчитываем анимацию перелистывания страницы в сторону пружинки (справа налево)
    if (activeSegment) {
      const segStart = activeSegment.startTime;
      const timeSinceStart = time - segStart;
      const flipDuration = 0.55; // 550ms на плавный переворот страницы

      if (timeSinceStart >= 0 && timeSinceStart < flipDuration) {
        const rawProgress = timeSinceStart / flipDuration;
        const progress = easeOutCubic(rawProgress);

        // Правый край листа перемещается справа налево к пружинке (от pageX + pageWidth к pageX)
        const turningPageWidth = (1 - progress) * pageWidth;
        const currentEdgeX = pageX + turningPageWidth;

        if (turningPageWidth > 4) {
          ctx.save();
          // Тень на нижний лист от поднимающейся страницы
          const shadowWidth = Math.min(80, (pageWidth - turningPageWidth) * 0.8 + 25);
          const shadowGrad = ctx.createLinearGradient(currentEdgeX, 0, currentEdgeX + shadowWidth, 0);
          shadowGrad.addColorStop(0, `rgba(0, 0, 0, ${0.45 * (1 - progress)})`);
          shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = shadowGrad;
          ctx.fillRect(currentEdgeX, padMarginY, shadowWidth, padHeight);

          // Верхний перелистывающийся лист (сжимается к пружинке слева)
          drawPageContent(pageX, turningPageWidth, progress * 0.22);

          // Светотень цилиндрического изгиба на самом краю перелистываемого листа
          const curlWidth = Math.min(50, turningPageWidth * 0.45);
          const curlGrad = ctx.createLinearGradient(currentEdgeX - curlWidth, 0, currentEdgeX, 0);
          curlGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          curlGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.85)');
          curlGrad.addColorStop(1, 'rgba(100, 116, 139, 0.4)');
          ctx.fillStyle = curlGrad;
          ctx.fillRect(currentEdgeX - curlWidth, padMarginY, curlWidth, padHeight);

          ctx.restore();
        }
      }
    }

    // Металлическая пружина (спираль) слева поверх страниц
    ctx.save();
    const coilCount = Math.floor(padHeight / 36);
    const coilStep = padHeight / coilCount;

    for (let c = 0; c < coilCount; c++) {
      const cy = padMarginY + c * coilStep + coilStep * 0.5;
      const cx = padMarginX + springWidth * 0.45;
      const rx = springWidth * 0.4;
      const ry = 11;

      // Отверстие в бумаге (пробивка дырокола)
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(cx + rx * 0.55, cy, 6, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Тень кольца пружины
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(cx + 3, cy + 3, rx, ry, -0.3, 0, Math.PI * 2);
      ctx.stroke();

      // Металлическое блестящее кольцо (хром / серебро)
      const ringGrad = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
      ringGrad.addColorStop(0, '#64748b');
      ringGrad.addColorStop(0.3, '#f8fafc');
      ringGrad.addColorStop(0.5, '#cbd5e1');
      ringGrad.addColorStop(0.8, '#475569');
      ringGrad.addColorStop(1, '#94a3b8');

      ctx.strokeStyle = ringGrad;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, -0.3, 0, Math.PI * 2);
      ctx.stroke();

      // Яркий металлический блик
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx - 3, cy - 2, rx * 0.8, ry * 0.7, -0.3, Math.PI * 0.9, Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();

    // Номер страницы / легкая нумерация внизу справа
    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${Math.max(16, width * 0.018)}px sans-serif`;
    ctx.textAlign = 'right';
    const pageNum = (activeSegmentIndex >= 0 ? activeSegmentIndex + 1 : 1);
    const totalPages = Math.max(1, totalSegmentsCount);
    ctx.fillText(`Стр. ${pageNum} / ${totalPages}`, padMarginX + padWidth - 30, padMarginY + padHeight - 25);
    ctx.restore();
  } else if (preset.id === 'flying-questions') {
    // 2. Парящие 3D знаки вопроса (?)
    const qGrad = ctx.createLinearGradient(0, 0, 0, height);
    qGrad.addColorStop(0, '#090a1a');
    qGrad.addColorStop(0.5, '#1e1035');
    qGrad.addColorStop(1, '#05030a');
    ctx.fillStyle = qGrad;
    ctx.fillRect(0, 0, width, height);

    // Сетка парящих знаков
    const count = 24;
    const symbols = ['?', '¿', '?'];
    const colors = ['#c084fc', '#e879f9', '#818cf8', '#38bdf8', '#fb7185'];

    ctx.save();
    for (let i = 0; i < count; i++) {
      const speed = 75 + (i % 6) * 22;
      const size = 32 + (i % 7) * 14;
      const xSway = Math.sin(time * 1.6 + i * 1.9) * 45;
      const x = ((i * 140 + xSway) % (width + 100)) - 50;
      const y = height - ((time * speed + i * 160) % (height + 180));
      const col = colors[i % colors.length];
      const char = symbols[i % symbols.length];
      const rot = Math.sin(time * 1.2 + i) * 0.35;
      const alpha = Math.min(1, Math.max(0.18, Math.sin((y / height) * Math.PI) * 0.9));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${size}px "Montserrat", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 3D объемная тень
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillText(char, 4, 4);

      // Неоновое свечение
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 20;
      ctx.fillText(char, 0, 0);

      // Блик
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = alpha * 0.65;
      ctx.fillText(char, -1, -1);

      ctx.restore();
    }
    ctx.restore();
  } else if (preset.id === 'flying-exclamations') {
    // 3. Парящие динамичные восклицательные знаки (!)
    const exGrad = ctx.createLinearGradient(0, 0, 0, height);
    exGrad.addColorStop(0, '#1f0606');
    exGrad.addColorStop(0.5, '#450a0a');
    exGrad.addColorStop(1, '#0c0202');
    ctx.fillStyle = exGrad;
    ctx.fillRect(0, 0, width, height);

    const count = 26;
    const colors = ['#facc15', '#fbbf24', '#f97316', '#ef4444', '#f43f5e'];

    ctx.save();
    for (let i = 0; i < count; i++) {
      const speed = 95 + (i % 5) * 30;
      const size = 36 + (i % 6) * 16;
      const xSway = Math.sin(time * 2.2 + i * 1.4) * 35;
      const x = ((i * 135 + xSway) % (width + 80)) - 40;
      const y = height - ((time * speed + i * 150) % (height + 200));
      const col = colors[i % colors.length];
      const rot = Math.sin(time * 2.5 + i) * 0.2;
      const alpha = Math.min(1, Math.max(0.2, Math.sin((y / height) * Math.PI) * 0.95));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${size}px "Arial Black", "Montserrat", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Тень
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillText('!', 3, 5);

      // Огненное сияние
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 24;
      ctx.fillText('!', 0, 0);

      // Яркий центр
      ctx.fillStyle = '#fffbeb';
      ctx.globalAlpha = alpha * 0.75;
      ctx.fillText('!', -1, -1);

      ctx.restore();
    }
    ctx.restore();
  } else if (preset.id === 'flying-kisses') {
    // 4. Парящие поцелуи и смайлики (💋 😘 ✨)
    const kissGrad = ctx.createLinearGradient(0, 0, 0, height);
    kissGrad.addColorStop(0, '#2d0612');
    kissGrad.addColorStop(0.5, '#500724');
    kissGrad.addColorStop(1, '#18020a');
    ctx.fillStyle = kissGrad;
    ctx.fillRect(0, 0, width, height);

    const count = 22;
    const kissIcons = ['💋', '😘', '💕', '💋', '💖'];

    ctx.save();
    for (let i = 0; i < count; i++) {
      const speed = 70 + (i % 6) * 20;
      const size = 30 + (i % 5) * 12;
      const xSway = Math.sin(time * 1.4 + i * 1.8) * 50;
      const x = ((i * 155 + xSway) % (width + 80)) - 40;
      const y = height - ((time * speed + i * 170) % (height + 180));
      const icon = kissIcons[i % kissIcons.length];
      const rot = Math.sin(time * 1.8 + i) * 0.3;
      const pulse = 1 + Math.sin(time * 4 + i) * 0.12;
      const alpha = Math.min(1, Math.max(0.2, Math.sin((y / height) * Math.PI) * 0.9));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = alpha;
      ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 18;
      ctx.fillText(icon, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  } else if (preset.id === 'flying-currency') {
    // 5. Парящие символы валют: $, €, ¥, ₽ в золотых и изумрудных тонах
    const moneyGrad = ctx.createLinearGradient(0, 0, 0, height);
    moneyGrad.addColorStop(0, '#022115');
    moneyGrad.addColorStop(0.5, '#064e3b');
    moneyGrad.addColorStop(1, '#01140c');
    ctx.fillStyle = moneyGrad;
    ctx.fillRect(0, 0, width, height);

    const count = 28;
    const currencies = ['$', '€', '¥', '₽', '$', '£'];
    const moneyColors = ['#fbbf24', '#facc15', '#34d399', '#4ade80', '#eab308'];

    ctx.save();
    for (let i = 0; i < count; i++) {
      const speed = 80 + (i % 6) * 24;
      const size = 34 + (i % 6) * 14;
      const xSway = Math.sin(time * 1.7 + i * 1.6) * 40;
      const x = ((i * 130 + xSway) % (width + 90)) - 45;
      const y = height - ((time * speed + i * 160) % (height + 200));
      const col = moneyColors[i % moneyColors.length];
      const symbol = currencies[i % currencies.length];
      const rot = Math.sin(time * 1.5 + i) * 0.28;
      const alpha = Math.min(1, Math.max(0.2, Math.sin((y / height) * Math.PI) * 0.95));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${size}px "Montserrat", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Объемная золотая тень
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillText(symbol, 3, 4);

      // Свечение валюты
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 22;
      ctx.fillText(symbol, 0, 0);

      // Глянцевый блик монеты
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillText(symbol, -1, -1);

      ctx.restore();
    }
    ctx.restore();
  } else if (preset.id === 'clean-white') {
    // Чисто белый лист с микро-текстурой бумаги
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Легкая виньетка по краям листа для объема
    const paperGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.4,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.85
    );
    paperGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    paperGrad.addColorStop(1, 'rgba(226, 232, 240, 0.45)');
    ctx.fillStyle = paperGrad;
    ctx.fillRect(0, 0, width, height);
  } else if (preset.id === 'old-parchment') {
    // 2. Старый свиток / античный пергамент
    // Базовый градиент состаренной пожелтевшей бумаги
    const parchmentGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.25,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75
    );
    parchmentGrad.addColorStop(0, '#f9f4e8');
    parchmentGrad.addColorStop(0.5, '#eddcb5');
    parchmentGrad.addColorStop(0.85, '#d4b47a');
    parchmentGrad.addColorStop(1, '#82592a');
    ctx.fillStyle = parchmentGrad;
    ctx.fillRect(0, 0, width, height);

    // Винтажные волокна и патина
    ctx.save();
    for (let i = 0; i < 35; i++) {
      const px = ((i * 383.7) % width);
      const py = ((i * 541.3) % height);
      const pr = 40 + ((i * 19) % 120);
      const stainGrad = ctx.createRadialGradient(px, py, 5, px, py, pr);
      stainGrad.addColorStop(0, 'rgba(166, 124, 64, 0.12)');
      stainGrad.addColorStop(0.7, 'rgba(191, 149, 90, 0.05)');
      stainGrad.addColorStop(1, 'rgba(191, 149, 90, 0)');
      ctx.fillStyle = stainGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Тонкая обожженная рамка вокруг свитка
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(92, 58, 26, 0.35)';
    ctx.strokeRect(7, 7, width - 14, height - 14);
    ctx.restore();
  } else if (preset.id === 'notebook-grid') {
    // 3. Тетрадный лист в клетку
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const gridSize = 40; // Размер клетки
    const marginX = Math.round(width * 0.14); // Красные поля тетради

    // Синяя сетка клеток
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.75)'; // Светло-голубые линии
    ctx.beginPath();
    for (let x = 0; x <= width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Красная вертикальная черта полей
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.beginPath();
    ctx.moveTo(marginX, 0);
    ctx.lineTo(marginX, height);
    ctx.stroke();
    ctx.restore();
  } else if (preset.id === 'flying-hearts') {
    // 4. Парящие красные сердечки
    // Романтический фон
    const heartBg = ctx.createLinearGradient(0, 0, 0, height);
    heartBg.addColorStop(0, '#26040d');
    heartBg.addColorStop(0.5, '#5c0b20');
    heartBg.addColorStop(1, '#1a0309');
    ctx.fillStyle = heartBg;
    ctx.fillRect(0, 0, width, height);

    // Отрисовка поднимающихся сердец
    const count = 28;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const speed = 70 + (i % 7) * 25;
      const size = 22 + (i % 5) * 14;
      const xOffset = Math.sin(time * 1.5 + i * 1.7) * 45;
      const x = ((i * 127.3 + xOffset) % (width + 60)) - 30;
      const rawY = height - ((time * speed + i * 140) % (height + 120));
      const y = rawY;
      const alpha = Math.min(1, Math.max(0.15, Math.sin((y / height) * Math.PI) * 0.85));

      ctx.save();
      ctx.translate(x, y);
      const rot = Math.sin(time * 2 + i) * 0.25;
      ctx.rotate(rot);
      ctx.scale(size / 30, size / 30);
      ctx.globalAlpha = alpha;

      // Отрисовка векторного сердца через Bezier-кривые
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.bezierCurveTo(-15, -28, -32, -6, 0, 24);
      ctx.bezierCurveTo(32, -6, 15, -28, 0, -10);
      ctx.closePath();

      const hGrad = ctx.createLinearGradient(0, -20, 0, 24);
      hGrad.addColorStop(0, '#fb7185');
      hGrad.addColorStop(0.5, '#f43f5e');
      hGrad.addColorStop(1, '#be123c');
      ctx.fillStyle = hGrad;
      ctx.shadowColor = '#e11d48';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  } else if (preset.id === 'flying-balloons') {
    // 5. Летающие праздничные воздушные шарики
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(0.5, '#1e293b');
    skyGrad.addColorStop(1, '#020617');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    const balloonColors = ['#f43f5e', '#38bdf8', '#a855f7', '#fbbf24', '#34d399', '#f97316'];
    const balloonCount = 20;

    ctx.save();
    for (let i = 0; i < balloonCount; i++) {
      const speed = 90 + (i % 6) * 30;
      const radiusX = 26 + (i % 4) * 8;
      const radiusY = radiusX * 1.25;
      const xSway = Math.sin(time * 1.8 + i * 2.1) * 35;
      const x = ((i * 180 + xSway) % (width + 80)) - 40;
      const y = height - ((time * speed + i * 210) % (height + 250));
      const col = balloonColors[i % balloonColors.length];

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(time * 1.5 + i) * 0.12);

      // Шарик (эллипс)
      ctx.beginPath();
      ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.88;
      ctx.fill();

      // Блик на шарике
      ctx.beginPath();
      ctx.ellipse(-radiusX * 0.35, -radiusY * 0.35, radiusX * 0.25, radiusY * 0.2, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fill();

      // Узелок снизу
      ctx.beginPath();
      ctx.moveTo(-5, radiusY);
      ctx.lineTo(5, radiusY);
      ctx.lineTo(0, radiusY + 8);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();

      // Ниточка от шарика
      ctx.beginPath();
      ctx.moveTo(0, radiusY + 8);
      const stringWave = Math.sin(time * 3 + i) * 8;
      ctx.quadraticCurveTo(stringWave, radiusY + 35, 0, radiusY + 65);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  } else if (preset.id === 'stary-sky') {
    // 6. Звёздное небо с яркими мерцающими звездами и созвездиями
    const nightGrad = ctx.createRadialGradient(
      width / 2,
      height * 0.3,
      100,
      width / 2,
      height / 2,
      Math.max(width, height)
    );
    nightGrad.addColorStop(0, '#110e38');
    nightGrad.addColorStop(0.4, '#090821');
    nightGrad.addColorStop(0.8, '#030712');
    nightGrad.addColorStop(1, '#000000');
    ctx.fillStyle = nightGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // 70 звезд разной величины и мерцания
    for (let i = 0; i < 70; i++) {
      const sx = (i * 197.3) % width;
      const sy = (i * 311.9) % height;
      const pulse = Math.sin(time * 4 + i * 2.5) * 0.5 + 0.5;
      const isBigStar = i % 7 === 0;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.globalAlpha = 0.3 + pulse * 0.7;

      if (isBigStar) {
        // 4-лучевая сияющая звезда
        const r = 5 + pulse * 4;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#67e8f9';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.moveTo(0, -r * 2);
        ctx.quadraticCurveTo(0, 0, r * 2, 0);
        ctx.quadraticCurveTo(0, 0, 0, r * 2);
        ctx.quadraticCurveTo(0, 0, -r * 2, 0);
        ctx.quadraticCurveTo(0, 0, 0, -r * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 1.2 + (i % 3) * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = i % 4 === 0 ? '#fde047' : i % 3 === 0 ? '#93c5fd' : '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 6;
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  } else if (preset.id === 'gradient-smoke') {
    // 7. Разноцветный градиентный дым / неоновые вихри
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Несколько плавающих цветных дымовых центров
    const smokePuffs = [
      { color: 'rgba(168, 85, 247, 0.45)', speed: 0.7, xMult: 0.3, yMult: 0.4, r: width * 0.6 },
      { color: 'rgba(236, 72, 153, 0.4)', speed: 0.9, xMult: 0.7, yMult: 0.3, r: width * 0.55 },
      { color: 'rgba(56, 189, 248, 0.4)', speed: 0.6, xMult: 0.5, yMult: 0.7, r: width * 0.65 },
      { color: 'rgba(34, 197, 94, 0.35)', speed: 0.8, xMult: 0.2, yMult: 0.8, r: width * 0.5 },
      { color: 'rgba(249, 115, 22, 0.35)', speed: 1.1, xMult: 0.8, yMult: 0.6, r: width * 0.55 },
    ];

    smokePuffs.forEach((puff, idx) => {
      const px = width * puff.xMult + Math.sin(time * puff.speed + idx) * (width * 0.25);
      const py = height * puff.yMult + Math.cos(time * puff.speed * 0.8 + idx * 1.5) * (height * 0.2);
      const rad = ctx.createRadialGradient(px, py, 20, px, py, puff.r);
      rad.addColorStop(0, puff.color);
      rad.addColorStop(0.6, puff.color.replace('0.', '0.1'));
      rad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(px, py, puff.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  } else if (preset.id === 'cosmic-dark') {
    // Cosmic space gradient with twinkling stars
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      50,
      width / 2,
      height / 2,
      Math.max(width, height)
    );
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#030712');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle star field
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 137.5) % width);
      const sy = ((i * 243.1) % height);
      const twinkle = Math.sin(time * 3 + i) * 0.4 + 0.6;
      ctx.globalAlpha = twinkle * 0.65;
      ctx.beginPath();
      ctx.arc(sx, sy, (i % 3) + 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // Linear dynamic gradient
    const angle = time * 0.1;
    const x1 = width / 2 + Math.cos(angle) * (width / 2);
    const y1 = height / 2 + Math.sin(angle) * (height / 2);
    const x2 = width / 2 - Math.cos(angle) * (width / 2);
    const y2 = height / 2 - Math.sin(angle) * (height / 2);

    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    const colors = preset.colors;
    colors.forEach((col, idx) => {
      grad.addColorStop(idx / (colors.length - 1), col);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
}

interface TextLayoutResult {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  totalHeight: number;
  maxLineWidth: number;
}

function calculateTextLayout(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  maxWidth: number,
  maxHeight: number,
  baseFontSize: number,
  fontFamily: string,
  isUppercase: boolean
): TextLayoutResult {
  const text = isUppercase ? rawText.toUpperCase() : rawText;
  let fontSize = baseFontSize;
  const minFontSize = 24;

  while (fontSize >= minFontSize) {
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    const lineHeight = fontSize * 1.28;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    let isTooWide = false;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordWidth = ctx.measureText(word).width;
      if (wordWidth > maxWidth) {
        isTooWide = true;
        break;
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    const totalHeight = lines.length * lineHeight;

    if (!isTooWide && totalHeight <= maxHeight) {
      let maxLineWidth = 0;
      lines.forEach((l) => {
        const w = ctx.measureText(l).width;
        if (w > maxLineWidth) maxLineWidth = w;
      });

      return {
        lines,
        fontSize,
        lineHeight,
        totalHeight,
        maxLineWidth,
      };
    }

    fontSize = Math.floor(fontSize * 0.9);
  }

  // Fallback if very tight
  ctx.font = `bold ${minFontSize}px ${fontFamily}`;
  const lineHeight = minFontSize * 1.25;
  const lines = [text.slice(0, 30)];
  return {
    lines,
    fontSize: minFontSize,
    lineHeight,
    totalHeight: lineHeight,
    maxLineWidth: maxWidth,
  };
}

function drawTextSegment({
  ctx,
  segment,
  state,
  currentTime,
  canvasWidth,
  canvasHeight,
  isLastSegment = false,
}: {
  ctx: CanvasRenderingContext2D;
  segment: { text: string; words: string[]; startTime: number; endTime: number; duration: number };
  state: VideoProjectState;
  currentTime: number;
  canvasWidth: number;
  canvasHeight: number;
  isLastSegment?: boolean;
}) {
  const safeMarginX = canvasWidth * 0.08;
  const maxWidth = canvasWidth - safeMarginX * 2;
  const maxHeight = canvasHeight * 0.7;

  // Calculate layout
  const layout = calculateTextLayout(
    ctx,
    segment.text,
    maxWidth,
    maxHeight,
    state.fontSize,
    state.fontFamily,
    state.isUppercase
  );

  const elapsed = Math.max(0, currentTime - segment.startTime);
  
  // Animation duration depends directly on speedMultiplier and animation style
  let animDuration: number;
  if (state.animationStyle === 'typewriter') {
    // Typewriter: letters reveal throughout ~75% of the phrase duration
    animDuration = Math.max(0.3, segment.duration * 0.75);
  } else if (state.animationStyle === 'words') {
    // Word-by-word: reveals throughout ~70% of the phrase duration
    animDuration = Math.max(0.3, segment.duration * 0.70);
  } else if (state.animationStyle === 'glitch') {
    // Glitch entrance: energetic electric arrival with jitter
    const entrance = 0.65 / Math.max(0.3, state.speedMultiplier);
    animDuration = Math.min(segment.duration * 0.85, Math.max(0.2, entrance));
  } else {
    // Fade / Slide / Zoom: entrance duration is inversely proportional to speedMultiplier
    const entrance = 0.65 / Math.max(0.3, state.speedMultiplier);
    animDuration = Math.min(segment.duration * 0.85, Math.max(0.15, entrance));
  }

  const progress = Math.min(1, elapsed / animDuration);

  // Author details (displayed ONLY on the final phrase, word, or sentence of the quote)
  const rawAuthor = state.authorText ? state.authorText.trim() : '';
  const hasAuthor = isLastSegment && rawAuthor.length > 0;
  // Author size is ~82% of main quote font size (twice as large as original 40%), clearly visible while smaller than main text
  const authorFontSize = Math.max(32, Math.min(96, Math.round(layout.fontSize * 0.82)));
  const authorGap = Math.max(22, Math.round(layout.fontSize * 0.42));
  const authorHeight = hasAuthor ? authorGap + authorFontSize * 1.3 : 0;
  const totalCombinedHeight = layout.totalHeight + authorHeight;

  // Position calculations
  // Support granular vertical percentage (15% to 85%), with fallback to position preset
  let posYRatio = 0.5;
  if (typeof state.textPositionY === 'number' && Number.isFinite(state.textPositionY)) {
    posYRatio = Math.max(0.12, Math.min(0.88, state.textPositionY / 100));
  } else if (state.textPosition === 'top') {
    posYRatio = 0.25;
  } else if (state.textPosition === 'bottom') {
    posYRatio = 0.75;
  }

  const targetCenterY = canvasHeight * posYRatio;
  const startY = targetCenterY - totalCombinedHeight / 2 + layout.fontSize * 0.8;
  const textCenterY = targetCenterY;

  let textCenterX = canvasWidth / 2;
  if (state.textAlign === 'left') {
    textCenterX = safeMarginX + layout.maxLineWidth / 2;
  } else if (state.textAlign === 'right') {
    textCenterX = canvasWidth - safeMarginX - layout.maxLineWidth / 2;
  }

  ctx.save();

  // Animation Transformations
  let alpha = 1;
  let offsetY = 0;
  let scale = 1;

  switch (state.animationStyle) {
    case 'fade':
      alpha = easeOutCubic(progress);
      break;
    case 'slide':
      alpha = easeOutCubic(progress);
      offsetY = (1 - easeOutCubic(progress)) * 80;
      break;
    case 'zoom':
      alpha = easeOutCubic(progress);
      scale = 0.35 + 0.65 * easeOutBack(progress);
      break;
    case 'glitch': {
      const baseAlpha = easeOutCubic(progress);
      // High-frequency electric stutter: flickers on and off rapidly during entrance
      const flickerPulse = Math.sin(currentTime * 75) * Math.cos(currentTime * 43);
      const isStutterDip = progress < 0.8 && flickerPulse < -0.3;
      alpha = isStutterDip ? baseAlpha * 0.35 : baseAlpha;

      // Small vertical tremor during entrance
      if (progress < 1) {
        offsetY = Math.sin(currentTime * 65) * 3 * (1 - progress);
      }
      break;
    }
    case 'words':
      // Progressively reveal words
      break;
    case 'typewriter':
      // Typewriter string slicing
      break;
  }

  // Secondary Effects: Glow Pulse
  if (state.effects.glow) {
    const pulse = Math.sin(currentTime * 6) * 0.25 + 0.85;
    alpha *= pulse;
  }

  // Apply matrix translation & scaling around center of text
  ctx.translate(canvasWidth / 2, textCenterY + offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-canvasWidth / 2, -(textCenterY + offsetY));

  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `bold ${layout.fontSize}px ${state.fontFamily}`;
  ctx.textAlign = state.textAlign;
  ctx.textBaseline = 'alphabetic';

  // Apply Shadow effect if enabled
  if (state.effects.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 12;
    ctx.shadowBlur = 24;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // Text bounds for particle generators
  const bounds = {
    x: textCenterX - layout.maxLineWidth / 2,
    y: startY - layout.fontSize * 0.8,
    width: layout.maxLineWidth,
    height: totalCombinedHeight + layout.fontSize * 0.4,
  };

  // Determine what text to draw for typewriter or word-by-word
  let linesToDraw = layout.lines;

  if (state.animationStyle === 'typewriter') {
    const fullCombined = layout.lines.join(' ');
    const charCount = Math.floor(fullCombined.length * progress);
    const visibleCombined = fullCombined.slice(0, charCount);

    // Cursor blink: show if typing is in progress
    const showCursor = Math.sin(currentTime * 12) > 0;
    const withCursor = visibleCombined + (showCursor && progress < 1 ? ' |' : '');

    // Reconstruct lines
    linesToDraw = [];
    let remaining = withCursor;
    for (let i = 0; i < layout.lines.length; i++) {
      const lineLen = layout.lines[i].length;
      if (remaining.length <= 0) break;
      const lineSlice = remaining.slice(0, lineLen);
      linesToDraw.push(lineSlice);
      remaining = remaining.slice(lineLen).trimStart();
    }
  } else if (state.animationStyle === 'words') {
    const allWords = segment.words;
    const wordCount = Math.max(1, Math.ceil(allWords.length * progress));
    const activeWordsList = allWords.slice(0, wordCount).map((w) =>
      state.isUppercase ? w.toUpperCase() : w
    );

    // Draw only the revealed words
    const joined = activeWordsList.join(' ');
    linesToDraw = [];
    let rem = joined;
    for (let i = 0; i < layout.lines.length; i++) {
      const lineLen = layout.lines[i].length;
      if (rem.length <= 0) break;
      linesToDraw.push(rem.slice(0, lineLen));
      rem = rem.slice(lineLen).trimStart();
    }
  }

  // Draw lines of main text
  linesToDraw.forEach((line, index) => {
    const lineY = startY + index * layout.lineHeight + offsetY;
    let lineX = canvasWidth / 2;
    if (state.textAlign === 'left') lineX = safeMarginX;
    if (state.textAlign === 'right') lineX = canvasWidth - safeMarginX;

    // Glitch / Electric Jitter calculations
    let glitchJitterX = 0;
    let glitchJitterY = 0;
    let glitchIntensity = 0;

    if (state.animationStyle === 'glitch') {
      // Entrance surge (higher during initial reveal)
      const entranceSurge = Math.max(0, 1 - progress) * 1.6;

      // Periodic electrical discharge surge every ~1.6 seconds (sparks and buzzes for ~0.24s)
      const cycle = (currentTime * 0.62) % 1;
      const isPeriodicSurge = cycle < 0.15;
      const periodicSurge = isPeriodicSurge
        ? Math.sin((cycle / 0.15) * Math.PI) * 0.95
        : 0;

      // Subtle ongoing ambient micro-vibration
      const ambientBuzz = Math.sin(currentTime * 35 + index * 4) > 0.9 ? 0.35 : 0.08;

      glitchIntensity = Math.max(entranceSurge, periodicSurge, ambientBuzz);

      if (glitchIntensity > 0.04) {
        const freq = currentTime * 95 + index * 21;
        glitchJitterX = (Math.sin(freq) * 0.7 + Math.cos(freq * 1.5) * 0.5) * 10 * glitchIntensity;
        glitchJitterY = (Math.sin(freq * 1.3) * 0.4) * 4 * glitchIntensity;
      }
    }

    const drawLineX = lineX + glitchJitterX;
    const drawLineY = lineY + glitchJitterY;

    // Chromatic RGB Aberration (Помехи / Сигнальное расщепление)
    if (state.animationStyle === 'glitch' && glitchIntensity > 0.08) {
      const splitDist = Math.max(1.5, glitchIntensity * 5.5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.42));

      // Electric Cyan ghost pass
      ctx.fillStyle = '#06b6d4';
      ctx.fillText(line, drawLineX - splitDist, drawLineY - splitDist * 0.35);

      // Electric Magenta ghost pass
      ctx.fillStyle = '#f43f5e';
      ctx.fillText(line, drawLineX + splitDist, drawLineY + splitDist * 0.35);
      ctx.restore();
    }

    // Neon effect multi-pass
    if (state.effects.neon) {
      ctx.save();
      ctx.shadowColor = state.neonColor || '#a855f7';
      ctx.shadowBlur = 35;
      ctx.strokeStyle = state.neonColor || '#a855f7';
      ctx.lineWidth = Math.max(4, state.strokeWidth + 4);
      ctx.strokeText(line, drawLineX, drawLineY);

      ctx.shadowBlur = 15;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeText(line, drawLineX, drawLineY);
      ctx.restore();
    }

    // Standard Stroke or Smart Shadow on Light Backgrounds
    const isLightPreset = state.bgPresetId === 'clean-white' || state.bgPresetId === 'notebook-grid' || state.bgPresetId === 'old-parchment';
    const isLightTextColor = state.textColor.toLowerCase() === '#ffffff' || state.textColor.toLowerCase() === '#fff' || state.textColor.toLowerCase() === '#fefefe';

    if (state.strokeEnabled && !state.effects.neon) {
      ctx.save();
      ctx.strokeStyle = state.strokeColor;
      ctx.lineWidth = state.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(line, drawLineX, drawLineY);
      ctx.restore();
    } else if (isLightPreset && isLightTextColor && !state.effects.neon) {
      // Soft contrasting dark outline so white text is instantly readable on white paper
      ctx.save();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, drawLineX, drawLineY);
      ctx.restore();
    }

    // Glow pulse shadow or Electric surge aura
    if (state.effects.glow) {
      ctx.shadowColor = state.textColor;
      ctx.shadowBlur = 25;
    } else if (state.animationStyle === 'glitch' && glitchIntensity > 0.4) {
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 20;
    }

    // Main text fill
    ctx.fillStyle = state.textColor;
    ctx.fillText(line, drawLineX, drawLineY);

    // Electric charge running across the letters ("как будто по нему пробегает электрический заряд")
    if (state.animationStyle === 'glitch' && (progress < 1 || glitchIntensity > 0.3)) {
      ctx.save();
      const textMetrics = ctx.measureText(line);
      const lineWidth = textMetrics.width;
      if (lineWidth > 10) {
        // Charge traveling across text width
        const chargePhase = ((currentTime * 2.2 + index * 0.35) % 1);
        let chargeStart = drawLineX;
        if (state.textAlign === 'center') chargeStart = drawLineX - lineWidth / 2;
        else if (state.textAlign === 'right') chargeStart = drawLineX - lineWidth;

        const chargeX = chargeStart + lineWidth * chargePhase;
        const chargeY = drawLineY - layout.fontSize * 0.35;

        // Glowing plasma spark
        const chargeRadius = Math.max(18, layout.fontSize * 0.65);
        const electricGrad = ctx.createRadialGradient(
          chargeX,
          chargeY,
          1,
          chargeX,
          chargeY,
          chargeRadius
        );
        electricGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        electricGrad.addColorStop(0.25, 'rgba(56, 189, 248, 0.85)');
        electricGrad.addColorStop(0.65, 'rgba(168, 85, 247, 0.3)');
        electricGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = electricGrad;
        ctx.beginPath();
        ctx.arc(chargeX, chargeY, chargeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Electric lightning zig-zag arc
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        const arcSpan = Math.min(45, lineWidth * 0.25);
        const arcNoise = Math.sin(currentTime * 110 + index * 7);
        ctx.moveTo(chargeX - arcSpan, chargeY + arcNoise * 4);
        ctx.lineTo(chargeX - arcSpan * 0.3, chargeY - arcNoise * 4);
        ctx.lineTo(chargeX + arcSpan * 0.3, chargeY + arcNoise * 3);
        ctx.lineTo(chargeX + arcSpan, chargeY - arcNoise * 4);
        ctx.stroke();

        // Horizontal scanline interference slice
        if (glitchIntensity > 0.55) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          const sliceY = chargeY + (arcNoise * layout.fontSize * 0.3);
          ctx.fillRect(chargeStart, sliceY, lineWidth, 2);
        }
      }
      ctx.restore();
    }
  });

  // Render Author under the main quote if present
  if (hasAuthor && linesToDraw.length > 0) {
    const authorStr =
      rawAuthor.startsWith('—') || rawAuthor.startsWith('-')
        ? rawAuthor
        : `— ${rawAuthor}`;

    const authorY =
      startY +
      (layout.lines.length - 1) * layout.lineHeight +
      authorGap +
      authorFontSize * 0.9 +
      offsetY;

    let authorX = canvasWidth / 2;
    if (state.textAlign === 'left') authorX = safeMarginX;
    if (state.textAlign === 'right') authorX = canvasWidth - safeMarginX;

    if (state.animationStyle === 'glitch') {
      const authorSurge = (currentTime * 0.62) % 1 < 0.15 ? 2 : 0.5;
      authorX += Math.sin(currentTime * 80) * authorSurge;
    }

    // Author fades in ONLY after the final phrase, word, or sentence has appeared
    let authorFade = 0;
    if (progress >= 0.82) {
      const revealProgress = Math.min(1, (progress - 0.82) / 0.18);
      authorFade = easeOutCubic(revealProgress);
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha * authorFade * 0.92));
    ctx.font = `italic 600 ${authorFontSize}px 'Playfair Display', 'Caveat', 'Montserrat', Georgia, serif`;
    ctx.textAlign = state.textAlign;
    ctx.textBaseline = 'alphabetic';

    // Author stroke if enabled
    if (state.strokeEnabled && !state.effects.neon) {
      ctx.strokeStyle = state.strokeColor;
      ctx.lineWidth = Math.max(1.5, state.strokeWidth * 0.45);
      ctx.lineJoin = 'round';
      ctx.strokeText(authorStr, authorX, authorY);
    }

    // Author fill
    ctx.fillStyle = state.textColor;
    ctx.fillText(authorStr, authorX, authorY);
    ctx.restore();
  }

  ctx.restore();

  // Draw Particles (Sparkles / Fire) over text
  if (state.effects.sparkle) {
    particleEngine.updateAndDrawSparkles(ctx, bounds, currentTime);
  }
  if (state.effects.fire) {
    particleEngine.updateAndDrawFire(ctx, bounds, currentTime);
  }
}
