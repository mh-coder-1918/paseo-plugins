import { type RefObject, useCallback, useEffect, useState } from "react";
import { Dimensions, type View } from "react-native";

// Paseo gives plugins no way to hide its Workspaces list. On web and desktop, react-native-web
// renders testID as data-testid, so a style rule can hide the list. Native mobile apps have no
// DOM, so the toggle does nothing there.

interface StyleElement {
  id: string;
  textContent: string | null;
  remove(): void;
}
interface DocumentLike {
  getElementById(id: string): StyleElement | null;
  querySelector(selector: string): { getBoundingClientRect(): { height: number } } | null;
  createElement(tag: "style"): StyleElement;
  head: { appendChild(node: StyleElement): unknown };
}
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STYLE_ID = "active-projects-hide-native-workspaces";
const PREFERENCE_KEY = "active-projects:hide-native-workspaces";
// Hide the container's contents but keep the container: it is the flexible space that holds the
// sidebar footer at the bottom.
const HIDE_RULE =
  'div:has(> [data-testid="sidebar-project-workspace-list-scroll"]) > * { display: none !important; }';

const dom = (globalThis as { document?: DocumentLike }).document;
const storage = (globalThis as { localStorage?: StorageLike }).localStorage;

export const canHideNativeWorkspaces = Boolean(dom);

function applyHidden(hidden: boolean) {
  if (!dom) return;
  const existing = dom.getElementById(STYLE_ID);
  if (!hidden) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = dom.createElement("style");
  style.id = STYLE_ID;
  style.textContent = HIDE_RULE;
  dom.head.appendChild(style);
}

function readPreference(): boolean {
  try {
    return storage?.getItem(PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

const listeners = new Set<(hidden: boolean) => void>();
let hidden = readPreference();

export function setNativeWorkspacesHidden(next: boolean) {
  hidden = next;
  try {
    storage?.setItem(PREFERENCE_KEY, String(next));
  } catch {
    // The preference still applies until the app reloads.
  }
  applyHidden(next);
  for (const listener of listeners) listener(next);
}

/** Applies the saved preference; returns the cleanup that shows the native list again. */
export function installNativeWorkspacesStyle(): () => void {
  applyHidden(hidden);
  return () => applyHidden(false);
}

export function useNativeWorkspacesHidden(): boolean {
  const [value, setValue] = useState(hidden);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

// Space kept clear above the sidebar footer, and the smallest height the list shrinks to.
const FOOTER_GAP = 8;
const MIN_LIST_HEIGHT = 120;

/**
 * Height the active list may take before it scrolls: from its top down to the sidebar footer,
 * or half of that while Paseo's own list is shown. undefined where the footer cannot be measured.
 */
export function useListMaxHeight(listRef: RefObject<View | null>, nativeHidden: boolean) {
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const measure = useCallback(() => {
    const footer = dom?.querySelector('[data-testid="sidebar-footer"]');
    const list = listRef.current;
    if (!footer || !list) return;
    list.measureInWindow((_x, top) => {
      const bottom = Dimensions.get("window").height - footer.getBoundingClientRect().height - FOOTER_GAP;
      const space = bottom - top;
      setMaxHeight(Math.max(MIN_LIST_HEIGHT, Math.floor(nativeHidden ? space : space / 2)));
    });
  }, [listRef, nativeHidden]);
  useEffect(() => {
    measure();
    const subscription = Dimensions.addEventListener("change", measure);
    return () => subscription.remove();
  }, [measure]);
  return { maxHeight, measure };
}
