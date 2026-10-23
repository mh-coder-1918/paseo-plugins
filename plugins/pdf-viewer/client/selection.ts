import { useSyncExternalStore } from "react";

// The open PDF per workspace, shared by the Explorer list and the viewer tab.
const selected = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSelectedPdf(workspaceId: string, path: string | null) {
  if (path) selected.set(workspaceId, path);
  else selected.delete(workspaceId);
  for (const listener of listeners) listener();
}

export function useSelectedPdf(workspaceId: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => selected.get(workspaceId) ?? null,
    () => selected.get(workspaceId) ?? null,
  );
}
