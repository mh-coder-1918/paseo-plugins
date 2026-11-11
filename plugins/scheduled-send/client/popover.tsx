import type { PluginButtonContentProps, PluginClientContext, PluginComposer } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ScheduledMessage } from "../shared/schedule";
import type { MessageStore } from "./messages";
import { formatFromNow, formatWhen, parseFields, PRESETS, toFields, type WhenFields } from "./when";

type Palette = PluginButtonContentProps["theme"]["colors"];

// The pill always opens in a chat, so the agent is passed explicitly rather than read from the
// union of button contexts.
export type SendLaterPopoverProps = PluginButtonContentProps & {
  client: PluginClientContext;
  store: MessageStore;
  agentId: string;
};

/** The chat's composer, on apps new enough to share it with plugins. */
function composerOf(client: PluginClientContext, agentId: string): PluginComposer | null {
  if (typeof client.composers !== "function") return null;
  return client.composers({ agentId })[0] ?? null;
}

function useMessages(store: MessageStore, agentId: string): readonly ScheduledMessage[] {
  const [messages, setMessages] = useState(() => store.forAgent(agentId));
  useEffect(() => {
    setMessages(store.forAgent(agentId));
    return store.subscribe(() => setMessages(store.forAgent(agentId)));
  }, [store, agentId]);
  return messages;
}

/** Ticks every half minute so "in 5 min" and the past-time check stay true while the popover is open. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function TextButton({
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
        height: 30,
        justifyContent: "center",
        paddingHorizontal: 12,
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

function Chip({ label, palette, onPress }: { label: string; palette: Palette; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        height: 26,
        justifyContent: "center",
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Text numberOfLines={1} style={{ color: palette.foregroundMuted, fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Label({ text, palette }: { text: string; palette: Palette }) {
  return <Text style={{ color: palette.foregroundMuted, fontSize: 12, fontWeight: "500" }}>{text}</Text>;
}

function QueuedRow({
  message,
  palette,
  now,
  onCancel,
}: {
  message: ScheduledMessage;
  palette: Palette;
  now: Date;
  onCancel(): void;
}) {
  const when = new Date(message.sendAt);
  const status =
    message.status === "failed"
      ? `Not sent: ${message.error ?? "unknown error"}`
      : message.status === "sending"
        ? "Sending now…"
        : message.error
          ? `Retrying shortly: ${message.error}`
          : when.getTime() <= now.getTime()
            ? "Due, going out shortly"
            : `${formatWhen(when)} · ${formatFromNow(when, now)}`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: palette.foreground, fontSize: 13 }}>
          {message.text}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            color: message.status === "failed" ? palette.statusDanger : palette.foregroundMuted,
            fontSize: 12,
          }}
        >
          {status}
        </Text>
      </View>
      {message.status === "sending" ? null : (
        <TextButton
          label={message.status === "failed" ? "Dismiss" : "Cancel"}
          palette={palette}
          tone="danger"
          onPress={onCancel}
        />
      )}
    </View>
  );
}

/** Pick a message and a time; the daemon on this host sends it then. */
export function SendLaterPopover({ client, store, agentId, theme, host, close }: SendLaterPopoverProps) {
  const palette = theme.colors;
  const now = useNow();
  const messages = useMessages(store, agentId);
  // The draft in the composer is the natural thing to send later, so it is taken as the start.
  const [draft] = useState(() => composerOf(client, agentId)?.prompt ?? "");
  const [text, setText] = useState(draft);
  const [fields, setFields] = useState<WhenFields>(() => toFields(PRESETS[1]!.pick(new Date())));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseFields(fields, now), [fields, now]);
  const problem = !text.trim() ? "Write the message to send." : "problem" in parsed ? parsed.problem : null;

  const schedule = async () => {
    if (!("when" in parsed) || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await store.create({ agentId, text, sendAt: parsed.when });
      // Clear the composer only if it still holds what was scheduled, never newer typing.
      const composer = composerOf(client, agentId);
      if (composer && draft && composer.prompt === draft) composer.setPrompt("");
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setError(null);
    try {
      await store.cancel(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const input = {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface1,
    color: palette.foreground,
    fontSize: 13,
  } as const;

  return (
    <View style={{ width: 360, maxWidth: "100%", padding: 14, gap: 10 }}>
      <Label text="Message" palette={palette} />
      <TextInput
        multiline
        value={text}
        onChangeText={setText}
        placeholder="What to send to this chat"
        placeholderTextColor={palette.foregroundMuted}
        style={{ ...input, minHeight: 90, maxHeight: 200, padding: 10, lineHeight: 18, textAlignVertical: "top" }}
      />

      <Label text="When" palette={palette} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {PRESETS.map((preset) => (
          <Chip
            key={preset.label}
            label={preset.label}
            palette={palette}
            onPress={() => setFields(toFields(preset.pick(new Date())))}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={fields.date}
          onChangeText={(date) => setFields({ ...fields, date })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={palette.foregroundMuted}
          style={{ ...input, flex: 3, height: 34, paddingHorizontal: 10 }}
        />
        <TextInput
          value={fields.time}
          onChangeText={(time) => setFields({ ...fields, time })}
          placeholder="HH:MM"
          placeholderTextColor={palette.foregroundMuted}
          style={{ ...input, flex: 2, height: 34, paddingHorizontal: 10 }}
        />
      </View>
      <Text style={{ color: problem ? palette.statusDanger : palette.foregroundMuted, fontSize: 12 }}>
        {problem ??
          ("when" in parsed ? `Sends ${formatWhen(parsed.when)}, ${formatFromNow(parsed.when, now)}.` : "")}
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <TextButton label="Close" palette={palette} onPress={close} />
        <TextButton
          label={busy ? "Scheduling…" : "Schedule"}
          palette={palette}
          tone="accent"
          disabled={busy || problem !== null}
          onPress={() => void schedule()}
        />
      </View>
      {error ? <Text style={{ color: palette.statusDanger, fontSize: 12 }}>{error}</Text> : null}

      {messages.length > 0 ? (
        <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border }}>
          <Label text="Scheduled for this chat" palette={palette} />
          {messages.map((message) => (
            <QueuedRow
              key={message.id}
              message={message}
              palette={palette}
              now={now}
              onCancel={() => void cancel(message.id)}
            />
          ))}
        </View>
      ) : null}

      <Text style={{ color: palette.foregroundMuted, fontSize: 11, lineHeight: 15 }}>
        {`${host.label} sends it at that time, even with this app closed. If ${host.label} is asleep or off then, it goes out as soon as it is back.`}
      </Text>
    </View>
  );
}
