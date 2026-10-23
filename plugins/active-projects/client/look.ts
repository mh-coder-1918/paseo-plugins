import type { PluginTheme } from "@getpaseo/plugin";

// Mirrors Paseo's sidebar tokens (app theme 0.13) so plugin rows match the native Workspaces list.

const IDENTITY_COLOR_NAMES = [
  "violet",
  "sky",
  "emerald",
  "orange",
  "pink",
  "indigo",
  "teal",
  "red",
  "amber",
  "blue",
] as const;
export type IdentityColorName = (typeof IDENTITY_COLOR_NAMES)[number];

const IDENTITY_FILL: Record<IdentityColorName, string> = {
  violet: "#7a6aa8",
  sky: "#3d7ea6",
  emerald: "#388068",
  orange: "#a4673a",
  pink: "#b05c80",
  indigo: "#6a70b8",
  teal: "#368080",
  red: "#b06260",
  amber: "#8f7838",
  blue: "#5179b0",
};
const IDENTITY_FOREGROUND_LIGHT: Record<IdentityColorName, string> = {
  violet: "#6d49b5",
  sky: "#3d6985",
  emerald: "#3e6e5d",
  orange: "#845838",
  pink: "#974168",
  indigo: "#5251c2",
  teal: "#3e6d6c",
  red: "#9c4243",
  amber: "#716239",
  blue: "#39649e",
};
const IDENTITY_FOREGROUND_DARK: Record<IdentityColorName, string> = {
  violet: "#a392d5",
  sky: "#6aa6ce",
  emerald: "#6cae96",
  orange: "#cc8f64",
  pink: "#d87da3",
  indigo: "#9299d5",
  teal: "#6cacab",
  red: "#d88381",
  amber: "#b29d64",
  blue: "#7ba1d5",
};

function hashKey(key: string): number {
  let hash = 0;
  for (const char of key) hash = (31 * hash + char.charCodeAt(0)) >>> 0;
  return hash;
}

/** Background of a project's letter avatar, keyed like Paseo's project view key. */
export function projectColor(viewKey: string): string {
  return IDENTITY_FILL[IDENTITY_COLOR_NAMES[hashKey(viewKey) % IDENTITY_COLOR_NAMES.length]];
}

export function isIdentityColorName(value: unknown): value is IdentityColorName {
  return typeof value === "string" && (IDENTITY_COLOR_NAMES as readonly string[]).includes(value);
}

export function projectInitial(name: string): string {
  const match = name.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? name.charAt(0)).toUpperCase();
}

export interface SidebarPalette {
  dark: boolean;
  foreground: string;
  foregroundMuted: string;
  foregroundExtraMuted: string;
  hover: string;
  pressed: string;
  menu: string;
  border: string;
  running: string;
  success: string;
  warning: string;
  danger: string;
  identityForeground(color: IdentityColorName): string;
}

function isDarkColor(color: string): boolean {
  const hex = color.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return false;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function sidebarPalette(theme: PluginTheme): SidebarPalette {
  const { colors } = theme;
  const dark = isDarkColor(colors.surface0);
  return {
    dark,
    foreground: colors.foreground,
    foregroundMuted: colors.foregroundMuted,
    foregroundExtraMuted: dark ? "#717574" : "#a1a1aa",
    hover: dark ? colors.surface1 : "#e4e4e7",
    pressed: colors.surface2,
    menu: colors.surface0,
    border: colors.border,
    running: dark ? "#5caaf6" : "#268ae0",
    success: dark ? "#35c264" : "#299f51",
    warning: dark ? "#db932e" : "#b37824",
    danger: dark ? "#f7796d" : "#f12e2f",
    identityForeground: (color) =>
      (dark ? IDENTITY_FOREGROUND_DARK : IDENTITY_FOREGROUND_LIGHT)[color],
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short activity age in the sidebar's style: now, 5m, 3h, 2d, Oct 15. */
export function shortAge(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const minutes = Math.floor(Math.max(0, now - time) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const date = new Date(time);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
