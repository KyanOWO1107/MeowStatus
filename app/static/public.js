const stateEl = document.getElementById("current-state");
const noteEl = document.getElementById("current-note");
const updatedAtEl = document.getElementById("current-updated-at");
const widgetListEl = document.getElementById("widget-list");
const widgetTemplate = document.getElementById("widget-template");

const STATE_LABELS = {
  working: "工作中",
  studying: "学习中",
  resting: "休息中",
  away: "离开中",
};

function formatTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function toOnlineText(payload) {
  if (!payload) return "未知";
  return payload.online ? "在线" : "离线";
}

function toPlayersText(payload) {
  if (!payload) return "-";
  const online = payload.players_online ?? "?";
  const max = payload.players_max ?? "?";
  return `${online} / ${max}`;
}

function toLatencyText(payload) {
  if (!payload) return "-";
  if (typeof payload.latency_ms === "number") {
    return `${payload.latency_ms} ms`;
  }
  if (payload.ping_protocol_used === true) {
    return "N/A（SLP 可用）";
  }
  return "-";
}

function toStateText(state) {
  if (!state) return "-";
  const key = String(state).toLowerCase();
  return STATE_LABELS[key] || key;
}

async function request(path) {
  const response = await fetch(path);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

function renderProfile(profile) {
  stateEl.textContent = toStateText(profile.state);
  noteEl.textContent = profile.note || "-";
  updatedAtEl.textContent = formatTime(profile.updated_at);
}

function renderWidgets(widgets) {
  widgetListEl.innerHTML = "";

  if (!widgets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂时没有挂件数据。";
    widgetListEl.appendChild(empty);
    return;
  }

  widgets.forEach((widget) => {
    const payload = widget.last_payload;
    const node = widgetTemplate.content.firstElementChild.cloneNode(true);

    node.dataset.online = payload?.online === true ? "online" : payload?.online === false ? "offline" : "unknown";

    node.querySelector(".widget-name").textContent = widget.name;
    node.querySelector(".widget-kind").textContent = widget.kind;
    node.querySelector(".target").textContent = payload?.target || `${widget.config.host}:${widget.config.port}`;
    node.querySelector(".online").textContent = toOnlineText(payload);
    node.querySelector(".version").textContent = payload?.version || "-";
    node.querySelector(".software").textContent = payload?.server_software || "-";
    node.querySelector(".players").textContent = toPlayersText(payload);
    node.querySelector(".motd").textContent = payload?.motd || "-";
    node.querySelector(".latency").textContent = toLatencyText(payload);
    node.querySelector(".updated-at").textContent = formatTime(widget.last_updated_at);
    node.querySelector(".error").textContent = widget.last_error || "";

    widgetListEl.appendChild(node);
  });
}

async function loadDashboard() {
  try {
    const dashboard = await request("/api/dashboard");
    renderProfile(dashboard.profile_status);
    renderWidgets(dashboard.widgets || []);
    if (dashboard.theme && window.MeowTheme) {
      window.MeowTheme.applyTheme(dashboard.theme);
    }
  } catch (error) {
    console.error(error);
  }
}

loadDashboard();
setInterval(loadDashboard, 10000);
