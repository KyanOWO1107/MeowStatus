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

const customThemeMessageEl = document.getElementById("custom-theme-message");
const customThemeForm = document.getElementById("custom-theme-form");
const customThemePreviewBtn = document.getElementById("custom-preview-btn");
const customThemeSaveBtn = document.getElementById("custom-theme-save-btn");
const customThemeResetBtn = document.getElementById("custom-theme-reset-btn");

const copyMessageEl = document.getElementById("copy-message");
const copyForm = document.getElementById("copy-form");
const copySaveBtn = document.getElementById("copy-save-btn");
const copyResetBtn = document.getElementById("copy-reset-btn");

const assetForm = document.getElementById("asset-form");
const assetMessageEl = document.getElementById("asset-message");
const assetLicenseSummaryEl = document.getElementById("asset-license-summary");
const assetPreviewBtn = document.getElementById("asset-preview-btn");
const assetSaveBtn = document.getElementById("asset-save-btn");
const assetResetBtn = document.getElementById("asset-reset-btn");

const DEFAULT_COPY = {
  public_eyebrow: "MEOW STATUS HUB",
  public_title: "MeowStatus Live Board",
  public_subtitle: "公开状态展示页（只读）",
  public_widgets_title: "挂件状态",
  public_state_label: "当前状态",
  public_note_label: "备注",
  public_updated_label: "更新时间",
  public_empty_widgets: "暂时没有挂件数据。",
};

const DEFAULT_CUSTOM_ASSETS = {
  background_enabled: false,
  background_file: "",
  background_opacity: 58,
  font_enabled: false,
  font_latin_file: "",
  font_cjk_file: "",
};

const DEFAULT_THEME_FONT_SETTINGS = {
  heading_font: "default",
  body_font: "default",
};

const SUPPORTED_THEME_FONTS = new Set(["default", "display", "round", "serif", "mono"]);

const COPY_INPUT_IDS = {
  public_eyebrow: "copy-public-eyebrow",
  public_title: "copy-public-title",
  public_subtitle: "copy-public-subtitle",
  public_widgets_title: "copy-public-widgets-title",
  public_state_label: "copy-public-state-label",
  public_note_label: "copy-public-note-label",
  public_updated_label: "copy-public-updated-label",
  public_empty_widgets: "copy-public-empty-widgets",
};

const STATE_LABELS = {
  working: "工作中",
  studying: "学习中",
  resting: "休息中",
  away: "离开中",
};

let allThemes = [];
let activeThemeId = "";
let customThemeInitialized = false;
let copyInitialized = false;
let assetInitialized = false;
let localAssetCatalog = { backgrounds: [], fonts: [], allowed_font_paths: [] };

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

function setCustomThemeMessage(message, isError = false) {
  if (!customThemeMessageEl) return;
  customThemeMessageEl.textContent = message || "";
  customThemeMessageEl.classList.toggle("theme-message-error", isError);
}

function setCopyMessage(message, isError = false) {
  if (!copyMessageEl) return;
  copyMessageEl.textContent = message || "";
  copyMessageEl.classList.toggle("theme-message-error", isError);
}

function setAssetMessage(message, isError = false) {
  if (!assetMessageEl) return;
  assetMessageEl.textContent = message || "";
  assetMessageEl.classList.toggle("theme-message-error", isError);
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
          await loadDashboard({ forceSync: false });
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
          await loadDashboard({ forceSync: false });
        } catch (error) {
          alert(error.message);
        }
      });
    }

    node.querySelector(".refresh-btn").addEventListener("click", async () => {
      try {
        await request(`/api/widgets/${widget.id}/refresh`, { method: "POST", body: "{}" }, { admin: true });
        await loadDashboard({ forceSync: false });
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
        await loadDashboard({ forceSync: false });
      } catch (error) {
        alert(error.message);
      }
    });

    node.querySelector(".delete-btn").addEventListener("click", async () => {
      const confirmed = confirm(`确认删除挂件：${widget.name}？`);
      if (!confirmed) return;

      try {
        await request(`/api/widgets/${widget.id}`, { method: "DELETE" }, { admin: true });
        await loadDashboard({ forceSync: false });
      } catch (error) {
        alert(error.message);
      }
    });

    widgetListEl.appendChild(node);
  });
}

