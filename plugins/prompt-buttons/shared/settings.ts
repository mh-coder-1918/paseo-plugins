import { defineSettings, settingsRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Built-in icons, offered in the picker before the Lucide set. Keys are stored as the icon. */
export const CUSTOM_ICON_PREFIX = "custom:";

export const DEFAULT_FINISH_PROMPT = `Wrap this up so I can archive the chat. Anything that lives only in this chat is lost once I archive it.

1. Finish the work and leave the repository clean: run the project's checks and fix what you broke.
2. Private repositories only (check with gh repo view --json visibility; skip this step in a public one): write down what the chat settled. Go through the whole conversation, not just the diff, and list every decision, correction or preference I gave, fact or how-to we found, status change (who promised what, by when) and open follow-up. Put each one in the file where the next person would look for it: the project's docs, notes, status or tracker files, a playbook or skill, or CLAUDE.md. This applies even when the work itself happened in HubSpot, Gmail, Slack, a calendar or another outside tool. If it belongs to a different private repo, write it there on a new branch and open a pull request, but leave the merge to me: don't merge it or push to that repo's main branch. Your memory doesn't count: it isn't committed and other sessions can't see it. Leave personal data out; record the decision, not the contact details.
3. Commit this chat's changes with a clear message, push the branch, and open or update its pull request. Leave other sessions' uncommitted work alone.
4. Merge this chat's own pull request, the one in the repository this chat runs in, into the main branch once the checks pass. Merge nothing else: no pull request in another repository, and none that another session opened.
5. Reply with a short summary: what landed and in which files, links to the pull requests in other repositories that wait for me to merge them, anything you chose not to write down and why, and anything else still on me.

If a step is blocked — failing checks, conflicts — stop there and tell me instead of forcing it. In a private repository, "nothing to commit" is only an acceptable answer after step 2 finds nothing worth keeping; if so, say what you checked. In a public one, nothing to commit is a blocker too.`;

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
