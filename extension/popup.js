const $ = (id) => document.getElementById(id);
const DEFAULT_SERVER = "wss://serv-shaur.tailccb9e1.ts.net:8443";

function render(s) {
  $("lobby").hidden = !!s.room;
  $("inroom").hidden = !s.room;
  $("code").textContent = s.room || "";
  const on = s.room && s.connected;
  $("pill").className = on ? "pill on" : "pill";
  $("pill").textContent = on ? `${s.peers || 1} watching` : s.room ? "connecting…" : "offline";
}

chrome.storage.local.get(null, (s) => {
  $("name").value = s.name || "";
  // ponytail: v0.1 saved ws://localhost; drop it so old installs reach the real relay.
  if (!s.server || s.server.includes("localhost")) chrome.storage.local.set({ server: (s.server = DEFAULT_SERVER) });
  $("server").value = s.server;
  render(s);
});
chrome.storage.onChanged.addListener(() => chrome.storage.local.get(null, render));

async function save(room) {
  await chrome.storage.local.set({ name: $("name").value.trim(), room, server: $("server").value.trim() || DEFAULT_SERVER, connected: false });
  if (room) copy();
  tellTab({ type: "reconnect" });
}

async function tellTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("status").textContent = "";
  chrome.tabs.sendMessage(tab.id, msg).catch(() => ($("status").textContent = "Open (or refresh) a YouTube tab first"));
}

function copy() {
  navigator.clipboard.writeText($("code").textContent).then(() => {
    $("copied").textContent = "copied ✓";
    setTimeout(() => ($("copied").textContent = "click code to copy · share it with friends"), 1500);
  }, () => {});
}

$("create").onclick = () => save(crypto.randomUUID().slice(0, 6).toUpperCase());
$("join").onclick = () => $("room").value.trim() && save($("room").value.trim().toUpperCase());
$("room").onkeydown = (e) => e.key === "Enter" && $("join").click();
$("leave").onclick = () => save("");
$("code").onclick = copy;
$("code").onkeydown = (e) => e.key === "Enter" && copy();
$("name").onchange = () => chrome.storage.local.set({ name: $("name").value.trim() });
$("server").onchange = () => chrome.storage.local.set({ server: $("server").value.trim() || DEFAULT_SERVER });
$("chat").onkeydown = (e) => {
  if (e.key !== "Enter" || !e.target.value.trim()) return;
  tellTab({ type: "chat", text: e.target.value.trim() });
  e.target.value = "";
};
