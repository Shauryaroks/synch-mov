# synch-mov

Watch YouTube in sync with friends — a lighter, faster Teleparty.

- Synced play / pause / seek / speed, and video changes
- Late joiners land at the current position
- In-page chat panel + popup
- Tiny Bun relay server, no dependencies

## Install the extension
1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → pick the `extension/` folder
3. Open YouTube, click the icon → **Create a room**, share the code

## Run the server
```
cd server && bun server.js   # PORT env, default 8787
```
Set the `wss://…` URL in the popup's **Server** field.
