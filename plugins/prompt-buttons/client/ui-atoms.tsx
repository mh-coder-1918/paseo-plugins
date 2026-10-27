import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { resolveIcon } from "./icons";

export type Palette = PluginTheme["colors"];

/** Draws a stored icon, whether it names a Lucide icon or one of the built-in drawings. */
export function StoredIcon({ icon, size, color }: { icon: string; size: number; color: string }) {
  const resolved = resolveIcon(icon);
  return typeof resolved === "string" ? (
    <Icon name={resolved} size={size} color={color} />
  ) : (
    <Icon icon={resolved} size={size} color={color} />
  );
}

export function TextButton({
  label,
  palette,
  tone = "neutral",
  disabled = false,
  onPress,
}: {
  label: string;
  palette: Palette;
  tone?: "neutral" | "accent" | "danger";
  disabled?: boolean;
  onPress(): void;
}) {
  const background =
    tone === "accent" ? palette.accent : tone === "danger" ? "transparent" : palette.surface2;
  const color =
    tone === "accent"
      ? palette.accentForeground
      : tone === "danger"
        ? palette.statusDanger
        : palette.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        height: 32,
        justifyContent: "center",
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: tone === "accent" ? palette.accent : palette.border,
        backgroundColor: background,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color, fontSize: 13, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

/** A small toggle used for scope choices and project selection. */
export function Chip({
  label,
  selected,
  palette,
  onPress,
}: {
  label: string;
  selected: boolean;
  palette: Palette;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        height: 28,
        justifyContent: "center",
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? palette.accent : palette.border,
        backgroundColor: selected ? palette.accent : "transparent",
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: selected ? palette.accentForeground : palette.foregroundMuted, fontSize: 12 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({ label, palette, children }: { label: string; palette: Palette; children: ReactNode }) {
  return (
    <>
      <Text style={{ color: palette.foregroundMuted, fontSize: 12, fontWeight: "500" }}>{label}</Text>
      {children}
    </>
  );
}
