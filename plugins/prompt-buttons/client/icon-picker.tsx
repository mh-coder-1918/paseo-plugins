import { Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CUSTOM_ICONS, customIconId } from "./icons";
import { LUCIDE_ICON_NAMES } from "./lucide-names";
import { type Palette, StoredIcon } from "./ui-atoms";

const RESULT_LIMIT = 180;
const CELL = 44;

const CUSTOM_IDS = CUSTOM_ICONS.map((icon) => customIconId(icon.key));

function matches(query: string): string[] {
  const needle = query.trim().toLowerCase().replace(/[\s-]/g, "");
  const custom = CUSTOM_ICONS.filter(
    (icon) => !needle || icon.title.toLowerCase().replace(/[\s-]/g, "").includes(needle),
  ).map((icon) => customIconId(icon.key));
  if (!needle) return [...custom, ...LUCIDE_ICON_NAMES.slice(0, RESULT_LIMIT - custom.length)];
  const names: string[] = [];
  for (const name of LUCIDE_ICON_NAMES) {
    if (name.toLowerCase().includes(needle)) names.push(name);
    if (names.length + custom.length >= RESULT_LIMIT) break;
  }
  return [...custom, ...names];
}

/** Searches every icon Paseo can draw, plus the plugin's own drawings, and returns the stored id. */
export function IconPicker({
  open,
  selected,
  palette,
  onPick,
  onClose,
}: {
  open: boolean;
  selected: string;
  palette: Palette;
  onPick(icon: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => matches(query), [query]);

  return (
    <Modal
      title="Choose an icon"
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content scrollable={false} contentContainerStyle={{ padding: 16, gap: 12, flex: 1 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${LUCIDE_ICON_NAMES.length} icons — rocket, merge, flag…`}
          placeholderTextColor={palette.foregroundMuted}
          autoFocus
          style={{
            height: 36,
            paddingHorizontal: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface1,
            color: palette.foreground,
            fontSize: 13,
          }}
        />
        <ScrollView contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {results.map((icon) => {
            const isSelected = icon === selected;
            return (
              <Pressable
                key={icon}
                accessibilityRole="button"
                accessibilityLabel={icon}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onPick(icon)}
                style={{
                  width: CELL,
                  height: CELL,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isSelected ? palette.accent : "transparent",
                  backgroundColor: isSelected ? palette.surface2 : "transparent",
                }}
              >
                <StoredIcon icon={icon} size={20} color={palette.foreground} />
              </Pressable>
            );
          })}
          {results.length === 0 ? (
            <Text style={{ color: palette.foregroundMuted, fontSize: 13 }}>No icon matches that.</Text>
          ) : null}
        </ScrollView>
        <Text style={{ color: palette.foregroundMuted, fontSize: 11 }}>
          {CUSTOM_IDS.length} drawn here, {LUCIDE_ICON_NAMES.length} from Lucide. Showing the first{" "}
          {Math.min(results.length, RESULT_LIMIT)}.
        </Text>
      </Modal.Content>
    </Modal>
  );
}
