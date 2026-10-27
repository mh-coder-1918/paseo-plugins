import { getPaseoClient } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import type { SortMode } from "./project-sort";

type PaseoApi = ReturnType<typeof getPaseoClient>;
type WorkspaceList = Awaited<ReturnType<PaseoApi["workspaces"]["list"]>>;
export type Workspace = WorkspaceList["entries"][number];

export interface ActiveChat {
  serverId: string;
  hostLabel: string;
  /** Paseo's project view key: the git remote when known, else the host and project id. */
  viewKey: string;
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
  | { status: "ready"; workspaces: Workspace[]; viewKeys: ReadonlyMap<string, string> };

// The daemon rejects pages larger than 200; later pages are fetched with the cursor.
const PAGE_LIMIT = 200;

function isOpen(workspace: Workspace): boolean {
  return !workspace.archivingAt && !workspace.background && !workspace.internal;
}

function newerFirst(a: string | null, b: string | null): number {
  return (b ?? "").localeCompare(a ?? "");
}

function placementKey(serverId: string, projectId: string): string {
  return JSON.stringify([serverId, projectId]);
}

/**
 * Project id to view key, as Paseo's sidebar derives it: a project key shared by exactly one
 * project on the host groups across hosts; otherwise the project stays tied to its host.
 */
function viewKeysFor(serverId: string, projects: readonly { projectId: string; projectKey?: string }[]) {
  const keyCounts = new Map<string, number>();
  for (const { projectKey } of projects) {
    if (projectKey) keyCounts.set(projectKey, (keyCounts.get(projectKey) ?? 0) + 1);
  }
  const viewKeys = new Map<string, string>();
  for (const { projectId, projectKey } of projects) {
    viewKeys.set(
      projectId,
      projectKey && keyCounts.get(projectKey) === 1 ? projectKey : placementKey(serverId, projectId),
    );
  }
  return viewKeys;
}

export function projectViewKey(
  serverId: string,
  workspace: Workspace,
  viewKeys: ReadonlyMap<string, string>,
): string {
  return viewKeys.get(workspace.projectId) ?? placementKey(serverId, workspace.projectId);
}

export function currentBranch(workspace: Workspace): string | null {
  return workspace.gitRuntime?.currentBranch ?? null;
}

/** Orders projects the way the sidebar's sort choice asks for; ties fall back to the name. */
function compareProjects(sort: SortMode): (a: ActiveProject, b: ActiveProject) => number {
  const byName = (a: ActiveProject, b: ActiveProject) => a.name.localeCompare(b.name);
  if (sort === "name") return byName;
  if (sort === "chats") return (a, b) => b.chats.length - a.chats.length || byName(a, b);
  return (a, b) => newerFirst(a.lastActivityAt, b.lastActivityAt) || byName(a, b);
}

/** Projects with at least one open workspace, in the order the sort choice asks for. */
export function groupByProject(chats: Iterable<ActiveChat>, sort: SortMode = "recent"): ActiveProject[] {
  const projects = new Map<string, ActiveProject>();
  for (const chat of chats) {
    const { workspace } = chat;
    const { viewKey } = chat;
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
  return result.sort(compareProjects(sort));
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
    let viewKeys: ReadonlyMap<string, string> = new Map();
    let loadingProjects: Promise<void> | null = null;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let release: (() => Promise<void>) | undefined;

    const publish = () => {
      if (!disposed) {
        setState({ status: "ready", workspaces: [...workspaces.values()].filter(isOpen), viewKeys });
      }
    };
    const fail = (error: unknown) => {
      if (!disposed) setState({ status: "error", error: errorMessage(error) });
    };
    const paseo = getPaseoClient(serverId);
    // Workspaces carry only the project id; the project key that groups and colors projects
    // comes from the project list. Reload it whenever a workspace names a project not seen yet.
    const loadProjects = () => {
      loadingProjects ??= paseo.projects
        .list()
        .then(({ projects }) => {
          viewKeys = viewKeysFor(serverId, projects);
          publish();
        }, fail)
        .finally(() => {
          loadingProjects = null;
        });
    };
    const ensureProject = (workspace: Workspace) => {
      if (!viewKeys.has(workspace.projectId)) loadProjects();
    };
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
      loadProjects();
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
            if (update.kind === "upsert") {
              workspaces.set(update.workspace.id, update.workspace);
              ensureProject(update.workspace);
            } else {
              workspaces.delete(update.id);
            }
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