function updateRangeOutput(inputId, outputId) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  if (!input || !output) return;
  output.textContent = `${input.value}%`;
}

function updateCustomThemeRangeOutputs() {
  updateRangeOutput("custom-font-scale", "custom-font-scale-output");
  updateRangeOutput("custom-radius-scale", "custom-radius-scale-output");
  updateRangeOutput("custom-shadow-strength", "custom-shadow-strength-output");
}

function readCustomThemeForm() {
  const current = window.MeowTheme.getCurrentCustomTheme?.() || DEFAULT_THEME_FONT_SETTINGS;
  return window.MeowTheme.normalizeCustomTheme({
    enabled: document.getElementById("custom-enabled")?.checked,
    background: document.getElementById("custom-background")?.value,
    accent: document.getElementById("custom-accent")?.value,
    mode: document.getElementById("custom-mode")?.value,
    background_style: document.getElementById("custom-background-style")?.value,
    heading_font: current.heading_font || DEFAULT_THEME_FONT_SETTINGS.heading_font,
    body_font: current.body_font || DEFAULT_THEME_FONT_SETTINGS.body_font,
    font_scale: Number(document.getElementById("custom-font-scale")?.value || 100),
    radius_scale: Number(document.getElementById("custom-radius-scale")?.value || 100),
    shadow_strength: Number(document.getElementById("custom-shadow-strength")?.value || 100),
  });
}

function populateCustomThemeForm(rawTheme) {
  const theme = window.MeowTheme.normalizeCustomTheme(rawTheme || {});

  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = String(value);
  };

  const enabledEl = document.getElementById("custom-enabled");
  if (enabledEl) enabledEl.checked = Boolean(theme.enabled);

  setValue("custom-background", theme.background);
  setValue("custom-accent", theme.accent);
  setValue("custom-mode", theme.mode);
  setValue("custom-background-style", theme.background_style);
  setValue("custom-font-scale", theme.font_scale);
  setValue("custom-radius-scale", theme.radius_scale);
  setValue("custom-shadow-strength", theme.shadow_strength);

  updateCustomThemeRangeOutputs();
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

function populateCopyForm(rawCopy) {
  const copy = normalizeCopy(rawCopy);
  Object.entries(COPY_INPUT_IDS).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = copy[key] || DEFAULT_COPY[key] || "";
  });
}

function readCopyForm() {
  const next = { ...DEFAULT_COPY };
  Object.entries(COPY_INPUT_IDS).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const value = String(input.value || "").trim();
    next[key] = value || DEFAULT_COPY[key];
  });
  return next;
}

function updateAssetOpacityOutput() {
  const input = document.getElementById("asset-bg-opacity");
  const output = document.getElementById("asset-bg-opacity-output");
  if (!input || !output) return;
  output.textContent = `${input.value}%`;
}

function normalizeCustomAssetsConfig(raw) {
  return window.MeowTheme.normalizeCustomAssets(raw || DEFAULT_CUSTOM_ASSETS);
}

function formatFontOptionLabel(font) {
  const status = String(font?.license_status || "review");
  if (status === "allowed") return `${font.name} (Open)`;
  if (status === "blocked") return `${font.name} (Blocked)`;
  return `${font.name} (Review)`;
}

function fillSelectOptions(selectEl, items, getValue, getLabel) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "不使用";
  selectEl.appendChild(empty);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = getValue(item);
    option.textContent = getLabel(item);
    selectEl.appendChild(option);
  });
}

function updateAssetLicenseSummary() {
  if (!assetLicenseSummaryEl) return;
  const fonts = Array.isArray(localAssetCatalog.fonts) ? localAssetCatalog.fonts : [];
  const allowed = fonts.filter((f) => f.license_status === "allowed").length;
  const review = fonts.filter((f) => f.license_status === "review").length;
  const blocked = fonts.filter((f) => f.license_status === "blocked").length;
  assetLicenseSummaryEl.textContent = `字体扫描结果：可用 ${allowed}，待确认 ${review}，已禁用 ${blocked}。`;
}

