// Owns the WebSockets: page content scripts are blocked by Chrome's Local Network Access
// from reaching tailnet (100.x) addresses, the extension origin is not.
chrome.runtime.onConnect.addListener((port) => {
  const { server, room } = JSON.parse(port.name);
  const ws = new WebSocket(`${server}?room=${encodeURIComponent(room)}`);
  const post = (m) => { try { port.postMessage(m); } catch {} };
  ws.onopen = () => post({ ev: "open" });
  ws.onmessage = (e) => post({ ev: "msg", data: e.data });
  ws.onerror = () => post({ ev: "error" });
  ws.onclose = () => (post({ ev: "close" }), port.disconnect());
  port.onMessage.addListener((m) => ws.readyState === 1 && ws.send(JSON.stringify(m)));
  port.onDisconnect.addListener(() => ws.close());
});
