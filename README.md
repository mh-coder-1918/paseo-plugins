# Paseo plugins

My own [Paseo](https://paseo.sh) plugins. Each plugin lives in its own folder under `plugins/`.

| Plugin | What it does | Needs |
| --- | --- | --- |
| [`pdf-viewer`](plugins/pdf-viewer/OVERVIEW.md) | Opens PDFs in the file tab when you click them in **Files** | Paseo 0.13+ on the daemon and the app |
| [`active-projects`](plugins/active-projects/OVERVIEW.md) | Lists projects with open chats or agents at the top of the sidebar, across all hosts | Paseo 0.13+ on the daemon and the app |

## Install on a machine (VPS or other computer)

Every Paseo daemon needs its own install. Repeat this on each machine you connect to.

### 1. Paseo 0.13 or newer

```bash
paseo --version
```

If it is lower than `0.13.0-beta.1`, upgrade and restart the daemon. Check `daemonVersion` in `paseo daemon status` too: the daemon keeps running the old version until it restarts. Restarting stops agents running on that daemon.

```bash
npm install -g @getpaseo/cli@beta
paseo daemon restart
```

### 2. Access to this private repository

The daemon clones this repo with `git`, so the machine must be able to read it. Use **one** of these:

**GitHub CLI login (simplest; gives the machine access to your whole account)**

If `gh auth status` already shows you logged in, this is all you need:

```bash
gh auth login        # skip if already logged in
gh auth setup-git    # lets plain git use the gh login for github.com
git ls-remote https://github.com/mh-coder-1918/paseo-plugins.git   # should list refs/heads/main
```

The source to install is then `https://github.com/mh-coder-1918/paseo-plugins.git:plugins/<plugin>`.

**Deploy key (read-only access to this repo only)**

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/paseo_plugins -C "paseo-plugins $(hostname)"
cat ~/.ssh/paseo_plugins.pub
```

Add the printed key in GitHub under **this repo → Settings → Deploy keys → Add deploy key**, with write access off. Then on the machine give the key its own host alias, so it doesn't replace any other GitHub key the machine uses:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-paseo
  HostName github.com
  User git
  IdentityFile ~/.ssh/paseo_plugins
  IdentitiesOnly yes
EOF
```

The daemon clones without a prompt, so GitHub's host key must already be trusted. Check that the fingerprint printed here is `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU` ([GitHub's published key](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)) before adding it:

```bash
ssh-keyscan -t ed25519 github.com > /tmp/gh_hostkey && ssh-keygen -lf /tmp/gh_hostkey
cat /tmp/gh_hostkey >> ~/.ssh/known_hosts && rm /tmp/gh_hostkey
git ls-remote git@github-paseo:mh-coder-1918/paseo-plugins.git   # should list refs/heads/main
```

The source to install is then `git@github-paseo:mh-coder-1918/paseo-plugins.git:plugins/<plugin>`.

### 3. Turn on plugins

Plugins are trusted code. Their server code runs on the machine with the daemon user's access to files, processes and credentials. Turn plugins on only if you agree to that.

Set `pluginsEnabled` to `true` in the daemon's `config.json` and keep the rest of the file. `paseo daemon status` shows the daemon home; the default is `~/.paseo`.

```bash
cp ~/.paseo/config.json ~/.paseo/config.json.bak
node -e '
const fs = require("fs");
const p = process.env.HOME + "/.paseo/config.json";
const c = JSON.parse(fs.readFileSync(p, "utf8"));
c.pluginsEnabled = true;
fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
'
paseo reload --json   # "pluginsEnabled" should be listed under appliedPaths
```

### 4. Install a plugin

With the GitHub CLI login:

```bash
paseo plugin install https://github.com/mh-coder-1918/paseo-plugins.git:plugins/pdf-viewer
```

With a deploy key:

```bash
paseo plugin install git@github-paseo:mh-coder-1918/paseo-plugins.git:plugins/pdf-viewer
```

Installing also adds a `plugins.<id>` entry to the daemon's `config.json`; that is Paseo's own bookkeeping. No daemon restart is needed.

Then check it:

```bash
paseo plugin ls             # pdf-viewer should be "running"
paseo plugin logs pdf-viewer
```

### 5. Try the PDF viewer

Open a workspace on that machine in the Paseo app and click a `.pdf` in **Files**. If Paseo asks which viewer to use, choose **PDF** and tick "Don't ask me again". The app on your computer must also be 0.13 or newer.

## Update

After changes are pushed here, run this on each machine:

```bash
paseo plugin update pdf-viewer
```

## Develop

On the Mac, the plugin is installed straight from this folder, so edits only need a reload:

```bash
cd plugins/pdf-viewer
npm install          # once, for typechecking
npm run typecheck
paseo plugin reload pdf-viewer
```

Commit and push when it works, then run `paseo plugin update` on the other machines.

To add a plugin, run `paseo plugin init "$PWD/plugins/<name>"` and add it to the table above.

## Notes

- `pdf-viewer` also has **PDF viewer** and **PDFs** tabs from before Paseo 0.13. They draw pages with macOS PDFKit, so they only work when the daemon runs on macOS. Clicking PDFs in **Files** works on any system.
- `active-projects` runs only in the app and lists projects from every host the app is connected to, so installing it on one daemon should be enough while the app is connected to that daemon. Its list sits above the Workspaces list because plugins can only add rows to the top of the sidebar. Install it on one daemon only, or the list may appear once per daemon.
