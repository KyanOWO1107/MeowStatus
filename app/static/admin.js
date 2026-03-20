let adminToken = "";
let pendingLoginToken = "";
let initialized = false;

const stateEl = document.getElementById("current-state");
const noteEl = document.getElementById("current-note");
const updatedAtEl = document.getElementById("current-updated-at");
const statusNoteInput = document.getElementById("status-note");
const widgetListEl = document.getElementById("widget-list");
const widgetTemplate = document.getElementById("widget-template");

const authModal = document.getElementById("auth-modal");
const authMessage = document.getElementById("auth-message");
const loginForm = document.getElementById("login-form");
const rotateForm = document.getElementById("rotate-form");

const themeGridEl = document.getElementById("theme-grid");
const themeSearchInput = document.getElementById("theme-search");
const themeCurrentNameEl = document.getElementById("theme-current-name");
const themeMessageEl = document.getElementById("theme-message");

const STATE_LABELS = {
  working: "工作中",
  studying: "学习中",
  resting: "休息中",
  away: "离开中",
};

let allThemes = [];
let activeThemeId = "";

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

function setAuthMessage(message) {
  authMessage.textContent = message || "";
}

function setThemeMessage(message, isError = false) {
  if (!themeMessageEl) return;
  themeMessageEl.textContent = message || "";
  themeMessageEl.classList.toggle("theme-message-error", isError);
}

function getThemeName(themeId) {
  const item = allThemes.find((theme) => theme.id === themeId);
  return item ? item.name : themeId || "-";
}

function applyThemeSelectionVisual(themeId) {
  activeThemeId = themeId;
  if (themeCurrentNameEl) {
    themeCurrentNameEl.textContent = getThemeName(themeId);
  }

  document.querySelectorAll(".theme-option").forEach((button) => {
    const isActive = button.dataset.themeId === themeId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function createThemeOption(theme) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-option";
  button.dataset.themeId = theme.id;

  const name = document.createElement("div");
  name.className = "theme-option-name";
  name.textContent = theme.name;

  const id = document.createElement("div");
  id.className = "theme-option-id";
  id.textContent = theme.id;

  const preview = document.createElement("div");
  preview.className = "theme-option-preview";

  const bgSwatch = document.createElement("span");
  bgSwatch.className = "theme-swatch";
  bgSwatch.style.background = theme.background;
  bgSwatch.title = `背景色 ${theme.background}`;

  const accentSwatch = document.createElement("span");
  accentSwatch.className = "theme-swatch";
  accentSwatch.style.background = theme.accent;
  accentSwatch.title = `辅助色 ${theme.accent}`;

  preview.appendChild(bgSwatch);
  preview.appendChild(accentSwatch);

  button.appendChild(name);
  button.appendChild(id);
  button.appendChild(preview);

  button.addEventListener("click", async () => {
    if (!adminToken) {
      setThemeMessage("请先登录后再修改主题。", true);
      return;
    }

    try {
      setThemeMessage(`正在切换到 ${theme.name}...`);
      const result = await window.MeowTheme.saveTheme(theme.id, adminToken);
      applyThemeSelectionVisual(result.theme);
      setThemeMessage(`主题已切换为 ${getThemeName(result.theme)}，公开页会自动同步。`);
    } catch (error) {
      setThemeMessage(`主题切换失败：${error.message}`, true);
    }
  });

  return button;
}

function renderThemeGrid(filterText = "") {
  if (!themeGridEl) return;

  const keyword = String(filterText || "").trim().toLowerCase();
  const list = keyword
    ? allThemes.filter((theme) =>
        [theme.id, theme.name, theme.background, theme.accent]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      )
    : allThemes;

  themeGridEl.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "theme-grid-empty";
    empty.textContent = "没有匹配的主题。";
    themeGridEl.appendChild(empty);
    return;
  }

  list.forEach((theme) => {
    themeGridEl.appendChild(createThemeOption(theme));
  });

  applyThemeSelectionVisual(activeThemeId || window.MeowTheme.getCurrentTheme());
}

function formatRateLimitInfo(rateLimit) {
  if (!rateLimit || typeof rateLimit !== "object") return "";
  const blocked = rateLimit.blocked === true;
  const retryAfter = Number(rateLimit.retry_after || 0);
  const remaining = Number(rateLimit.attempts_remaining);

  if (blocked) {
    return `当前已被限流，请在 ${Math.max(1, retryAfter)} 秒后重试。`;
  }

  if (Number.isFinite(remaining)) {
    return `当前还可尝试 ${Math.max(0, remaining)} 次。`;
  }

  return "";
}

async function request(path, options = {}, { admin = false } = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (admin) {
    if (!adminToken) {
      const error = new Error("请先登录管理面板");
      error.status = 401;
      throw error;
    }
    headers["X-Admin-Token"] = adminToken;
  }

  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.retryAfter = Number(response.headers.get("Retry-After") || body.retry_after || 0);
    error.rateLimit = body.rate_limit || null;
    throw error;
  }
  return body;
}

