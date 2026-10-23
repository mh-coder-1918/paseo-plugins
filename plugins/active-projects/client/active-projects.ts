import { getPaseoClient } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";

type PaseoApi = ReturnType<typeof getPaseoClient>;
type WorkspaceList = Awaited<ReturnType<PaseoApi["workspaces"]["list"]>>;
export type Workspace = WorkspaceList["entries"][number];

export interface ActiveChat {
  serverId: string;
  hostLabel: string;
  workspace: Workspace;
}

export interface ActiveProject {
  /** Paseo's project view key: the git remote when known, else the host and project id. */
  viewKey: string;
  name: string;
  lastActivityAt: string | null;
  chats: ActiveChat[];
}

export type HostWorkspacesState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; workspaces: Workspace[] };

// The daemon rejects pages larger than 200; later pages are fetched with the cursor.
const PAGE_LIMIT = 200;

function isOpen(workspace: Workspace): boolean {
  return !workspace.archivingAt && !workspace.background && !workspace.internal;
}

function newerFirst(a: string | null, b: string | null): number {
  return (b ?? "").localeCompare(a ?? "");
}

export function projectViewKey(serverId: string, workspace: Workspace): string {
  return workspace.project?.projectKey ?? JSON.stringify([serverId, workspace.projectId]);
}

export function currentBranch(workspace: Workspace): string | null {
  return workspace.gitRuntime?.currentBranch ?? null;
}

/** Projects with at least one open workspace, most recently active first. */
export function groupByProject(chats: Iterable<ActiveChat>): ActiveProject[] {
  const projects = new Map<string, ActiveProject>();
  for (const chat of chats) {
    const { workspace } = chat;
    const viewKey = projectViewKey(chat.serverId, workspace);
    let project = projects.get(viewKey);
    if (!project) {
      const name = workspace.projectCustomName || workspace.projectDisplayName;
      project = { viewKey, name, lastActivityAt: null, chats: [] };
      projects.set(viewKey, project);
    }
    project.chats.push(chat);
    if (newerFirst(project.lastActivityAt, workspace.activityAt) > 0) {
      project.lastActivityAt = workspace.activityAt;
    }
  }
  const result = [...projects.values()];
  for (const project of result) {
    project.chats.sort((a, b) => newerFirst(a.workspace.activityAt, b.workspace.activityAt));
  }
  return result.sort(
    (a, b) => newerFirst(a.lastActivityAt, b.lastActivityAt) || a.name.localeCompare(b.name),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Live list of a host's open workspaces. Pass online=false for hosts that cannot be reached. */
export function useHostWorkspaces(serverId: string, online: boolean): HostWorkspacesState {
  const [state, setState] = useState<HostWorkspacesState>({ status: "loading" });

  useEffect(() => {
    if (!online) return;
    setState({ status: "loading" });
    const workspaces = new Map<string, Workspace>();
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let release: (() => Promise<void>) | undefined;

    const publish = () => {
      if (!disposed) setState({ status: "ready", workspaces: [...workspaces.values()].filter(isOpen) });
    };
    const fail = (error: unknown) => {
      if (!disposed) setState({ status: "error", error: errorMessage(error) });
    };
    const paseo = getPaseoClient(serverId);
    // The subscription snapshot holds the first page only; the rest are read once per snapshot.
    const loadRest = async (cursor: string | null) => {
      while (cursor && !disposed) {
        const page = await paseo.workspaces.list({ page: { limit: PAGE_LIMIT, cursor } });
        for (const workspace of page.entries) {
          if (!workspaces.has(workspace.id)) workspaces.set(workspace.id, workspace);
        }
        cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
      }
    };
    const replace = (snapshot: WorkspaceList) => {
      workspaces.clear();
      for (const workspace of snapshot.entries) workspaces.set(workspace.id, workspace);
      publish();
      const { hasMore, nextCursor } = snapshot.pageInfo;
      if (hasMore) loadRest(nextCursor).then(publish, fail);
    };

    paseo.workspaces
      .list({ subscribe: {}, page: { limit: PAGE_LIMIT } })
      .then((result) => {
        const { subscription } = result;
        release = () => subscription.release();
        if (disposed) {
          void release();
          return;
        }
        replace(result);
        unsubscribe = subscription.subscribe({
          snapshot: replace,
          update: (message) => {
            if (message.type !== "workspace_update") return;
            const update = message.payload;
            if (update.kind === "upsert") workspaces.set(update.workspace.id, update.workspace);
            else workspaces.delete(update.id);
            publish();
          },
          error: fail,
        });
      }, fail);

    return () => {
      disposed = true;
      unsubscribe?.();
      void release?.();
    };
  }, [serverId, online]);

  return state;
}
