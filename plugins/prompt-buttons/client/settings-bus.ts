import type { PromptButton } from "../shared/settings";

type Listener = (buttons: readonly PromptButton[]) => void;

const listeners = new Set<Listener>();

/** Lets the settings screen push a save straight to the pills in this client. */
export function onButtonsSaved(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishSavedButtons(buttons: readonly PromptButton[]) {
  for (const listener of listeners) listener(buttons);
}
