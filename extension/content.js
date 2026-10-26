// Syncs the page's <video> with a room over WebSocket.
// ponytail: YouTube-only selector/URL logic lives here; other sites = swap videoId()/video().
let ws, room, ignoreUntil = 0, chatBox, panel, unread = 0, leading = false;

const video = () => document.querySelector("video");
const videoId = () => new URLSearchParams(location.search).get("v");

function connect(s) {
  ws?.close();
  room = s.room;
  if (!room) return void (ws = null, status({ connected: false }));
  const r = room;
  // This tab synced a different video last time → the user navigated here, so lead instead of following.
  leading = !!sessionStorage.smVid && sessionStorage.smVid !== videoId();
  if (!s.server || s.server.includes("localhost")) s.server = "wss://serv-shaur.tailccb9e1.ts.net:8443"; // ponytail: same default as popup.js
  const port = chrome.runtime.connect({ name: JSON.stringify({ server: s.server, room: r }) });
  ws = { readyState: 0, close: () => port.disconnect(), send: (m) => port.postMessage(JSON.parse(m)) };
  const me = ws;
  const closed = () => {
    if (me.readyState === 3) return;
    me.readyState = 3;
    status({ connected: false });
    setTimeout(() => room === r && ws === me && chrome.storage.local.get(null, connect), 2000);
  };
  port.onMessage.addListener(({ ev, data }) => {
    if (ev === "open") { me.readyState = 1; toast(`Joined room ${r}`, "🎬"); status({ connected: true }); if (leading) setTimeout(sendState, 1000); }
    if (ev === "msg") apply(JSON.parse(data));
    if (ev === "error") toast(`Can't reach server ${s.server}`, "⚠️");
    if (ev === "close") closed();
  });
  port.onDisconnect.addListener(closed);
  ws.name = s.name || "anon";
}

function send(msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}

function sendState() {
  const v = video();
  if (!v || Date.now() < ignoreUntil || !videoId() || ws?.readyState !== 1) return;
  sessionStorage.smVid = videoId();
  leading = false;
  send({ type: "state", vid: videoId(), t: v.currentTime, paused: v.paused, rate: v.playbackRate, by: ws?.name });
}

function apply(m) {
  if (m.type === "peers") return (panel.querySelector("#sm-peers").textContent = `· ${m.n} watching`), status({ peers: m.n }) || toast(`${m.n} watching`, "👥");
  if (m.type === "chat") return addMsg(m.by, m.text);
  if (m.type !== "state") return;
  if (m.vid !== videoId()) {
    if (leading) return;
    sessionStorage.smVid = m.vid;
    return void (location.href = `https://www.youtube.com/watch?v=${m.vid}`);
  }
  sessionStorage.smVid = m.vid;
  const v = video();
  if (!v) return;
  const t = m.paused ? m.t : m.t + (Date.now() - m.at) / 1000 * m.rate;
  ignoreUntil = Date.now() + 600;
  const jumped = Math.abs(v.currentTime - t) > 0.75; // ponytail: 0.75s drift tolerance, tune if jumpy
  if (jumped) v.currentTime = t;
  v.playbackRate = m.rate;
  if (m.paused !== v.paused) m.paused ? v.pause() : v.play().catch(() => toast("Click play to sync (autoplay blocked)", "⚠️"));
  if (m.by) toast(m.paused ? `paused at ${fmt(t)}` : jumped ? `jumped to ${fmt(t)}` : "pressed play", m.paused ? "⏸" : "▶️", m.by);
}

// Media events don't bubble but do capture, so this survives YouTube swapping the <video>.
for (const ev of ["play", "pause", "seeked", "ratechange"]) document.addEventListener(ev, sendState, true);
// Navigating to a new video (YouTube SPA) pushes it to the room.
document.addEventListener("yt-navigate-finish", () => setTimeout(sendState, 1000));

const status = (o) => void (chrome.storage.local.set(o), panel?.toggleAttribute("data-room", !!room));
const fmt = (t) => new Date(t * 1000).toISOString().slice(t >= 3600 ? 11 : 14, 19);

function toast(text, icon = "", by = "") {
  chatBox ??= Object.assign(document.body.appendChild(document.createElement("div")), {
    style: "position:fixed;bottom:90px;right:20px;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;font:500 14px/1.35 system-ui,sans-serif",
  });
  const d = chatBox.appendChild(document.createElement("div"));
  d.style = "display:flex;gap:8px;align-items:flex-start;background:rgba(18,18,24,.88);backdrop-filter:blur(10px);color:#ececf1;padding:9px 13px;border-radius:12px;max-width:320px;box-shadow:0 6px 24px #0006;border-left:3px solid #ff3b5c;transition:opacity .3s,transform .3s;opacity:0;transform:translateX(16px)";
  d.append(icon, document.createElement("div"));
  const body = d.lastChild;
  if (by) body.append(Object.assign(document.createElement("b"), { textContent: by + " ", style: "color:#ff7a45" }));
  body.append(text);
  requestAnimationFrame(() => (d.style.opacity = 1, d.style.transform = "none"));
  setTimeout(() => (d.style.opacity = 0, setTimeout(() => d.remove(), 300)), 4500);
  while (chatBox.children.length > 5) chatBox.firstChild.remove();
}

