**What I'm trying to do**
Keep only the projects I'm working in right now visible in the sidebar. I have about 25 projects across three hosts (my Mac and two VPSs). On any given day I have open chats in a handful of them.

**How I do it today**
The Project filter gives me two choices. With **All projects**, every project shows up, including the ones with no open workspaces, so the sidebar is mostly empty project groups with a "New workspace" row under each. With a hand-picked list, I have to re-tick projects every time I start work in a new one and untick them when I'm done.

**Where Paseo gets in the way**
The sidebar already knows which projects are empty: the daemon sends them separately (`emptyProjects` in `fetch_workspaces_response`, `emptyProject` on workspace removals). But there's no way to say "skip those".

**What a better workflow would look like**
A third choice in **Display → Project**, for example **Active projects**, or a **Hide empty projects** toggle next to **Show background**. With it on:

- Starting a chat or agent in a project makes the project appear.
- Archiving the project's last workspace hides it again.
- Hidden projects stay in the new-workspace project picker and in search, and keep their custom name and icon.

Unlike a hand-picked filter set, this needs no upkeep. Unlike recency sorting, the idle projects are gone rather than pushed down.

To check that the workflow holds up, I built it as a client plugin: it lists projects with open workspaces across all hosts in the sidebar header. It works, but plugins can only add rows above the Workspaces list, so it duplicates the native list instead of filtering it.
