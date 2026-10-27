import { defineSettings, settingsRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Built-in icons, offered in the picker before the Lucide set. Keys are stored as the icon. */
export const CUSTOM_ICON_PREFIX = "custom:";

export const DEFAULT_FINISH_PROMPT = `Wrap this up so I can archive the chat.

1. Finish the work and leave the repository clean: run the project's checks and fix what you broke.
2. Commit everything with a clear message, push the branch, and open or update its pull request.
3. Merge it into the main branch once the checks pass.
4. Reply with a short summary: what landed, what you left out, and anything still on me.

If a step is blocked — failing checks, conflicts, nothing to commit — stop there and tell me instead of forcing it.`;

export const buttonScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }),
  z.object({ kind: z.literal("projects"), projectIds: z.array(z.string()).default([]) }),
]);

export const promptButtonSchema = z.object({
  /** Stable across edits: it keys the pill registration and must not be reused. */
  id: z.string().min(1),
  label: z.string().min(1).max(24),
  /** A Lucide icon name, or `custom:<key>` for one of the built-in drawings. */
  icon: z.string().min(1),
  prompt: z.string().min(1),
  scope: buttonScopeSchema,
});

export type PromptButton = z.infer<typeof promptButtonSchema>;
export type ButtonScope = z.infer<typeof buttonScopeSchema>;

export const FINISH_BUTTON: PromptButton = {
  id: "finish",
  label: "Finish",
  icon: `${CUSTOM_ICON_PREFIX}chequered-flag`,
  prompt: DEFAULT_FINISH_PROMPT,
  scope: { kind: "global" },
};

export const promptButtonsSettings = defineSettings({
  id: "buttons",
  scope: "host",
  version: 1,
  schema: z.object({
    buttons: z.array(promptButtonSchema).default([FINISH_BUTTON]),
  }),
});

export const promptButtonsRpc = settingsRpc(promptButtonsSettings.id);