chrome.runtime.onMessage.addListener((m) => {
  if (m.type === "chat") sendChat(m.text);
  else chrome.storage.local.get(null, connect);
});
chrome.storage.local.get(null, connect);
chrome.storage.onChanged.addListener((c) => c.name && ws && (ws.name = c.name.newValue || "anon"));

// In-page chat panel: floating button + slide-out panel, shown only while in a room.
function buildPanel() {
  const css = `
    #sm-btn,#sm-panel{font:500 14px/1.4 system-ui,sans-serif;color:#ececf1;z-index:99999;position:fixed}
    #sm-wrap:not([data-room]) {display:none}
    #sm-btn{right:20px;bottom:20px;width:48px;height:48px;border-radius:50%;border:0;cursor:pointer;font-size:20px;
      background:linear-gradient(135deg,#ff3b5c,#ff7a45);box-shadow:0 6px 20px #0007}
    #sm-btn[data-n]::after{content:attr(data-n);position:absolute;top:-2px;right:-2px;background:#fff;color:#ff3b5c;
      font:700 11px system-ui;min-width:18px;height:18px;border-radius:9px;display:grid;place-items:center}
    #sm-panel{right:20px;bottom:80px;width:320px;height:440px;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;
      background:rgba(18,18,24,.94);backdrop-filter:blur(12px);border:1px solid #2a2a33;box-shadow:0 10px 40px #0008;
      transition:opacity .2s,transform .2s;transform-origin:bottom right}
    #sm-panel[hidden]{display:flex;opacity:0;transform:scale(.9);pointer-events:none}
    #sm-head{padding:12px 14px;border-bottom:1px solid #2a2a33;display:flex;justify-content:space-between;align-items:center;font-weight:700}
    #sm-head small{font-weight:500;color:#8b8b98}
    #sm-head button{background:none;border:0;color:#8b8b98;font-size:18px;cursor:pointer}
    #sm-msgs{flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:8px}
    #sm-msgs .m{background:#22222a;padding:7px 10px;border-radius:10px;align-self:flex-start;max-width:85%;word-wrap:break-word}
    #sm-msgs .m.me{align-self:flex-end;background:linear-gradient(135deg,#ff3b5c,#ff7a45)}
    #sm-msgs .m b{display:block;font-size:11px;color:#ff7a45}
    #sm-msgs .m.me b{color:#fff9}
    #sm-msgs .empty{margin:auto;color:#8b8b98;font-size:13px}
    #sm-input{margin:10px;padding:10px 12px;border-radius:10px;border:1px solid #2a2a33;background:#0f0f12;color:#ececf1;font:inherit;outline:none}
    #sm-input:focus{border-color:#ff3b5c}`;
  const wrap = document.body.appendChild(document.createElement("div"));
  wrap.id = "sm-wrap";
  // YouTube enforces Trusted Types, so innerHTML throws — build nodes by hand.
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    for (const [k, v] of Object.entries(props)) if (k.startsWith("aria") || k === "id") n.setAttribute(k.replace("aria", "aria-").toLowerCase(), v);
    n.append(...kids);
    return n;
  };
  wrap.append(
    el("style", { textContent: css }),
    el("button", { id: "sm-btn", ariaLabel: "Toggle watch party chat" }, "💬"),
    el("section", { id: "sm-panel", hidden: true, ariaLabel: "Watch party chat" },
      el("div", { id: "sm-head" },
        el("span", {}, "Party chat ", el("small", { id: "sm-peers" })),
        el("button", { ariaLabel: "Close chat" }, "×")),
      el("div", { id: "sm-msgs", ariaLive: "polite" }, el("div", { className: "empty" }, "No messages yet — say hi 👋")),
      el("input", { id: "sm-input", placeholder: "Message… (Enter to send)", maxLength: 300, ariaLabel: "Chat message" })),
  );
  const $ = (q) => wrap.querySelector(q), p = $("#sm-panel"), btn = $("#sm-btn"), input = $("#sm-input");
  const toggle = (open = p.hidden) => {
    p.hidden = !open;
    if (open) { unread = 0; btn.removeAttribute("data-n"); input.focus(); }
  };
  btn.onclick = () => toggle();
  $("#sm-head button").onclick = () => toggle(false);
  // Stop YouTube's hotkeys (k, f, space, arrows…) from firing while typing.
  for (const ev of ["keydown", "keyup", "keypress"]) input.addEventListener(ev, (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggle(false);
    if (e.key !== "Enter" || !input.value.trim()) return;
    sendChat(input.value.trim());
    input.value = "";
  });
  wrap.toggleAttribute("data-room", !!room);
  return wrap;
}

function sendChat(text) {
  send({ type: "chat", text, by: ws?.name });
  addMsg("you", text, true);
}

function addMsg(by, text, me = false) {
  const msgs = panel.querySelector("#sm-msgs"), p = panel.querySelector("#sm-panel");
  msgs.querySelector(".empty")?.remove();
  const d = msgs.appendChild(document.createElement("div"));
  d.className = me ? "m me" : "m";
  d.append(Object.assign(document.createElement("b"), { textContent: by || "anon" }), text);
  while (msgs.children.length > 200) msgs.firstChild.remove(); // ponytail: keeps last 200, no history across reloads
  msgs.scrollTop = msgs.scrollHeight;
  if (p.hidden && !me) {
    panel.querySelector("#sm-btn").dataset.n = ++unread > 9 ? "9+" : unread;
    toast(text, "💬", by);
  }
}

panel = buildPanel();
