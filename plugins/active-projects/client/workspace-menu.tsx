import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Dimensions, Modal as NativeModal, Pressable, Text, View } from "react-native";
import type { SidebarPalette } from "./look";

export interface MenuAction {
  id: string;
  label: string;
  icon: string;
  onSelect(): void;
}

const MENU_WIDTH = 240;
const ITEM_HEIGHT = 36;

/** A context menu at the pointer, styled like Paseo's workspace menu. */
export function ContextMenu({
  position,
  actions,
  palette,
  onClose,
}: {
  position: { x: number; y: number } | null;
  actions: readonly MenuAction[];
  palette: SidebarPalette;
  onClose(): void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (!position) return null;
  const window = Dimensions.get("window");
  const height = actions.length * ITEM_HEIGHT + 8;
  const left = Math.max(8, Math.min(position.x, window.width - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(position.y, window.height - height - 8));
  return (
    <NativeModal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" style={{ flex: 1 }} onPress={onClose}>
        <View
          style={{
            position: "absolute",
            left,
            top,
            width: MENU_WIDTH,
            padding: 4,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.menu,
            shadowColor: "#000000",
            shadowOpacity: palette.dark ? 0.4 : 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="menuitem"
              onHoverIn={() => setHovered(action.id)}
              onHoverOut={() => setHovered((current) => (current === action.id ? null : current))}
              onPress={() => {
                onClose();
                action.onSelect();
              }}
              style={{
                height: ITEM_HEIGHT,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: hovered === action.id ? palette.hover : "transparent",
              }}
            >
              <Icon name={action.icon} size={16} color={palette.foregroundMuted} />
              <Text style={{ color: palette.foreground, fontSize: 14 }}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </NativeModal>
  );
}

export function RenameDialog({
  initialTitle,
  palette,
  onSave,
  onClose,
}: {
  initialTitle: string | null;
  palette: SidebarPalette;
  onSave(title: string): Promise<void>;
  onClose(): void;
}) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(title.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };
  const button = { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 };
  return (
    <Modal title="Rename workspace" open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <TextInput
          autoFocus
          accessibilityLabel="Workspace title"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={() => void save()}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderWidth: 1,
            borderRadius: 8,
            borderColor: palette.border,
            color: palette.foreground,
            fontSize: 14,
          }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={onClose} style={[button, { backgroundColor: palette.hover }]}>
            <Text style={{ color: palette.foreground }}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void save()}
            style={[button, { backgroundColor: palette.foreground, opacity: saving ? 0.5 : 1 }]}
          >
            <Text style={{ color: palette.menu }}>Save</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