function renderProfile(profile) {
  stateEl.textContent = toStateText(profile.state);
  noteEl.textContent = profile.note || "-";
  updatedAtEl.textContent = formatTime(profile.updated_at);
  statusNoteInput.value = profile.note || "";
}

function renderWidgets(widgets) {
  widgetListEl.innerHTML = "";

  if (!widgets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "还没有挂件，先创建一个 Minecraft 服务。";
    widgetListEl.appendChild(empty);
    return;
  }

  const total = widgets.length;

  widgets.forEach((widget, index) => {
    const payload = widget.last_payload;
    const node = widgetTemplate.content.firstElementChild.cloneNode(true);

    node.dataset.online = payload?.online === true ? "online" : payload?.online === false ? "offline" : "unknown";

    node.querySelector(".widget-name").textContent = widget.name;
    node.querySelector(".widget-kind").textContent = widget.kind;
    applyWidgetIcon(node, payload);
    node.querySelector(".target").textContent = payload?.target || `${widget.config.host}:${widget.config.port}`;
    node.querySelector(".online").textContent = toOnlineText(payload);
    node.querySelector(".version").textContent = payload?.version || "-";
    node.querySelector(".software").textContent = payload?.server_software || "-";
    node.querySelector(".players").textContent = toPlayersText(payload);
    node.querySelector(".motd").textContent = payload?.motd || "-";
    node.querySelector(".latency").textContent = toLatencyText(payload);
    node.querySelector(".updated-at").textContent = formatTime(widget.last_updated_at);
    node.querySelector(".error").textContent = formatWidgetError(widget);

    const moveUpBtn = node.querySelector(".move-up-btn");
    if (moveUpBtn) {
      moveUpBtn.disabled = index <= 0;
      moveUpBtn.addEventListener("click", async () => {
        try {
          await request(
            `/api/widgets/${widget.id}/order`,
            {
              method: "POST",
              body: JSON.stringify({ position: Math.max(0, index - 1) }),
            },
            { admin: true },
          );
          await loadDashboard();
        } catch (error) {
          alert(error.message);
        }
      });
    }

    const moveDownBtn = node.querySelector(".move-down-btn");
    if (moveDownBtn) {
      moveDownBtn.disabled = index >= total - 1;
      moveDownBtn.addEventListener("click", async () => {
        try {
          await request(
            `/api/widgets/${widget.id}/order`,
            {
              method: "POST",
              body: JSON.stringify({ position: Math.min(total - 1, index + 1) }),
            },
            { admin: true },
          );
          await loadDashboard();
        } catch (error) {
          alert(error.message);
        }
      });
    }

    node.querySelector(".refresh-btn").addEventListener("click", async () => {
      try {
        await request(`/api/widgets/${widget.id}/refresh`, { method: "POST", body: "{}" }, { admin: true });
        await loadDashboard();
      } catch (error) {
        alert(error.message);
      }
    });

    node.querySelector(".edit-btn").addEventListener("click", async () => {
      const name = prompt("挂件名称", widget.name);
      if (name === null) return;

      const host = prompt("服务器主机", widget.config.host || "");
      if (host === null) return;

      const portRaw = prompt("端口（留空用默认）", String(widget.config.port || ""));
      if (portRaw === null) return;

      const currentEdition = widget.kind === "minecraft-bedrock" ? "bedrock" : "java";
      const edition = prompt("版本（java/bedrock）", currentEdition);
      if (edition === null) return;

      const body = {
        name: name.trim() || widget.name,
        host: host.trim() || widget.config.host,
        edition: edition.trim().toLowerCase() || currentEdition,
        enabled: widget.enabled,
      };
      if (portRaw.trim()) {
        body.port = Number(portRaw.trim());
      }

      try {
        await request(
          `/api/widgets/${widget.id}/minecraft`,
          {
            method: "PUT",
            body: JSON.stringify(body),
          },
          { admin: true },
        );
        await loadDashboard();
      } catch (error) {
        alert(error.message);
      }
    });

    node.querySelector(".delete-btn").addEventListener("click", async () => {
      const confirmed = confirm(`确认删除挂件：${widget.name}？`);
      if (!confirmed) return;

      try {
        await request(`/api/widgets/${widget.id}`, { method: "DELETE" }, { admin: true });
        await loadDashboard();
      } catch (error) {
        alert(error.message);
      }
    });

    widgetListEl.appendChild(node);
  });
}
async function refreshThemeFromServer() {
  if (!window.MeowTheme) return;

  try {
    const result = await window.MeowTheme.loadRemoteTheme();
    applyThemeSelectionVisual(result.theme);
  } catch {
    // Keep current theme when loading fails.
  }
}