async function loadLocalAssetCatalog() {
  if (!adminToken) return;
  const catalog = await request("/api/admin/local-assets", { method: "GET" }, { admin: true });
  localAssetCatalog = {
    backgrounds: Array.isArray(catalog.backgrounds) ? catalog.backgrounds : [],
    fonts: Array.isArray(catalog.fonts) ? catalog.fonts : [],
    allowed_font_paths: Array.isArray(catalog.allowed_font_paths) ? catalog.allowed_font_paths : [],
  };

  const allowedFonts = localAssetCatalog.fonts.filter((font) => font.license_status === "allowed");
  fillSelectOptions(
    document.getElementById("asset-bg-file"),
    localAssetCatalog.backgrounds,
    (item) => item.path,
    (item) => item.name,
  );
  fillSelectOptions(
    document.getElementById("asset-font-latin"),
    allowedFonts,
    (item) => item.path,
    (item) => formatFontOptionLabel(item),
  );
  fillSelectOptions(
    document.getElementById("asset-font-cjk"),
    allowedFonts,
    (item) => item.path,
    (item) => formatFontOptionLabel(item),
  );

  updateAssetLicenseSummary();
}

function populateAssetForm(rawAssets, rawTheme = null) {
  const assets = normalizeCustomAssetsConfig(rawAssets || DEFAULT_CUSTOM_ASSETS);

  const themeFonts = normalizeThemeFontSettings(rawTheme || window.MeowTheme.getCurrentCustomTheme?.() || DEFAULT_THEME_FONT_SETTINGS);

  const bgEnabled = document.getElementById("asset-bg-enabled");
  const bgFile = document.getElementById("asset-bg-file");
  const bgOpacity = document.getElementById("asset-bg-opacity");
  const fontEnabled = document.getElementById("asset-font-enabled");
  const latin = document.getElementById("asset-font-latin");
  const cjk = document.getElementById("asset-font-cjk");
  const heading = document.getElementById("asset-theme-heading-font");
  const body = document.getElementById("asset-theme-body-font");

  if (bgEnabled) bgEnabled.checked = Boolean(assets.background_enabled);
  if (bgFile) bgFile.value = assets.background_file || "";
  if (bgOpacity) bgOpacity.value = String(assets.background_opacity ?? 58);
  if (fontEnabled) fontEnabled.checked = Boolean(assets.font_enabled);
  if (latin) latin.value = assets.font_latin_file || "";
  if (cjk) cjk.value = assets.font_cjk_file || "";
  if (heading) heading.value = themeFonts.heading_font;
  if (body) body.value = themeFonts.body_font;

  updateAssetOpacityOutput();
}

function readAssetForm() {
  return normalizeCustomAssetsConfig({
    background_enabled: document.getElementById("asset-bg-enabled")?.checked,
    background_file: document.getElementById("asset-bg-file")?.value || "",
    background_opacity: Number(document.getElementById("asset-bg-opacity")?.value || 58),
    font_enabled: document.getElementById("asset-font-enabled")?.checked,
    font_latin_file: document.getElementById("asset-font-latin")?.value || "",
    font_cjk_file: document.getElementById("asset-font-cjk")?.value || "",
  });
}

function normalizeThemeFontSettings(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const heading = String(input.heading_font || DEFAULT_THEME_FONT_SETTINGS.heading_font).toLowerCase();
  const body = String(input.body_font || DEFAULT_THEME_FONT_SETTINGS.body_font).toLowerCase();
  return {
    heading_font: SUPPORTED_THEME_FONTS.has(heading) ? heading : DEFAULT_THEME_FONT_SETTINGS.heading_font,
    body_font: SUPPORTED_THEME_FONTS.has(body) ? body : DEFAULT_THEME_FONT_SETTINGS.body_font,
  };
}

function readAssetThemeFontForm() {
  return normalizeThemeFontSettings({
    heading_font: document.getElementById("asset-theme-heading-font")?.value || DEFAULT_THEME_FONT_SETTINGS.heading_font,
    body_font: document.getElementById("asset-theme-body-font")?.value || DEFAULT_THEME_FONT_SETTINGS.body_font,
  });
}

