const stateEl = document.getElementById("current-state");
const noteEl = document.getElementById("current-note");
const updatedAtEl = document.getElementById("current-updated-at");
const serviceWidgetListEl = document.getElementById("service-widget-list");
const minecraftWidgetListEl = document.getElementById("minecraft-widget-list");
const widgetTemplate = document.getElementById("widget-template");

const publicEyebrowEl = document.getElementById("public-eyebrow");
const publicTitleEl = document.getElementById("public-title");
const publicSubtitleEl = document.getElementById("public-subtitle");
const publicWidgetsTitleEl = document.getElementById("public-widgets-title");
const publicStateLabelEl = document.getElementById("public-state-label");
const publicNoteLabelEl = document.getElementById("public-note-label");
const publicUpdatedLabelEl = document.getElementById("public-updated-label");

const DEFAULT_COPY = {
  public_eyebrow: "MEOW STATUS HUB",
  public_title: "MeowStatus Live Board",
  public_subtitle: "公开状态展示页（只读）",
  public_widgets_title: "Minecraft服务器状态",
  public_state_label: "当前状态",
  public_note_label: "备注",
  public_updated_label: "更新时间",
  public_empty_widgets: "暂时没有挂件数据。",
};

let currentCopy = { ...DEFAULT_COPY };

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

function isServiceWidget(widget) {
  return widget?.kind === "service-http";
}

function isMinecraftWidget(widget) {
  return widget?.kind === "minecraft-java" || widget?.kind === "minecraft-bedrock";
}

function toStateText(state) {
  if (!state) return "-";
  const key = String(state).toLowerCase();
  return STATE_LABELS[key] || key;
}

function formatWidgetError(widget) {
  const message = widget?.last_error;
  if (!message) return "";
  const code = String(widget?.last_error_code || "").trim();
  return code ? `[${code}] ${message}` : message;
}

function applyWidgetIcon(node, payload) {
  const iconEl = node.querySelector(".server-icon");
  if (!iconEl) return;

  const iconCandidates = [
    payload?.favicon,
    payload?.icon,
    payload?.raw?.icon,
  ];
  const resolved = iconCandidates.find((value) => typeof value === "string" && value.trim().length > 0);
  const iconSource = typeof resolved === "string" ? resolved.trim() : "";

  if (iconSource.startsWith("data:image")) {
    iconEl.src = iconSource;
    iconEl.classList.remove("hidden");
  } else {
    iconEl.removeAttribute("src");
    iconEl.classList.add("hidden");
  }
}

function normalizeCopy(rawCopy) {
  const next = { ...DEFAULT_COPY };
  if (!rawCopy || typeof rawCopy !== "object") {
    return next;
  }

  Object.keys(DEFAULT_COPY).forEach((key) => {
    const value = rawCopy[key];
    if (typeof value === "string" && value.trim()) {
      next[key] = value.trim();
    }
  });
  return next;
}

function applyCopy(rawCopy) {
  currentCopy = normalizeCopy(rawCopy);

  if (publicEyebrowEl) publicEyebrowEl.textContent = currentCopy.public_eyebrow;
  if (publicTitleEl) publicTitleEl.textContent = currentCopy.public_title;
  if (publicSubtitleEl) publicSubtitleEl.textContent = currentCopy.public_subtitle;
  if (publicWidgetsTitleEl) publicWidgetsTitleEl.textContent = currentCopy.public_widgets_title;
  if (publicStateLabelEl) publicStateLabelEl.textContent = currentCopy.public_state_label;
  if (publicNoteLabelEl) publicNoteLabelEl.textContent = currentCopy.public_note_label;
  if (publicUpdatedLabelEl) publicUpdatedLabelEl.textContent = currentCopy.public_updated_label;
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

function setWidgetLine(node, selector, value, visible = true) {
  const el = node.querySelector(selector);
  if (!el) return;
  const line = el.closest(".widget-line");
  if (line) line.classList.toggle("hidden", !visible);
  el.textContent = value;
}

function renderWidgetGroup(container, widgets, emptyText) {
  if (!container) return;
  container.innerHTML = "";

  if (!widgets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  widgets.forEach((widget) => {
    const payload = widget.last_payload;
    const node = widgetTemplate.content.firstElementChild.cloneNode(true);

    node.dataset.online = payload?.online === true ? "online" : payload?.online === false ? "offline" : "unknown";

    node.querySelector(".widget-name").textContent = widget.name;
    node.querySelector(".widget-kind").textContent = isServiceWidget(widget) ? "服务状态" : widget.kind;
    applyWidgetIcon(node, payload);
    setWidgetLine(node, ".target", payload?.target || "-", isMinecraftWidget(widget));
    setWidgetLine(node, ".online", toOnlineText(payload));
    setWidgetLine(node, ".version", payload?.version || "-", isMinecraftWidget(widget));
    setWidgetLine(node, ".software", payload?.server_software || "-", isMinecraftWidget(widget));
    setWidgetLine(node, ".players", toPlayersText(payload), isMinecraftWidget(widget));
    setWidgetLine(node, ".motd", payload?.motd || "-", isMinecraftWidget(widget));
    setWidgetLine(node, ".latency", toLatencyText(payload), isMinecraftWidget(widget));
    setWidgetLine(node, ".updated-at", formatTime(widget.last_updated_at));
    node.querySelector(".error").textContent = isServiceWidget(widget) ? "" : formatWidgetError(widget);

    container.appendChild(node);
  });
}

function renderWidgets(widgets) {
  const list = Array.isArray(widgets) ? widgets : [];
  const services = list.filter(isServiceWidget);
  const minecraft = list.filter(isMinecraftWidget);
  renderWidgetGroup(serviceWidgetListEl, services, "暂时没有服务状态监测数据。");
  renderWidgetGroup(minecraftWidgetListEl, minecraft, currentCopy.public_empty_widgets);
}

async function loadDashboard() {
  try {
    const dashboard = await request("/api/dashboard");
    renderProfile(dashboard.profile_status);
    applyCopy(dashboard.copy);
    renderWidgets(dashboard.widgets || []);
    if (dashboard.theme && window.MeowTheme) {
      window.MeowTheme.applyTheme(dashboard.theme, dashboard.custom_theme || null, dashboard.custom_assets || null);
    }
  } catch (error) {
    console.error(error);
  }
}

applyCopy(DEFAULT_COPY);
loadDashboard();
setInterval(loadDashboard, 10000);
