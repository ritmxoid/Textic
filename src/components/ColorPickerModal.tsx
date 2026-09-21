import React, { useState, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Palette, RotateCcw } from 'lucide-react';

interface ColorPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  color: string;
  onChange: (newColor: string) => void;
  title?: string;
}

// Convert Hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(cleaned, 16);
  if (isNaN(num) || cleaned.length !== 6) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

// Convert RGB to Hex
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// Convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = (h % 360) / 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

const POPULAR_PALETTE = [
  // Яркие чистые цвета
  { label: 'Белый', hex: '#ffffff' },
  { label: 'Желтый', hex: '#facc15' },
  { label: 'Золотой', hex: '#f59e0b' },
  { label: 'Оранжевый', hex: '#f97316' },
  { label: 'Красный', hex: '#ef4444' },
  { label: 'Розовый', hex: '#ec4899' },
  { label: 'Пурпурный', hex: '#a855f7' },
  { label: 'Синий', hex: '#3b82f6' },
  { label: 'Голубой', hex: '#06b6d4' },
  { label: 'Изумрудный', hex: '#10b981' },
  { label: 'Зеленый лайм', hex: '#84cc16' },
  { label: 'Черный', hex: '#000000' },

  // Пастельные и благородные оттенки
  { label: 'Слоновая кость', hex: '#fefce8' },
  { label: 'Бежевый', hex: '#f5efe6' },
  { label: 'Персиковый', hex: '#fed7aa' },
  { label: 'Мятный', hex: '#a7f3d0' },
  { label: 'Небесный', hex: '#bae6fd' },
  { label: 'Лавандовый', hex: '#ddd6fe' },
  { label: 'Графитовый', hex: '#374151' },
  { label: 'Неоновый циан', hex: '#22d3ee' },
];

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  isOpen,
  onClose,
  color,
  onChange,
  title = 'Микшер цветов',
}) => {
  const [initialColor, setInitialColor] = useState(color);
  const [currentColor, setCurrentColor] = useState(color);
  const [hexInput, setHexInput] = useState(color.toUpperCase());
  const [activeTab, setActiveTab] = useState<'hsl' | 'rgb'>('hsl');

  const rgb = hexToRgb(currentColor);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const hexInputId = useId();
  const hueInputId = useId();
  const satInputId = useId();
  const lightInputId = useId();
  const redInputId = useId();
  const greenInputId = useId();
  const blueInputId = useId();

  useEffect(() => {
    if (isOpen) {
      setInitialColor(color);
      setCurrentColor(color);
      setHexInput(color.toUpperCase());
    }
  }, [isOpen, color]);

  if (!isOpen) return null;

  const updateColorFromRgb = (r: number, g: number, b: number) => {
    const hex = rgbToHex(r, g, b);
    setCurrentColor(hex);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  };

  const updateColorFromHsl = (h: number, s: number, l: number) => {
    const { r, g, b } = hslToRgb(h, s, l);
    const hex = rgbToHex(r, g, b);
    setCurrentColor(hex);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  };

  const handleHexBlur = () => {
    let clean = hexInput.trim();
    if (!clean.startsWith('#')) clean = `#${clean}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(clean) || /^#[0-9A-Fa-f]{3}$/.test(clean)) {
      const { r, g, b } = hexToRgb(clean);
      const normalized = rgbToHex(r, g, b);
      setCurrentColor(normalized);
      setHexInput(normalized.toUpperCase());
      onChange(normalized);
    } else {
      setHexInput(currentColor.toUpperCase());
    }
  };

  const handleSelectPreset = (hex: string) => {
    setCurrentColor(hex);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  };

  const handleReset = () => {
    setCurrentColor(initialColor);
    setHexInput(initialColor.toUpperCase());
    onChange(initialColor);
  };

  return createPortal(
    <div
      id="color-picker-overlay"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        id="color-picker-dialog"
        className="w-full max-w-sm max-h-[92vh] overflow-y-auto bg-[#1a1a24] border border-white/15 rounded-2xl shadow-2xl p-4 sm:p-5 space-y-4 text-zinc-100 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <Palette className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Color Preview & HEX input */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/40 border border-white/10">
          <div
            className="w-12 h-12 rounded-xl border-2 border-white/25 shadow-inner shrink-0"
            style={{ backgroundColor: currentColor }}
          />
          <div className="flex-1 space-y-1 min-w-0">
            <label
              htmlFor={hexInputId}
              className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block"
            >
              HEX-код цвета
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id={hexInputId}
                type="text"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onBlur={handleHexBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleHexBlur();
                }}
                maxLength={7}
                className="w-full font-mono text-xs font-bold uppercase bg-zinc-900/90 border border-white/15 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-purple-400"
                placeholder="#FFFFFF"
              />
            </div>
          </div>
          {initialColor.toLowerCase() !== currentColor.toLowerCase() && (
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-[10px] font-semibold flex items-center gap-1 border border-white/10 transition-colors cursor-pointer shrink-0"
              title="Вернуть исходный цвет"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сброс</span>
            </button>
          )}
        </div>

        {/* Sliders Modes Toggle */}
        <div className="flex items-center justify-between gap-1 p-0.5 bg-black/30 rounded-lg border border-white/10 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('hsl')}
            className={`flex-1 py-1 rounded-md transition-all cursor-pointer text-center ${
              activeTab === 'hsl'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Спектр (Оттенок / Яркость)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rgb')}
            className={`flex-1 py-1 rounded-md transition-all cursor-pointer text-center ${
              activeTab === 'rgb'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Каналы RGB (R / G / B)
          </button>
        </div>

        {/* Interactive Sliders */}
        {activeTab === 'hsl' ? (
          <div className="space-y-3 pt-0.5">
            {/* 1. Hue Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-zinc-300">
                <label htmlFor={hueInputId}>Оттенок (Hue)</label>
                <span className="font-mono text-[10px] text-zinc-400">{hsl.h}°</span>
              </div>
              <input
                id={hueInputId}
                type="range"
                min={0}
                max={360}
                value={hsl.h}
                onChange={(e) => updateColorFromHsl(parseInt(e.target.value), hsl.s, hsl.l)}
                className="w-full h-3 rounded-lg appearance-none cursor-pointer outline-none"
                style={{
                  background:
                    'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                }}
              />
            </div>

            {/* 2. Saturation Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-zinc-300">
                <label htmlFor={satInputId}>Насыщенность</label>
                <span className="font-mono text-[10px] text-zinc-400">{hsl.s}%</span>
              </div>
              <input
                id={satInputId}
                type="range"
                min={0}
                max={100}
                value={hsl.s}
                onChange={(e) => updateColorFromHsl(hsl.h, parseInt(e.target.value), hsl.l)}
                className="w-full h-3 rounded-lg appearance-none cursor-pointer outline-none"
                style={{
                  background: `linear-gradient(to right, hsl(${hsl.h}, 0%, ${hsl.l}%), hsl(${hsl.h}, 100%, ${hsl.l}%))`,
                }}
              />
            </div>

            {/* 3. Lightness Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-zinc-300">
                <label htmlFor={lightInputId}>Яркость</label>
                <span className="font-mono text-[10px] text-zinc-400">{hsl.l}%</span>
              </div>
              <input
                id={lightInputId}
                type="range"
                min={0}
                max={100}
                value={hsl.l}
                onChange={(e) => updateColorFromHsl(hsl.h, hsl.s, parseInt(e.target.value))}
                className="w-full h-3 rounded-lg appearance-none cursor-pointer outline-none"
                style={{
                  background: `linear-gradient(to right, #000000 0%, hsl(${hsl.h}, ${hsl.s}%, 50%) 50%, #ffffff 100%)`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 pt-0.5">
            {/* Red Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-zinc-300">
                <label htmlFor={redInputId} className="flex items-center gap-1 text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Красный (R)
                </label>
                <span className="font-mono text-[10px] text-zinc-400">{rgb.r}</span>
              </div>
              <input
                id={redInputId}
                type="range"
                min={0}
                max={255}
                value={rgb.r}
                onChange={(e) => updateColorFromRgb(parseInt(e.target.value), rgb.g, rgb.b)}
                className="w-full h-2.5 accent-rose-500 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Green Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-zinc-300">
                <label htmlFor={greenInputId} className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Зеленый (G)
                </label>
                <span className="font-mono text-[10px] text-zinc-400">{rgb.g}</span>
              </div>
              <input
                id={greenInputId}
                type="range"
                min={0}
                max={255}
                value={rgb.g}
                onChange={(e) => updateColorFromRgb(rgb.r, parseInt(e.target.value), rgb.b)}
                className="w-full h-2.5 accent-emerald-500 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Blue Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-zinc-300">
                <label htmlFor={blueInputId} className="flex items-center gap-1 text-sky-400">
                  <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" /> Синий (B)
                </label>
                <span className="font-mono text-[10px] text-zinc-400">{rgb.b}</span>
              </div>
              <input
                id={blueInputId}
                type="range"
                min={0}
                max={255}
                value={rgb.b}
                onChange={(e) => updateColorFromRgb(rgb.r, rgb.g, parseInt(e.target.value))}
                className="w-full h-2.5 accent-sky-500 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Quick Palette Swatches */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">
            Быстрая палитра
          </span>
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
            {POPULAR_PALETTE.map((swatch) => {
              const isSelected = currentColor.toLowerCase() === swatch.hex.toLowerCase();
              return (
                <button
                  type="button"
                  key={swatch.hex}
                  onClick={() => handleSelectPreset(swatch.hex)}
                  className={`h-7 rounded-lg border transition-all flex items-center justify-center cursor-pointer shadow-sm ${
                    isSelected
                      ? 'border-purple-400 ring-2 ring-purple-500 scale-110 z-10'
                      : 'border-white/20 hover:scale-105 opacity-90 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                  title={swatch.label}
                >
                  {isSelected && (
                    <Check
                      className={`w-3.5 h-3.5 drop-shadow ${
                        swatch.hex === '#ffffff' || swatch.hex.startsWith('#fe') || swatch.hex.startsWith('#fa')
                          ? 'text-zinc-900'
                          : 'text-white'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold tracking-wide transition-all shadow-lg shadow-purple-600/30 cursor-pointer active:scale-98"
          >
            Готово
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
