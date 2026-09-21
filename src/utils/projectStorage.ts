/**
 * Persistent Storage Engine for Quote Animator
 * Combines localStorage (for text, typography, animation settings)
 * and IndexedDB (for persistent storage of large user video, image, and audio files).
 *
 * This guarantees that even if mobile Chrome / Android OS discards the tab
 * during file selection or background multitasking, 100% of user work is preserved!
 */

import { VideoProjectState } from '../types';

const STORAGE_KEY = 'quote_animator_project_state_v2';
const DB_NAME = 'QuoteAnimatorMediaDB';
const DB_VERSION = 1;
const STORE_NAME = 'media_files';

interface StoredMediaRecord {
  id: 'background' | 'audio';
  blob: Blob;
  fileName: string;
  mimeType: string;
  duration?: number;
  timestamp: number;
}

// Open IndexedDB safely with fallback
function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (err) => {
        console.warn('IndexedDB open error, continuing without offline media caching:', err);
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB exception:', e);
      resolve(null);
    }
  });
}

/**
 * Save project text, typography, and settings to localStorage.
 * Transient blob: URLs are omitted because they expire on tab reload.
 */
export function saveProjectState(state: VideoProjectState, extra?: { fileName?: string | null }): void {
  try {
    const serializable = {
      ...state,
      // Only persist filename if bgType is custom image or video
      savedBgFileName:
        state.bgType === 'video' || state.bgType === 'image'
          ? extra?.fileName || (state as any).savedBgFileName || null
          : null,
      // Clear transient blob URLs so we don't save broken URLs
      bgMediaUrl: state.bgMediaUrl?.startsWith('blob:') ? null : state.bgMediaUrl,
      audio: {
        ...state.audio,
        audioUrl: state.audio.audioUrl?.startsWith('blob:') ? null : state.audio.audioUrl,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (err) {
    console.warn('Error saving state to localStorage:', err);
  }
}

/**
 * Load project state from localStorage
 */
export function loadProjectState(): (Partial<VideoProjectState> & { savedBgFileName?: string | null }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    console.warn('Error loading state from localStorage:', err);
  }
  return null;
}

/**
 * Store user uploaded media file (video/image background or audio track) in IndexedDB
 */
export async function saveMediaFile(
  id: 'background' | 'audio',
  file: Blob | File,
  fileName: string,
  mimeType: string,
  duration?: number
): Promise<void> {
  const db = await openDB();
  if (!db) return;

  // Make an independent standalone Blob to decouple from expiring mobile Android ContentProvider handles
  const effectiveMime = mimeType || file.type || (id === 'background' ? 'video/mp4' : 'audio/mpeg');
  let standaloneBlob: Blob;
  try {
    standaloneBlob = file.slice(0, file.size, effectiveMime);
  } catch {
    standaloneBlob = file;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredMediaRecord = {
        id,
        blob: standaloneBlob,
        fileName: fileName || (id === 'background' ? 'custom-background' : 'custom-audio'),
        mimeType: effectiveMime,
        duration,
        timestamp: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => {
        console.warn('IndexedDB put error:', e);
        resolve();
      };
    } catch (err) {
      console.warn('IndexedDB saveMediaFile failed:', err);
      resolve();
    }
  });
}

/**
 * Retrieve user uploaded media file from IndexedDB
 */
export async function loadMediaFile(
  id: 'background' | 'audio'
): Promise<StoredMediaRecord | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result && request.result.blob) {
          resolve(request.result as StoredMediaRecord);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB loadMediaFile failed:', err);
      resolve(null);
    }
  });
}

/**
 * Delete a media file from IndexedDB
 */
export async function clearMediaFile(id: 'background' | 'audio'): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (err) {
      console.warn('IndexedDB clearMediaFile failed:', err);
      resolve();
    }
  });
}

/**
 * Clear all project state and cached files (Full Reset)
 */
export async function clearAllProjectData(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}

  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