async function loadDashboard() {
  const dashboard = await request("/api/dashboard", { method: "GET" });
  renderProfile(dashboard.profile_status);
  renderWidgets(dashboard.widgets || []);

  if (dashboard.theme && window.MeowTheme) {
    window.MeowTheme.applyTheme(dashboard.theme);
    applyThemeSelectionVisual(dashboard.theme);
  }
}

async function updateProfile(state, note) {
  await request(
    "/api/profile/status",
    {
      method: "POST",
      body: JSON.stringify({ state, note }),
    },
    { admin: true },
  );
  await loadDashboard();
}

function bindProfileActions() {
  document.querySelectorAll("[data-state]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await updateProfile(button.dataset.state, statusNoteInput.value.trim());
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.getElementById("status-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const currentRaw = stateEl.textContent;
      const state = Object.keys(STATE_LABELS).find((key) => STATE_LABELS[key] === currentRaw) || "working";
      await updateProfile(state, statusNoteInput.value.trim());
    } catch (error) {
      alert(error.message);
    }
  });
}

function bindMinecraftForm() {
  const form = document.getElementById("mc-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("mc-name").value.trim();
    const edition = document.getElementById("mc-edition").value;
    const host = document.getElementById("mc-host").value.trim();
    const portValue = document.getElementById("mc-port").value;

    const body = { name, edition, host };
    if (portValue) body.port = Number(portValue);

    try {
      await request(
        "/api/widgets/minecraft",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
        { admin: true },
      );
      form.reset();
      await loadDashboard();
    } catch (error) {
      alert(error.message);
    }
  });
}

function bindGlobalRefresh() {
  document.getElementById("refresh-all").addEventListener("click", async () => {
    try {
      const widgets = await request("/api/widgets", { method: "GET" });
      await Promise.all(
        (widgets.items || []).map((widget) =>
          request(`/api/widgets/${widget.id}/refresh`, { method: "POST", body: "{}" }, { admin: true }),
        ),
      );
      await loadDashboard();
    } catch (error) {
      alert(error.message);
    }
  });
}