async function loadDashboard({ forceSync = false } = {}) {
  const dashboard = await request("/api/dashboard", { method: "GET" });
  renderProfile(dashboard.profile_status);
  renderWidgets(dashboard.widgets || []);

  if (dashboard.theme && window.MeowTheme) {
    window.MeowTheme.applyTheme(dashboard.theme, dashboard.custom_theme || null, dashboard.custom_assets || null);
    applyThemeSelectionVisual(dashboard.theme);
  }

  if (adminToken && (forceSync || !assetInitialized)) {
    try {
      await loadLocalAssetCatalog();
      populateAssetForm(dashboard.custom_assets || DEFAULT_CUSTOM_ASSETS, dashboard.custom_theme || null);
      assetInitialized = true;
    } catch (error) {
      setAssetMessage(`素材清单读取失败：${error.message}`, true);
    }
  }

  if (forceSync || !customThemeInitialized) {
    populateCustomThemeForm(dashboard.custom_theme || {});
    customThemeInitialized = true;
  }

  if (forceSync || !copyInitialized) {
    populateCopyForm(dashboard.copy || DEFAULT_COPY);
    copyInitialized = true;
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
  await loadDashboard({ forceSync: false });
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
      await loadDashboard({ forceSync: false });
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
      await loadDashboard({ forceSync: false });
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
}

function bindCustomThemePanel() {
  if (!customThemeForm || !window.MeowTheme) return;

  ["custom-font-scale", "custom-radius-scale", "custom-shadow-strength"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("input", updateCustomThemeRangeOutputs);
  });

  customThemePreviewBtn?.addEventListener("click", () => {
    try {
      const config = readCustomThemeForm();
      window.MeowTheme.previewCustomTheme(config, activeThemeId || window.MeowTheme.getCurrentTheme());
      setCustomThemeMessage("已应用本地预览（未保存）。");
    } catch (error) {
      setCustomThemeMessage(`预览失败：${error.message}`, true);
    }
  });

  customThemeSaveBtn?.addEventListener("click", async () => {
    if (!adminToken) {
      setCustomThemeMessage("请先登录后再保存。", true);
      return;
    }

    try {
      const config = readCustomThemeForm();
      const result = await window.MeowTheme.saveCustomTheme(
        config,
        adminToken,
        activeThemeId || window.MeowTheme.getCurrentTheme(),
      );
      customThemeInitialized = false;
      await loadDashboard({ forceSync: true });
      setCustomThemeMessage(`自定义主题已保存并生效（基于 ${getThemeName(result.theme)}）。`);
    } catch (error) {
      setCustomThemeMessage(`保存失败：${error.message}`, true);
    }
  });

  customThemeResetBtn?.addEventListener("click", async () => {
    const current = window.MeowTheme.getCurrentCustomTheme?.() || {};
    const defaults = window.MeowTheme.normalizeCustomTheme({});
    defaults.heading_font = current.heading_font || defaults.heading_font;
    defaults.body_font = current.body_font || defaults.body_font;
    populateCustomThemeForm(defaults);
    window.MeowTheme.previewCustomTheme(defaults, activeThemeId || window.MeowTheme.getCurrentTheme());
    setCustomThemeMessage("已恢复默认自定义参数（不影响字体设置），你可以直接保存。", false);
  });
}

function bindCopyPanel() {
  if (!copyForm) return;

  copySaveBtn?.addEventListener("click", async () => {
    if (!adminToken) {
      setCopyMessage("请先登录后再保存文案。", true);
      return;
    }

    try {
      const payload = readCopyForm();
      await request(
        "/api/copy",
        {
          method: "POST",
          body: JSON.stringify({ copy: payload }),
        },
        { admin: true },
      );
      copyInitialized = false;
      await loadDashboard({ forceSync: true });
      setCopyMessage("公开页文案已保存。", false);
    } catch (error) {
      setCopyMessage(`保存失败：${error.message}`, true);
    }
  });

  copyResetBtn?.addEventListener("click", () => {
    populateCopyForm(DEFAULT_COPY);
    setCopyMessage("已恢复默认文案，点击“保存文案”后生效。", false);
  });
}

