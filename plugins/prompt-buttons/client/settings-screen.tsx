import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { usePaseo, useSettings } from "@getpaseo/plugin/client";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FINISH_BUTTON, type PromptButton, promptButtonsSettings } from "../shared/settings";
import { IconPicker } from "./icon-picker";
import { publishSavedButtons } from "./settings-bus";
import { Chip, Field, type Palette, StoredIcon, TextButton } from "./ui-atoms";

export const PROMPT_BUTTONS_SCREEN = "prompt-buttons";

interface Project {
  projectId: string;
  name: string;
}

function newButton(): PromptButton {
  const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id, label: "New button", icon: "MessageSquarePlus", prompt: "", scope: { kind: "global" } };
}

function sameButtons(a: readonly PromptButton[], b: readonly PromptButton[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function problemWith(buttons: readonly PromptButton[]): string | null {
  for (const button of buttons) {
    if (!button.label.trim()) return "Every button needs a label.";
    if (!button.prompt.trim()) return `"${button.label}" has no prompt.`;
    if (button.scope.kind === "projects" && button.scope.projectIds.length === 0) {
      return `"${button.label}" is limited to projects but none are chosen.`;
    }
  }
  return null;
}

/** The live project list on this host, for the per-project scope. */
function useProjects(): Project[] {
  const paseo = usePaseo();
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    let alive = true;
    paseo.projects.list().then(
      ({ projects: entries }) => {
        if (!alive) return;
        setProjects(
          entries
            .map((entry) => ({
              projectId: entry.projectId,
              name: entry.projectCustomName || entry.projectDisplayName,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      (error: unknown) => console.error("prompt-buttons: listing projects failed", error),
    );
    return () => {
      alive = false;
    };
  }, [paseo]);
  return projects;
}

function ButtonCard({
  button,
  palette,
  projects,
  onChange,
  onRemove,
}: {
  button: PromptButton;
  palette: Palette;
  projects: readonly Project[];
  onChange(next: PromptButton): void;
  onRemove(): void;
}) {
  const [picking, setPicking] = useState(false);
  const chosen = button.scope.kind === "projects" ? button.scope.projectIds : [];

  const input = {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface1,
    color: palette.foreground,
    fontSize: 13,
  } as const;

  return (
    <View
      style={{
        gap: 10,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface0,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose an icon"
          onPress={() => setPicking(true)}
          style={{
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface2,
          }}
        >
          <StoredIcon icon={button.icon} size={18} color={palette.foreground} />
        </Pressable>
        <TextInput
          value={button.label}
          onChangeText={(label) => onChange({ ...button, label })}
          placeholder="Label"
          placeholderTextColor={palette.foregroundMuted}
          style={{ ...input, flex: 1, height: 36, paddingHorizontal: 12 }}
        />
        <TextButton label="Remove" palette={palette} tone="danger" onPress={onRemove} />
      </View>

      <Field label="Prompt" palette={palette}>
        <TextInput
          multiline
          value={button.prompt}
          onChangeText={(prompt) => onChange({ ...button, prompt })}
          placeholder="What the chat is asked to do when you press the pill"
          placeholderTextColor={palette.foregroundMuted}
          style={{ ...input, minHeight: 120, padding: 12, lineHeight: 19, textAlignVertical: "top" }}
        />
      </Field>

      <Field label="Where it appears" palette={palette}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Chip
            label="Every chat"
            selected={button.scope.kind === "global"}
            palette={palette}
            onPress={() => onChange({ ...button, scope: { kind: "global" } })}
          />
          <Chip
            label="Chosen projects"
            selected={button.scope.kind === "projects"}
            palette={palette}
            onPress={() => onChange({ ...button, scope: { kind: "projects", projectIds: chosen } })}
          />
        </View>
      </Field>

      {button.scope.kind === "projects" ? (
        projects.length === 0 ? (
          <Text style={{ color: palette.foregroundMuted, fontSize: 12 }}>
            No projects on this host yet.
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {projects.map((project) => (
              <Chip
                key={project.projectId}
                label={project.name}
                selected={chosen.includes(project.projectId)}
                palette={palette}
                onPress={() =>
                  onChange({
                    ...button,
                    scope: {
                      kind: "projects",
                      projectIds: chosen.includes(project.projectId)
                        ? chosen.filter((id) => id !== project.projectId)
                        : [...chosen, project.projectId],
                    },
                  })
                }
              />
            ))}
          </View>
        )
      ) : null}

      <IconPicker
        open={picking}
        selected={button.icon}
        palette={palette}
        onPick={(icon) => {
          onChange({ ...button, icon });
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

/** Edits this host's composer buttons: label, icon, prompt, and which chats they reach. */
export function PromptButtonsScreen({ theme }: PluginSurfaceProps) {
  const palette = theme.colors;
  const settings = useSettings(promptButtonsSettings);
  const projects = useProjects();
  const [draft, setDraft] = useState<PromptButton[] | null>(null);

  const stored = useMemo(
    () => (settings.status === "ready" ? settings.values.buttons : null),
    [settings.status === "ready" ? settings.values.buttons : null],
  );

  // Follow what is stored until the list is edited here, and again after every save.
  useEffect(() => {
    setDraft(null);
  }, [stored]);

  const buttons = draft ?? stored ?? [];
  const dirty = draft !== null && stored !== null && !sameButtons(draft, stored);
  const problem = problemWith(buttons);

  const edit = (index: number, next: PromptButton) =>
    setDraft(buttons.map((button, at) => (at === index ? next : button)));

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: "600" }}>Prompt buttons</Text>
        <Text style={{ color: palette.foregroundMuted, fontSize: 13, lineHeight: 18 }}>
          Each button is a pill in the chat composer. Pressing it sends its prompt to that chat.
          Buttons are stored per host, so every machine keeps its own set.
        </Text>
      </View>

      {settings.status === "loading" ? (
        <Text style={{ color: palette.foregroundMuted, fontSize: 13 }}>Loading…</Text>
      ) : settings.status === "error" || settings.status === "invalid" ? (
        <Text style={{ color: palette.statusDanger, fontSize: 13 }}>{settings.error}</Text>
      ) : (
        <>
          {buttons.map((button, index) => (
            <ButtonCard
              key={button.id}
              button={button}
              palette={palette}
              projects={projects}
              onChange={(next) => edit(index, next)}
              onRemove={() => setDraft(buttons.filter((_, at) => at !== index))}
            />
          ))}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextButton
              label="Add a button"
              palette={palette}
              onPress={() => setDraft([...buttons, newButton()])}
            />
            {buttons.some((button) => button.id === FINISH_BUTTON.id) ? null : (
              <TextButton
                label="Add the Finish button"
                palette={palette}
                onPress={() => setDraft([...buttons, FINISH_BUTTON])}
              />
            )}
          </View>

          {problem ? (
            <Text style={{ color: palette.statusWarning, fontSize: 13 }}>{problem}</Text>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextButton
              label={settings.saving ? "Saving…" : "Save"}
              palette={palette}
              tone="accent"
              disabled={!dirty || settings.saving || problem !== null}
              onPress={() => {
                if (settings.status !== "ready") return;
                void settings.save({ buttons }, settings.revision).then((saved) => {
                  if (saved) publishSavedButtons(buttons);
                });
              }}
            />
            <TextButton
              label="Discard changes"
              palette={palette}
              disabled={!dirty || settings.saving}
              onPress={() => setDraft(null)}
            />
          </View>

          {settings.saveError ? (
            <Text style={{ color: palette.statusDanger, fontSize: 13 }}>{settings.saveError}</Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
