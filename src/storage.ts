import { deserializePlay, serializePlay, type Play } from './model';

const DRAFT_KEY = 'playmaker.play.v1';
const LIBRARY_KEY = 'playmaker.library.v1';

export interface SavedPlay {
  id: string;
  name: string;
  play: Play;
  createdAt: number;
  updatedAt: number;
}

export function loadDraftPlay(): Play | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      return null;
    }
    return deserializePlay(raw);
  } catch {
    return null;
  }
}

export function saveDraftPlay(play: Play): void {
  try {
    localStorage.setItem(DRAFT_KEY, serializePlay(play));
  } catch {
    // Ignore persistence errors (e.g. storage unavailable).
  }
}

export function clearDraftPlay(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function loadSavedPlays(): SavedPlay[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) {
      return [];
    }
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Array.isArray((data as { plays?: unknown }).plays)) {
      return [];
    }
    const entries = (data as { plays: unknown[] }).plays;
    const results: SavedPlay[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as {
        id?: unknown;
        name?: unknown;
        data?: unknown;
        createdAt?: unknown;
        updatedAt?: unknown;
      };
      if (
        typeof record.id !== 'string' ||
        typeof record.name !== 'string' ||
        typeof record.data !== 'string' ||
        typeof record.createdAt !== 'number' ||
        typeof record.updatedAt !== 'number'
      ) {
        continue;
      }
      const play = deserializePlay(record.data);
      if (!play) {
        continue;
      }
      results.push({
        id: record.id,
        name: record.name,
        play,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      });
    }
    return results;
  } catch {
    return [];
  }
}

export function saveSavedPlays(plays: SavedPlay[]): void {
  try {
    const payload = {
      version: 1,
      plays: plays.map((entry) => ({
        id: entry.id,
        name: entry.name,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        data: serializePlay(entry.play)
      }))
    };
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors.
  }
}
