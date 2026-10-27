Lets you keep your own buttons in the chat composer, next to Paseo's own pills. Each button has a label, an icon and a prompt; pressing it sends that prompt to the chat, so an instruction you repeat all the time becomes one click.

Edit them under **Settings → Prompt buttons**. A button can appear in every chat, or only in chats belonging to projects you pick — useful when the wrap-up for one repository is nothing like the wrap-up for another.

The icon picker searches every Lucide icon Paseo can draw, plus a chequered flag drawn by the plugin. Buttons are stored per host, so each machine keeps its own set, and the shipped default is a **Finish** button that asks the chat to commit, push, merge and summarise before you archive it.

Saving updates the pills straight away in the app you saved from. A save made in another app or on another device is picked up the next time that app loads the plugin.

Regenerate the bundled Lucide name list after a Paseo upgrade with:

```bash
grep -o 'Object\.defineProperty(f,"[A-Za-z0-9]*"' \
  /Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web/index-*.js |
  sed 's/.*"\(.*\)"/\1/' | grep -vE '^Lucide|Icon$' | sort -u
```
