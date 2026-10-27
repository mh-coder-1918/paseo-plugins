import { useEffect, useState } from "react";

// The order the project list is in. Kept with the other sidebar preferences, in the browser's
// storage, so the choice survives a reload of the app.

export type SortMode = "recent" | "name" | "chats";

export const SORT_MODES: readonly { id: SortMode; label: string; icon: string }[] = [
  { id: "recent", label: "Recently active", icon: "Clock" },
  { id: "name", label: "Name", icon: "ArrowDownAZ" },
  { id: "chats", label: "Open chats", icon: "MessageSquare" },
];

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFERENCE_KEY = "active-projects:sort";
const DEFAULT_MODE: SortMode = "recent";

const storage = (globalThis as { localStorage?: StorageLike }).localStorage;

function isSortMode(value: string | null): value is SortMode {
  return SORT_MODES.some((mode) => mode.id === value);
}

function readPreference(): SortMode {
  try {
    const saved = storage?.getItem(PREFERENCE_KEY) ?? null;
    return isSortMode(saved) ? saved : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

const listeners = new Set<(mode: SortMode) => void>();
let sortMode = readPreference();

export function setSortMode(next: SortMode) {
  sortMode = next;
  try {
    storage?.setItem(PREFERENCE_KEY, next);
  } catch {
    // The choice still applies until the app reloads.
  }
  for (const listener of listeners) listener(next);
}

export function useSortMode(): SortMode {
  const [value, setValue] = useState(sortMode);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
