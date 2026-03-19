(function () {
  const DEFAULT_THEME_ID = "bluery";

  const THEMES = [
    { id: "bluery", name: "Bluery", background: "#37474F", accent: "#2196f3", mode: "dark" },
    { id: "midnight", name: "Midnight", background: "#181848", accent: "#c5cae9", mode: "dark" },
    { id: "nature", name: "Nature", background: "#c8e6c9", accent: "#4caf50", mode: "light" },
    { id: "lake", name: "Lake", background: "#00b0ff", accent: "#e1f5fe", mode: "light" },
    { id: "coder", name: "Coder", background: "#101010", accent: "#64dd17", mode: "dark" },
    { id: "github", name: "Github", background: "#f6f8fa", accent: "#0969da", mode: "light" },
    { id: "vscode", name: "VSCode", background: "#1e1e1e", accent: "#007acc", mode: "dark" },
    { id: "dark", name: "Dark", background: "#121212", accent: "#eaeaea", mode: "dark" },
    { id: "fox", name: "Fox", background: "#ff9900", accent: "#211100", mode: "light" },
    { id: "flamingo", name: "Flamingo", background: "#e68ab8", accent: "#eeeeee", mode: "light" },
    { id: "lavender", name: "Lavender", background: "#E39FF6", accent: "#7FFF00", mode: "light" },
    { id: "amethyst", name: "Amethyst", background: "#6F2DA8", accent: "#eeeeee", mode: "dark" },
    { id: "sky", name: "Sky", background: "#4fc3f7", accent: "#eeeeee", mode: "light" },
    { id: "cyan", name: "Cyan", background: "#e0f7fa", accent: "#00e5ff", mode: "light" },
    { id: "lemon", name: "Lemon", background: "#EFFD5F", accent: "#FFFDD0", mode: "light" },
    { id: "chocolate", name: "Chocolate", background: "#4E403B", accent: "#EED9C4", mode: "dark" },
    { id: "strawberry", name: "Strawberry", background: "#FEC5E5", accent: "#F26B8A", mode: "light" },
    { id: "mint", name: "Mint", background: "#99EDC3", accent: "#4db6ac", mode: "light" },
    { id: "lime", name: "Lime", background: "#f0f4c3", accent: "#AEF359", mode: "light" },
    { id: "obsidian", name: "Obsidian", background: "#1f1f1f", accent: "#a88bfa", mode: "dark" },
    { id: "ocean", name: "Ocean", background: "#88B6E4", accent: "#1B74CB", mode: "light" },
    { id: "pale", name: "Pale", background: "#ECEFF1", accent: "#ECEFF1", mode: "light" },
    { id: "honey", name: "Honey", background: "#FFF176", accent: "#FBC02D", mode: "light" },
    { id: "indigo", name: "Indigo", background: "#c5cae9", accent: "#3F51B5", mode: "light" },
    { id: "rose", name: "Rose", background: "#ffcdd2", accent: "#C92642", mode: "light" },
    { id: "paradox", name: "Paradox", background: "#187c9b", accent: "#c31919", mode: "dark" },
    { id: "gingercat", name: "GingerCat", background: "#ffe0b2", accent: "#fb8c00", mode: "light" },
    { id: "galaxy", name: "Galaxy", background: "#B0C4DE", accent: "#0F52BA", mode: "light" },
    { id: "pine", name: "Pine", background: "#2B5D34", accent: "#795548", mode: "dark" },
  ];

  const THEMES_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));
  let currentThemeId = DEFAULT_THEME_ID;

  function normalizeHex(input) {
    const raw = String(input || "").trim();
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return (
        "#" +
        hex
          .split("")
          .map((ch) => ch + ch)
          .join("")
          .toLowerCase()
      );
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return "#" + hex.toLowerCase();
    }
    return "#000000";
  }

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    const raw = normalized.slice(1);
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }

  function rgbToHex(rgb) {
    const toHex = (value) => {
      const clamped = Math.max(0, Math.min(255, Math.round(value)));
      return clamped.toString(16).padStart(2, "0");
    };
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  function mixHex(colorA, colorB, ratioToB) {
    const ratio = Math.max(0, Math.min(1, Number(ratioToB) || 0));
    const a = hexToRgb(colorA);
    const b = hexToRgb(colorB);
    return rgbToHex({
      r: a.r + (b.r - a.r) * ratio,
      g: a.g + (b.g - a.g) * ratio,
      b: a.b + (b.b - a.b) * ratio,
    });
  }

  function hexToRgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    const a = Math.max(0, Math.min(1, Number(alpha) || 0));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  }

  function isDarkTheme(theme) {
    if (theme.mode === "dark") return true;
    if (theme.mode === "light") return false;

    const rgb = hexToRgb(theme.background);
    const normalized = [rgb.r, rgb.g, rgb.b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2];
    return luminance < 0.46;
  }

  function makePalette(theme) {
    const bg = normalizeHex(theme.background);
    const accent = normalizeHex(theme.accent);
    const dark = isDarkTheme(theme);

    if (dark) {
      return {
        bgTop: bg,
        bgBottom: mixHex(bg, "#000000", 0.28),
        surface: mixHex(bg, "#ffffff", 0.14),
        surfaceSoft: mixHex(bg, "#ffffff", 0.2),
        text: "#eef3f7",
        muted: mixHex("#eef3f7", bg, 0.42),
        accent,
        accentStrong: mixHex(accent, "#000000", 0.26),
        accentSoft: hexToRgba(accent, 0.24),
        border: mixHex(bg, "#ffffff", 0.3),
        danger: "#ef7474",
        dangerStrong: "#c64a4a",
        shadow: "0 14px 36px rgba(3, 8, 16, 0.42)",
        inputBg: mixHex(bg, "#ffffff", 0.16),
        glowSecondary: hexToRgba(accent, 0.22),
      };
    }

    return {
      bgTop: bg,
      bgBottom: mixHex(bg, "#000000", 0.12),
      surface: mixHex(bg, "#ffffff", 0.82),
      surfaceSoft: mixHex(bg, "#ffffff", 0.72),
      text: "#1f2328",
      muted: mixHex("#1f2328", bg, 0.52),
      accent,
      accentStrong: mixHex(accent, "#000000", 0.18),
      accentSoft: hexToRgba(accent, 0.16),
      border: mixHex(bg, "#000000", 0.14),
      danger: "#bf3f3f",
      dangerStrong: "#922f2f",
      shadow: "0 14px 36px rgba(24, 29, 34, 0.14)",
      inputBg: "rgba(255, 255, 255, 0.92)",
      glowSecondary: "rgba(255, 255, 255, 0.22)",
    };
  }

  function applyPalette(themeId) {
    const theme = THEMES_BY_ID.get(themeId) || THEMES_BY_ID.get(DEFAULT_THEME_ID);
    const palette = makePalette(theme);
    const root = document.documentElement;

    root.setAttribute("data-theme", theme.id);
    root.style.setProperty("--bg-top", palette.bgTop);
    root.style.setProperty("--bg-bottom", palette.bgBottom);
    root.style.setProperty("--surface", palette.surface);
    root.style.setProperty("--surface-soft", palette.surfaceSoft);
    root.style.setProperty("--text", palette.text);
    root.style.setProperty("--muted", palette.muted);
    root.style.setProperty("--accent", palette.accent);
    root.style.setProperty("--accent-strong", palette.accentStrong);
    root.style.setProperty("--accent-soft", palette.accentSoft);
    root.style.setProperty("--border", palette.border);
    root.style.setProperty("--danger", palette.danger);
    root.style.setProperty("--danger-strong", palette.dangerStrong);
    root.style.setProperty("--shadow", palette.shadow);
    root.style.setProperty("--input-bg", palette.inputBg);
    root.style.setProperty("--bg-glow-secondary", palette.glowSecondary);

    currentThemeId = theme.id;
    syncThemeOptions();
    return theme.id;
  }

  function syncThemeOptions() {
    document.querySelectorAll(".theme-option").forEach((button) => {
      const active = button.dataset.themeId === currentThemeId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  async function loadRemoteTheme() {
    const response = await fetch("/api/theme", { method: "GET" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Theme request failed (${response.status})`);
    }

    const themeId = THEMES_BY_ID.has(body.theme) ? body.theme : DEFAULT_THEME_ID;
    applyPalette(themeId);
    return { theme: themeId };
  }

  async function saveTheme(themeId, adminToken) {
    const normalized = String(themeId || "").trim().toLowerCase();
    if (!THEMES_BY_ID.has(normalized)) {
      throw new Error("不支持的主题");
    }

    const token = String(adminToken || "").trim();
    if (!token) {
      throw new Error("缺少管理员 Token");
    }

    const response = await fetch("/api/theme", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": token,
      },
      body: JSON.stringify({ theme: normalized }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Theme update failed (${response.status})`);
      error.status = response.status;
      throw error;
    }

    const savedId = THEMES_BY_ID.has(body.theme) ? body.theme : normalized;
    applyPalette(savedId);
    return { theme: savedId };
  }

  function getThemes() {
    return THEMES.map((theme) => ({ ...theme }));
  }

  function init() {
    applyPalette(DEFAULT_THEME_ID);
    loadRemoteTheme().catch(() => {
      // Keep default theme when remote loading fails.
    });
  }

  window.MeowTheme = {
    applyTheme: applyPalette,
    getThemes,
    getCurrentTheme: () => currentThemeId,
    loadRemoteTheme,
    saveTheme,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
