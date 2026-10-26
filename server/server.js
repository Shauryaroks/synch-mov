// Relay: rooms of sockets, last state replayed to joiners. Run: bun server.js
// ponytail: in-memory rooms, lost on restart; fine for watch parties.
const rooms = new Map(); // code -> { peers: Set, state }

Bun.serve({
  port: process.env.PORT || 8787,
  fetch(req, srv) {
    const room = new URL(req.url).searchParams.get("room");
    if (room && /^[A-Za-z0-9]{1,32}$/.test(room) && srv.upgrade(req, { data: { room } })) return;
    return new Response("synch-mov relay");
  },
  websocket: {
    open(ws) {
      const r = rooms.get(ws.data.room) ?? { peers: new Set(), state: null };
      rooms.set(ws.data.room, r);
      r.peers.add(ws);
      if (r.state) ws.send(JSON.stringify(r.state));
      broadcast(r, null, { type: "peers", n: r.peers.size });
    },
    message(ws, raw) {
      if (raw.length > 4096) return;
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      const r = rooms.get(ws.data.room);
      if (msg.type === "state") r.state = { ...msg, at: Date.now() };
      broadcast(r, ws, msg.type === "state" ? r.state : msg);
    },
    close(ws) {
      const r = rooms.get(ws.data.room);
      r.peers.delete(ws);
      if (!r.peers.size) rooms.delete(ws.data.room);
      else broadcast(r, null, { type: "peers", n: r.peers.size });
    },
  },
});

function broadcast(r, from, msg) {
  const s = JSON.stringify(msg);
  for (const p of r.peers) if (p !== from) p.send(s);
}