function bindThemePanel() {
  if (!window.MeowTheme || !themeGridEl) return;

  allThemes = window.MeowTheme.getThemes();
  activeThemeId = window.MeowTheme.getCurrentTheme();
  renderThemeGrid("");
  applyThemeSelectionVisual(activeThemeId);

  if (themeSearchInput) {
    themeSearchInput.addEventListener("input", () => {
      renderThemeGrid(themeSearchInput.value);
    });
  }

  refreshThemeFromServer();
}

function openAuthModal() {
  authModal.classList.remove("hidden");
  loginForm.classList.remove("hidden");
  rotateForm.classList.add("hidden");
  setAuthMessage("");
  setThemeMessage("");
  document.getElementById("login-token").value = "";
  document.getElementById("new-token").value = "";
  document.getElementById("confirm-token").value = "";
  adminToken = "";
  pendingLoginToken = "";
}

function closeAuthModal() {
  authModal.classList.add("hidden");
  setAuthMessage("");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("login-token");
  const token = input.value.trim();
  if (!token) {
    setAuthMessage("请输入 Token");
    return;
  }

  try {
    const result = await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ token }),
    });

    if (result.must_change_token) {
      pendingLoginToken = token;
      loginForm.classList.add("hidden");
      rotateForm.classList.remove("hidden");
      setAuthMessage("首次登录需要先修改 Token。" + (formatRateLimitInfo(result.rate_limit) || ""));
      return;
    }

    adminToken = token;
    closeAuthModal();
    await loadDashboard();
    await refreshThemeFromServer();
  } catch (error) {
    const rl = formatRateLimitInfo(error.rateLimit);
    if (error.status === 429 && error.retryAfter > 0) {
      setAuthMessage(`登录失败：已触发限流，请 ${error.retryAfter} 秒后再试。`);
      return;
    }
    setAuthMessage(`登录失败：${error.message}${rl ? " " + rl : ""}`);
  }
}

async function handleRotateSubmit(event) {
  event.preventDefault();

  const newToken = document.getElementById("new-token").value.trim();
  const confirmToken = document.getElementById("confirm-token").value.trim();

  if (newToken.length < 8) {
    setAuthMessage("新 Token 至少 8 位");
    return;
  }

  if (newToken !== confirmToken) {
    setAuthMessage("两次输入的新 Token 不一致");
    return;
  }

  try {
    await request("/api/admin/change-token", {
      method: "POST",
      body: JSON.stringify({
        current_token: pendingLoginToken,
        new_token: newToken,
      }),
    });

    adminToken = newToken;
    pendingLoginToken = "";
    closeAuthModal();
    await loadDashboard();
    await refreshThemeFromServer();
  } catch (error) {
    const rl = formatRateLimitInfo(error.rateLimit);
    if (error.status === 429 && error.retryAfter > 0) {
      setAuthMessage(`修改失败：已触发限流，请 ${error.retryAfter} 秒后再试。`);
      return;
    }
    setAuthMessage(`修改失败：${error.message}${rl ? " " + rl : ""}`);
  }
}

function bindAuth() {
  loginForm.addEventListener("submit", handleLoginSubmit);
  rotateForm.addEventListener("submit", handleRotateSubmit);

  document.getElementById("logout-btn").addEventListener("click", () => {
    openAuthModal();
  });
}

function init() {
  if (initialized) return;

  bindAuth();
  bindProfileActions();
  bindMinecraftForm();
  bindGlobalRefresh();
  bindThemePanel();

  initialized = true;
}

init();
openAuthModal();
setInterval(async () => {
  if (!adminToken) return;
  try {
    await loadDashboard();
  } catch {
    // Ignore periodic refresh errors in background; manual actions surface errors.
  }
}, 10000);

