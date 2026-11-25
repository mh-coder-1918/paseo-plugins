import { useEffect, useState } from "react";
import type { LaterEntry } from "../shared/later";

export type { LaterEntry };

export interface LaterActions {
  /** Calls back with the whole list now and after every change; returns the unsubscribe. */
  watchLater(onEntries: (entries: LaterEntry[]) => void): () => void;
  setAside(hostId: string, workspaceId: string, until: string | null): Promise<void>;
  bringBack(hostId: string, workspaceId: string): Promise<void>;
}

export interface LaterOption {
  id: string;
  label: string;
  icon: string;
  /** When the chat comes back, or null for when it is brought back by hand. */
  until(now: Date): string | null;
}

const MORNING_HOUR = 9;

function hoursFrom(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

/** 9:00 tomorrow, local time. */
function tomorrowMorning(now: Date): string {
  const time = new Date(now);
  time.setDate(time.getDate() + 1);
  time.setHours(MORNING_HOUR, 0, 0, 0);
  return time.toISOString();
}

export const LATER_OPTIONS: readonly LaterOption[] = [
  { id: "1h", label: "For 1 hour", icon: "Clock1", until: (now) => hoursFrom(now, 1) },
  { id: "3h", label: "For 3 hours", icon: "Clock3", until: (now) => hoursFrom(now, 3) },
  { id: "tomorrow", label: "Until tomorrow morning", icon: "Sunrise", until: tomorrowMorning },
  { id: "manual", label: "Until I bring it back", icon: "Bookmark", until: () => null },
];

export function laterKey(hostId: string, workspaceId: string): string {
  return JSON.stringify([hostId, workspaceId]);
}

export function isWaiting(entry: LaterEntry, now: number): boolean {
  return entry.until === null || Date.parse(entry.until) > now;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Short "comes back" text: 14:30, tomorrow 09:00, Thu 09:00, or null when it waits to be brought back. */
export function returnsAt(until: string | null, now: number): string | null {
  if (until === null) return null;
  const time = new Date(until);
  const clock = `${pad(time.getHours())}:${pad(time.getMinutes())}`;
  const today = new Date(now);
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(time) - startOfDay(today)) / 86_400_000);
  if (days <= 0) return clock;
  if (days === 1) return `tomorrow ${clock}`;
  return `${time.toLocaleDateString(undefined, { weekday: "short" })} ${clock}`;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Whether the Later section is folded away. Folded by default, so set-aside chats stay out of
// sight; the choice is kept in the browser's storage like the sort order.
const COLLAPSED_KEY = "active-projects:later-collapsed";
const storage = (globalThis as { localStorage?: StorageLike }).localStorage;

function readCollapsed(): boolean {
  try {
    return storage?.getItem(COLLAPSED_KEY) !== "false";
  } catch {
    return true;
  }
}

let collapsed = readCollapsed();
const collapsedListeners = new Set<(value: boolean) => void>();

export function setLaterCollapsed(next: boolean) {
  collapsed = next;
  try {
    storage?.setItem(COLLAPSED_KEY, String(next));
  } catch {
    // Still applies until the app reloads.
  }
  for (const listener of collapsedListeners) listener(next);
}

export function useLaterCollapsed(): boolean {
  const [value, setValue] = useState(collapsed);
  useEffect(() => {
    collapsedListeners.add(setValue);
    return () => {
      collapsedListeners.delete(setValue);
    };
  }, []);
  return value;
}

// The list outlives the view, so switching sidebar views back and forth shows it at once.
let knownEntries: LaterEntry[] = [];

/** The set-aside chats on the plugin's daemon, kept live. */
export function useLaterEntries(actions: LaterActions): LaterEntry[] {
  const [entries, setEntries] = useState(knownEntries);
  useEffect(
    () =>
      actions.watchLater((next) => {
        knownEntries = next;
        setEntries(next);
      }),
    [actions],
  );
  return entries;
}