function bindAssetPanel() {
  if (!assetForm || !window.MeowTheme) return;

  document.getElementById("asset-bg-opacity")?.addEventListener("input", updateAssetOpacityOutput);

  assetPreviewBtn?.addEventListener("click", () => {
    try {
      const assets = readAssetForm();
      const fontTheme = readAssetThemeFontForm();
      const currentTheme = window.MeowTheme.getCurrentCustomTheme?.() || {};
      const mergedTheme = window.MeowTheme.normalizeCustomTheme({ ...currentTheme, ...fontTheme });
      window.MeowTheme.previewCustomTheme(mergedTheme, activeThemeId || window.MeowTheme.getCurrentTheme());
      window.MeowTheme.previewCustomAssets(assets, activeThemeId || window.MeowTheme.getCurrentTheme(), mergedTheme);
      setAssetMessage("已应用本地素材与字体预览（未保存）。", false);
    } catch (error) {
      setAssetMessage(`预览失败：${error.message}`, true);
    }
  });

  assetSaveBtn?.addEventListener("click", async () => {
    if (!adminToken) {
      setAssetMessage("请先登录后再保存。", true);
      return;
    }

    try {
      const assets = readAssetForm();
      const fontTheme = readAssetThemeFontForm();
      const currentTheme = window.MeowTheme.getCurrentCustomTheme?.() || {};
      const mergedTheme = window.MeowTheme.normalizeCustomTheme({ ...currentTheme, ...fontTheme });

      await window.MeowTheme.saveCustomTheme(
        mergedTheme,
        adminToken,
        activeThemeId || window.MeowTheme.getCurrentTheme(),
      );
      await window.MeowTheme.saveCustomAssets(assets, adminToken);

      assetInitialized = false;
      customThemeInitialized = false;
      await loadDashboard({ forceSync: true });
      setAssetMessage("本地素材与字体设置已保存并同步公开页。", false);
    } catch (error) {
      setAssetMessage(`保存失败：${error.message}`, true);
    }
  });

  assetResetBtn?.addEventListener("click", () => {
    const defaultAssets = window.MeowTheme.normalizeCustomAssets({});
    const currentTheme = window.MeowTheme.getCurrentCustomTheme?.() || {};
    const defaultFonts = normalizeThemeFontSettings({});
    const mergedTheme = window.MeowTheme.normalizeCustomTheme({ ...currentTheme, ...defaultFonts });
    populateAssetForm(defaultAssets, mergedTheme);
    window.MeowTheme.previewCustomTheme(mergedTheme, activeThemeId || window.MeowTheme.getCurrentTheme());
    window.MeowTheme.previewCustomAssets(
      defaultAssets,
      activeThemeId || window.MeowTheme.getCurrentTheme(),
      mergedTheme,
    );
    setAssetMessage("已恢复本地素材与字体默认设置，点击保存后生效。", false);
  });
}

function openAuthModal() {
  authModal.classList.remove("hidden");
  loginForm.classList.remove("hidden");
  rotateForm.classList.add("hidden");
  setAuthMessage("");
  setThemeMessage("");
  setCustomThemeMessage("");
  setCopyMessage("");
  setAssetMessage("");
  document.getElementById("login-token").value = "";
  document.getElementById("new-token").value = "";
  document.getElementById("confirm-token").value = "";
  adminToken = "";
  pendingLoginToken = "";
  assetInitialized = false;
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
    customThemeInitialized = false;
    copyInitialized = false;
    assetInitialized = false;
    await loadDashboard({ forceSync: true });
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
    customThemeInitialized = false;
    copyInitialized = false;
    assetInitialized = false;
    await loadDashboard({ forceSync: true });
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
  bindCustomThemePanel();
  bindCopyPanel();
  bindAssetPanel();

  updateCustomThemeRangeOutputs();
  updateAssetOpacityOutput();
  initialized = true;
}

init();
openAuthModal();
setInterval(async () => {
  if (!adminToken) return;
  try {
    await loadDashboard({ forceSync: false });
  } catch {
    // Ignore periodic refresh errors in background; manual actions surface errors.
  }
}, 10000);
