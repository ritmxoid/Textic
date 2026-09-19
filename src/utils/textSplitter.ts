import { TextMode, TextSegment } from '../types';

export function splitTextIntoSegments(
  rawText: string,
  mode: TextMode,
  speedMultiplier: number = 1.0,
  pauseBetweenSeconds: number = 0.8
): { segments: TextSegment[]; totalDuration: number } {
  const clean = rawText.trim();
  if (!clean) {
    return {
      segments: [
        {
          text: 'Введи свой текст здесь...',
          words: ['Введи', 'свой', 'текст', 'здесь...'],
          startTime: 0,
          endTime: 3,
          duration: 3,
        },
      ],
      totalDuration: 3,
    };
  }

  const speed = Math.max(0.1, Math.min(3.0, speedMultiplier));
  const pause = Math.max(0.1, pauseBetweenSeconds);
  const segments: TextSegment[] = [];
  let currentTime = 0;

  if (mode === 'word') {
    // Split into individual words
    const words = clean.split(/\s+/).filter(Boolean);
    const wordBaseDuration = 0.55 / speed;
    const wordPause = pause * 0.35;

    words.forEach((word) => {
      // If word ends with punctuation, give it a tiny bit more pause
      const extraPause = /[.!?]$/.test(word) ? 0.25 / speed : 0;
      const duration = wordBaseDuration + extraPause;
      const startTime = currentTime;
      const endTime = startTime + duration;

      segments.push({
        text: word,
        words: [word],
        startTime,
        endTime,
        duration,
      });

      currentTime = endTime + wordPause;
    });
  } else if (mode === 'sentence') {
    // Split by sentence delimiters (. ! ? \n)
    const rawSentences = clean
      .split(/(?<=[.!?\n])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // If no sentence delimiters were found, split by commas or line breaks if long
    const finalSentences: string[] = [];
    rawSentences.forEach((sentence) => {
      if (sentence.length > 90) {
        // split long sentences by comma if reasonable
        const parts = sentence.split(/,\s+/);
        if (parts.length > 1) {
          parts.forEach((p, idx) => {
            finalSentences.push(idx < parts.length - 1 ? `${p},` : p);
          });
        } else {
          finalSentences.push(sentence);
        }
      } else {
        finalSentences.push(sentence);
      }
    });

    finalSentences.forEach((sentence) => {
      const words = sentence.split(/\s+/).filter(Boolean);
      const readTime = Math.max(1.3 / speed, (0.75 + words.length * 0.32) / speed);
      const startTime = currentTime;
      const endTime = startTime + readTime;

      segments.push({
        text: sentence,
        words,
        startTime,
        endTime,
        duration: readTime,
      });

      currentTime = endTime + pause;
    });
  } else {
    // Full text mode
    const words = clean.split(/\s+/).filter(Boolean);
    const readTime = Math.max(2.5 / speed, (1.6 + words.length * 0.28) / speed);
    const startTime = 0;
    const endTime = startTime + readTime;

    segments.push({
      text: clean,
      words,
      startTime,
      endTime,
      duration: readTime,
    });

    currentTime = endTime + 0.5;
  }

  const totalDuration = Math.max(1.0, currentTime);
  return { segments, totalDuration };
}
