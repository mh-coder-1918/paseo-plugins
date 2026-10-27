import { useEffect, useState } from "react";

// Which workspace the app is showing, so its row can be marked in the list. Paseo gives sidebar
// items no API for this, so it is read from the app's address: /h/<serverId>/workspace/<id>.
// Native mobile apps have no address bar, so nothing is marked there.

interface LocationLike {
  href: string;
}

export interface CurrentWorkspace {
  serverId: string;
  workspaceId: string;
}

const WORKSPACE_ROUTE = /\/h\/([^/?#]+)\/workspace\/([^/?#]+)/;
// The address changes without an event plugins can hear, so it is re-read on a timer.
const POLL_MS = 400;

const location = (globalThis as { location?: LocationLike }).location;

function readCurrent(): CurrentWorkspace | null {
  try {
    const match = location?.href.match(WORKSPACE_ROUTE);
    if (!match) return null;
    return { serverId: decodeURIComponent(match[1]), workspaceId: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function same(a: CurrentWorkspace | null, b: CurrentWorkspace | null): boolean {
  return a?.serverId === b?.serverId && a?.workspaceId === b?.workspaceId;
}

/** The workspace the app is showing, or null while it shows something else. */
export function useCurrentWorkspace(): CurrentWorkspace | null {
  const [current, setCurrent] = useState<CurrentWorkspace | null>(readCurrent);
  useEffect(() => {
    if (!location) return;
    const read = () => setCurrent((previous) => (same(previous, readCurrent()) ? previous : readCurrent()));
    read();
    const timer = setInterval(read, POLL_MS);
    return () => clearInterval(timer);
  }, []);
  return current;
}

export function isCurrent(
  current: CurrentWorkspace | null,
  serverId: string,
  workspaceId: string,
): boolean {
  return current?.serverId === serverId && current.workspaceId === workspaceId;
}
