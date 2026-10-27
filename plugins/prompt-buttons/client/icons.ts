import type { PluginSerializableIcon } from "@getpaseo/plugin";
import { CUSTOM_ICON_PREFIX } from "../shared/settings";

export interface CustomIcon {
  key: string;
  title: string;
  svg: string;
}

/**
 * Drawings Lucide does not carry. They sit on Lucide's 24px grid with the same 2px round
 * stroke, and use `currentColor` so the host's tint reaches them.
 */
export const CUSTOM_ICONS: readonly CustomIcon[] = [
  {
    key: "chequered-flag",
    title: "Chequered flag",
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<path fill="currentColor" d="M4 4h4v5H4zM12 4h4v5h-4zM8 9h4v5H8zM16 9h4v5h-4z"/>' +
      '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 22V4M4 4h16v10H4z"/>' +
      "</svg>",
  },
];

const CUSTOM_BY_KEY = new Map(CUSTOM_ICONS.map((icon) => [icon.key, icon]));

export function isCustomIcon(icon: string): boolean {
  return icon.startsWith(CUSTOM_ICON_PREFIX);
}

export function customIconId(key: string): string {
  return `${CUSTOM_ICON_PREFIX}${key}`;
}

/** The stored icon as something Paseo can draw. An unknown name falls back to a plain flag. */
export function resolveIcon(icon: string): PluginSerializableIcon {
  if (!isCustomIcon(icon)) return icon;
  const found = CUSTOM_BY_KEY.get(icon.slice(CUSTOM_ICON_PREFIX.length));
  return found ? { svg: found.svg } : "Flag";
}
