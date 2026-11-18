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
interface ElementLike {
  getBoundingClientRect(): { height: number };
  querySelector(selector: string): ElementLike | null;
  previousElementSibling: ElementLike | null;
}
interface DocumentLike {
  getElementById(id: string): StyleElement | null;
  querySelector(selector: string): ElementLike | null;
  createElement(tag: "style"): StyleElement;
  head: { appendChild(node: StyleElement): unknown };
}
interface ResizeObserverLike {
  observe(target: ElementLike): void;
  disconnect(): void;
}
type ResizeObserverConstructor = new (callback: () => void) => ResizeObserverLike;
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STYLE_ID = "active-projects-hide-native-workspaces";
const PREFERENCE_KEY = "active-projects:hide-native-workspaces";
// Hide the container's contents but keep the container: it is the flexible space that holds the
// sidebar footer at the bottom. Paseo 0.15 renders a different list when the sidebar is grouped
// by status, so both are covered.
const HIDE_RULE =
  'div:has(> [data-testid="sidebar-project-workspace-list-scroll"]) > *, ' +
  'div:has(> [data-testid="sidebar-status-list-scroll"]) > * { display: none !important; }';

const dom = (globalThis as { document?: DocumentLike }).document;
const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
const ResizeObserverImpl = (globalThis as { ResizeObserver?: ResizeObserverConstructor }).ResizeObserver;

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

const footerElement = () => dom?.querySelector('[data-testid="sidebar-footer"]') ?? null;

/**
 * Paseo 0.16 shows sidebar callouts such as "Update available" in a slot directly above the
 * footer. The slot has no test ID; the callout inside it is the only child with role="alert".
 */
function calloutHeight(footer: ElementLike): number {
  const slot = footer.previousElementSibling;
  if (!slot?.querySelector(':scope > [role="alert"]')) return 0;
  return slot.getBoundingClientRect().height;
}

/**
 * Height the active list may take before it scrolls: from its top down to the sidebar callout
 * and footer, or half of that while Paseo's own list is shown. undefined where the footer cannot
 * be measured.
 */
export function useListMaxHeight(listRef: RefObject<View | null>, nativeHidden: boolean) {
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const measure = useCallback(() => {
    const footer = footerElement();
    const list = listRef.current;
    if (!footer || !list) return;
    list.measureInWindow((_x, top) => {
      // Measured up from the window bottom, not from the footer's position: a list that is too
      // tall pushes the footer off screen, and its position would then keep the list too tall.
      const below = footer.getBoundingClientRect().height + calloutHeight(footer) + FOOTER_GAP;
      const space = Dimensions.get("window").height - below - top;
      setMaxHeight(Math.max(MIN_LIST_HEIGHT, Math.floor(nativeHidden ? space : space / 2)));
    });
  }, [listRef, nativeHidden]);
  useEffect(() => {
    measure();
    const subscription = Dimensions.addEventListener("change", measure);
    // Callouts come and go after the sidebar has laid out, and the footer changes height when
    // its plugin rows do; neither moves the list, so onLayout alone would miss them.
    const footer = footerElement();
    const observer = footer && ResizeObserverImpl ? new ResizeObserverImpl(measure) : null;
    if (footer && observer) {
      observer.observe(footer);
      if (footer.previousElementSibling) observer.observe(footer.previousElementSibling);
    }
    return () => {
      subscription.remove();
      observer?.disconnect();
    };
  }, [measure]);
  return { maxHeight, measure };
}
