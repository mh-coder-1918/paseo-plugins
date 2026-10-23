import type { PluginHostSummary } from "@getpaseo/plugin/client";
import { type IdentityColorName, isIdentityColorName } from "./look";

export interface HostBadge {
  label: string;
  /** null when the host has no color; the badge then uses the muted foreground. */
  color: IdentityColorName | null;
}

interface StoredHost {
  serverId?: unknown;
  appearance?: { color?: unknown; badgeDisplay?: unknown };
}

// The app keeps host colors and badge settings in its own registry; the plugin API does not expose
// them. Read it when it is reachable and fall back to plain badges otherwise.
const REGISTRY_KEY = "@paseo:daemon-registry";

function readStoredHosts(): StoredHost[] {
  try {
    const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } })
      .localStorage;
    const parsed: unknown = JSON.parse(storage?.getItem(REGISTRY_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as StoredHost[]) : [];
  } catch {
    return [];
  }
}

/** Badges per server id. The local host shows none unless set otherwise, as in Paseo's sidebar. */
export function hostBadges(
  hosts: readonly PluginHostSummary[],
  localServerId: string,
): Map<string, HostBadge> {
  const stored = new Map<string, StoredHost>();
  for (const host of readStoredHosts()) {
    if (typeof host.serverId === "string") stored.set(host.serverId, host);
  }
  const badges = new Map<string, HostBadge>();
  for (const host of hosts) {
    const appearance = stored.get(host.serverId)?.appearance;
    const display =
      appearance?.badgeDisplay ?? (host.serverId === localServerId ? "hidden" : "name");
    if (display === "hidden") continue;
    badges.set(host.serverId, {
      label: host.label.trim() || host.serverId,
      color: isIdentityColorName(appearance?.color) ? appearance.color : null,
    });
  }
  return badges;
}
