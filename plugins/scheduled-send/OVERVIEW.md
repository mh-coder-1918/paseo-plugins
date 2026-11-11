Adds a **Send later** pill to every chat's composer. Press it, check the message (it starts from whatever you have typed in the composer), pick a time, and press **Schedule**. The daemon that runs the chat sends the message at that time, so the app can be closed and your computer asleep.

The daemon on the chat's host holds the message, not the app. For chats on a server, the message goes out on time even while your laptop sleeps. For chats on your own computer, the daemon sleeps with the computer, so the message goes out as soon as the computer wakes.

The pill shows how many messages are waiting for that chat. Open it to see them, cancel one, or clear one that failed. A failed send is retried twice, 30 seconds apart, before it is marked as not sent. If the daemon restarts while a message is going out, that message is marked as failed rather than sent again, because it may already have arrived.

Waiting messages are stored in `<paseo home>/plugin-data/scheduled-send/messages.json` on each host. After a daemon restart, the plugin can send only after an app has connected to that daemon or a chat on it has started a turn.
