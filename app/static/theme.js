(function () {
  const DEFAULT_THEME_ID = "bluery";

  const DEFAULT_CUSTOM_THEME = {
    enabled: false,
    background: "#37474f",
    accent: "#2196f3",
    mode: "auto",
    background_style: "gradient",
    heading_font: "default",
    body_font: "default",
    heading_font_latin: "default",
    heading_font_cjk: "default",
    body_font_latin: "default",
    body_font_cjk: "default",
    widget_title_font_latin: "inherit",
    widget_title_font_cjk: "inherit",
    widget_body_font_latin: "inherit",
    widget_body_font_cjk: "inherit",
    font_scale: 100,
    radius_scale: 100,
    shadow_strength: 100,
    panel_opacity: 100,
    card_opacity: 46,
    input_opacity: 100,
    overlay_opacity: 58,
  };

  const DEFAULT_CUSTOM_ASSETS = {
    background_enabled: false,
    background_file: "",
    background_opacity: 58,
    font_enabled: false,
    font_latin_file: "",
    font_cjk_file: "",
  };

  const FONT_STACKS_LATIN = {
    default: '"Segoe UI", "Helvetica Neue", "Arial", sans-serif',
    mono: '"Cascadia Mono", "JetBrains Mono", "Consolas", monospace',
    serif: '"Georgia", "Times New Roman", serif',
    round: '"Nunito", "Segoe UI", "Trebuchet MS", sans-serif',
    display: '"Trebuchet MS", "Verdana", "Segoe UI", sans-serif',
  };

  const FONT_STACKS_CJK = {
    default: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif',
    mono: '"Noto Sans Mono CJK SC", "Sarasa Mono SC", "Cascadia Mono", "Consolas", monospace',
    serif: '"Source Han Serif SC", "Noto Serif SC", "STSong", "Songti SC", serif',
    round: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    display: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  };

  const SUPPORTED_FONT_CHOICES = new Set(Object.keys(FONT_STACKS_LATIN));
  const SUPPORTED_COMPONENT_FONT_CHOICES = new Set(["inherit", ...SUPPORTED_FONT_CHOICES]);
  const LOCAL_LATIN_UNICODE_RANGE =
    "U+0000-00FF, U+0100-024F, U+1E00-1EFF, U+2000-206F, U+20A0-20CF, U+2100-214F, U+2150-218F";
  const LOCAL_CJK_UNICODE_RANGE = "U+2E80-2FDF, U+3040-30FF, U+31F0-31FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FF00-FFEF";

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
  let currentCustomTheme = { ...DEFAULT_CUSTOM_THEME };
  let currentCustomAssets = { ...DEFAULT_CUSTOM_ASSETS };
  let currentAssetUrlResolver = localAssetUrl;

  function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  }

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

  function normalizeAssetPath(input) {
    const raw = String(input || "").trim().replace(/\\/g, "/");
    if (!raw) return "";
    const parts = raw.split("/").filter((part) => part && part !== "." && part !== "..");
    return parts.join("/");
  }

  function localAssetUrl(kind, relPath) {
    const cleanPath = normalizeAssetPath(relPath);
    if (!cleanPath) return "";
    const encoded = cleanPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return `/local-assets/${kind}/${encoded}`;
  }

  function fontFormatForPath(fontPath) {
    const lower = String(fontPath || "").toLowerCase();
    if (lower.endsWith(".woff2")) return "woff2";
    if (lower.endsWith(".woff")) return "woff";
    if (lower.endsWith(".otf")) return "opentype";
    return "truetype";
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

  function scaleShadowAlpha(shadow, factor) {
    const normalizedFactor = Math.max(0.2, Math.min(2, Number(factor) || 1));
    return String(shadow).replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/, (_, r, g, b, a) => {
      const base = Number(a);
      const next = Math.max(0.03, Math.min(0.95, base * normalizedFactor));
      return `rgba(${r}, ${g}, ${b}, ${next.toFixed(3)})`;
    });
  }

  function normalizeCustomTheme(input) {
    const raw = typeof input === "object" && input ? input : {};
    const normalizeFont = (value, fallback, { allowInherit = false } = {}) => {
      const choice = String(value || "").toLowerCase();
      const supported = allowInherit ? SUPPORTED_COMPONENT_FONT_CHOICES : SUPPORTED_FONT_CHOICES;
      return supported.has(choice) ? choice : fallback;
    };

    const legacyHeading = normalizeFont(raw.heading_font, DEFAULT_CUSTOM_THEME.heading_font);
    const legacyBody = normalizeFont(raw.body_font, DEFAULT_CUSTOM_THEME.body_font);
    const headingFontLatin = normalizeFont(raw.heading_font_latin, legacyHeading);
    const headingFontCjk = normalizeFont(raw.heading_font_cjk, legacyHeading);
    const bodyFontLatin = normalizeFont(raw.body_font_latin, legacyBody);
    const bodyFontCjk = normalizeFont(raw.body_font_cjk, legacyBody);

    const widgetTitleFontLatin = normalizeFont(raw.widget_title_font_latin, DEFAULT_CUSTOM_THEME.widget_title_font_latin, {
      allowInherit: true,
    });
    const widgetTitleFontCjk = normalizeFont(raw.widget_title_font_cjk, DEFAULT_CUSTOM_THEME.widget_title_font_cjk, {
      allowInherit: true,
    });
    const widgetBodyFontLatin = normalizeFont(raw.widget_body_font_latin, DEFAULT_CUSTOM_THEME.widget_body_font_latin, {
      allowInherit: true,
    });
    const widgetBodyFontCjk = normalizeFont(raw.widget_body_font_cjk, DEFAULT_CUSTOM_THEME.widget_body_font_cjk, {
      allowInherit: true,
    });

    return {
      enabled: Boolean(raw.enabled),
      background: normalizeHex(raw.background || DEFAULT_CUSTOM_THEME.background),
      accent: normalizeHex(raw.accent || DEFAULT_CUSTOM_THEME.accent),
      mode: ["auto", "light", "dark"].includes(String(raw.mode || "").toLowerCase())
        ? String(raw.mode).toLowerCase()
        : DEFAULT_CUSTOM_THEME.mode,
      background_style: ["gradient", "solid"].includes(String(raw.background_style || "").toLowerCase())
        ? String(raw.background_style).toLowerCase()
        : DEFAULT_CUSTOM_THEME.background_style,
      heading_font: headingFontLatin,
      body_font: bodyFontLatin,
      heading_font_latin: headingFontLatin,
      heading_font_cjk: headingFontCjk,
      body_font_latin: bodyFontLatin,
      body_font_cjk: bodyFontCjk,
      widget_title_font_latin: widgetTitleFontLatin,
      widget_title_font_cjk: widgetTitleFontCjk,
      widget_body_font_latin: widgetBodyFontLatin,
      widget_body_font_cjk: widgetBodyFontCjk,
      font_scale: clampInt(raw.font_scale, 85, 130, DEFAULT_CUSTOM_THEME.font_scale),
      radius_scale: clampInt(raw.radius_scale, 75, 150, DEFAULT_CUSTOM_THEME.radius_scale),
      shadow_strength: clampInt(raw.shadow_strength, 50, 180, DEFAULT_CUSTOM_THEME.shadow_strength),
      panel_opacity: clampInt(raw.panel_opacity, 35, 100, DEFAULT_CUSTOM_THEME.panel_opacity),
      card_opacity: clampInt(raw.card_opacity, 20, 100, DEFAULT_CUSTOM_THEME.card_opacity),
      input_opacity: clampInt(raw.input_opacity, 35, 100, DEFAULT_CUSTOM_THEME.input_opacity),
      overlay_opacity: clampInt(raw.overlay_opacity, 20, 90, DEFAULT_CUSTOM_THEME.overlay_opacity),
    };
  }

  function normalizeCustomAssets(input) {
    const raw = typeof input === "object" && input ? input : {};
    return {
      background_enabled: Boolean(raw.background_enabled),
      background_file: normalizeAssetPath(raw.background_file),
      background_opacity: clampInt(raw.background_opacity, 0, 100, DEFAULT_CUSTOM_ASSETS.background_opacity),
      font_enabled: Boolean(raw.font_enabled),
      font_latin_file: normalizeAssetPath(raw.font_latin_file),
      font_cjk_file: normalizeAssetPath(raw.font_cjk_file),
    };
  }

  function resolveTheme(themeId, customTheme) {
    const base = THEMES_BY_ID.get(themeId) || THEMES_BY_ID.get(DEFAULT_THEME_ID);
    const normalized = normalizeCustomTheme(customTheme);

    if (!normalized.enabled) {
      return {
        id: base.id,
        name: base.name,
        background: base.background,
        accent: base.accent,
        mode: base.mode,
        background_style: normalized.background_style,
      };
    }

    return {
      id: base.id,
      name: `${base.name} (Custom)`,
      background: normalized.background,
      accent: normalized.accent,
      mode: normalized.mode === "auto" ? base.mode : normalized.mode,
      background_style: normalized.background_style,
    };
  }

  function syncThemeOptions() {
    document.querySelectorAll(".theme-option").forEach((button) => {
      const active = button.dataset.themeId === currentThemeId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyCustomAssets(customAssets = currentCustomAssets, options = {}) {
    const normalizedAssets = normalizeCustomAssets(customAssets);
    const assetUrl = typeof options.assetUrlResolver === "function" ? options.assetUrlResolver : currentAssetUrlResolver;
    const root = document.documentElement;

    if (normalizedAssets.background_enabled && normalizedAssets.background_file) {
      const url = assetUrl("bg", normalizedAssets.background_file);
      root.style.setProperty("--bg-photo-url", `url(\"${url}\")`);
      root.style.setProperty("--bg-photo-opacity", (normalizedAssets.background_opacity / 100).toFixed(2));
    } else {
      root.style.setProperty("--bg-photo-url", "none");
      root.style.setProperty("--bg-photo-opacity", "0");
    }

    let styleEl = document.getElementById("meow-local-font-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "meow-local-font-style";
      document.head.appendChild(styleEl);
    }

    const rules = [];
    const latinUrl = normalizedAssets.font_enabled ? assetUrl("fonts", normalizedAssets.font_latin_file) : "";
    const cjkUrl = normalizedAssets.font_enabled ? assetUrl("fonts", normalizedAssets.font_cjk_file) : "";

    if (latinUrl) {
      rules.push(
        `@font-face { font-family: "MeowLocalLatin"; src: url("${latinUrl}") format("${fontFormatForPath(normalizedAssets.font_latin_file)}"); font-display: swap; unicode-range: ${LOCAL_LATIN_UNICODE_RANGE}; }`,
      );
    }
    if (cjkUrl) {
      rules.push(
        `@font-face { font-family: "MeowLocalCJK"; src: url("${cjkUrl}") format("${fontFormatForPath(normalizedAssets.font_cjk_file)}"); font-display: swap; unicode-range: ${LOCAL_CJK_UNICODE_RANGE}; }`,
      );
    }

    styleEl.textContent = rules.join("\n");

    if (normalizedAssets.font_enabled && (latinUrl || cjkUrl)) {
      const bodyFamilies = [];
      const headingFamilies = [];
      if (latinUrl) {
        bodyFamilies.push('"MeowLocalLatin"');
        headingFamilies.push('"MeowLocalLatin"');
      }
      if (cjkUrl) {
        bodyFamilies.push('"MeowLocalCJK"');
        headingFamilies.push('"MeowLocalCJK"');
      }
      bodyFamilies.push("var(--body-font)");
      headingFamilies.push("var(--heading-font)");
      root.style.setProperty("--font-override-body", bodyFamilies.join(", "));
      root.style.setProperty("--font-override-heading", headingFamilies.join(", "));
      root.style.setProperty("--font-override-widget-body", bodyFamilies.join(", "));
      root.style.setProperty("--font-override-widget-title", headingFamilies.join(", "));
    } else {
      root.style.removeProperty("--font-override-body");
      root.style.removeProperty("--font-override-heading");
      root.style.removeProperty("--font-override-widget-body");
      root.style.removeProperty("--font-override-widget-title");
    }

    currentCustomAssets = normalizedAssets;
    return normalizedAssets;
  }

  function applyPalette(themeId, customTheme = currentCustomTheme, customAssets = currentCustomAssets, options = {}) {
    const normalizedCustom = normalizeCustomTheme(customTheme);
    const theme = resolveTheme(themeId, normalizedCustom);
    const palette = makePalette(theme);
    if (theme.background_style === "solid") {
      palette.bgBottom = palette.bgTop;
    }

    const root = document.documentElement;
    const shadowFactor = (normalizedCustom.shadow_strength || 100) / 100;
    const panelAlpha = normalizedCustom.panel_opacity / 100;
    const cardAlpha = normalizedCustom.card_opacity / 100;
    const inputAlpha = normalizedCustom.input_opacity / 100;
    const overlayAlpha = normalizedCustom.overlay_opacity / 100;
    const cardSoftAlpha = Math.max(0.08, Math.min(1, cardAlpha * 0.66));
    const heroAlpha = Math.max(0.08, Math.min(1, cardAlpha * 0.48));
    const cardTint = isDarkTheme(theme) ? mixHex(palette.surfaceSoft, "#ffffff", 0.72) : "#ffffff";

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
    root.style.setProperty("--shadow", scaleShadowAlpha(palette.shadow, shadowFactor));
    root.style.setProperty("--bg-glow-secondary", palette.glowSecondary);
    root.style.setProperty(
      "--panel-bg",
      `linear-gradient(160deg, ${hexToRgba(palette.surface, panelAlpha)}, ${hexToRgba(palette.surfaceSoft, panelAlpha)})`,
    );
    root.style.setProperty(
      "--modal-card-bg",
      `linear-gradient(165deg, ${hexToRgba(palette.surface, panelAlpha)}, ${hexToRgba(palette.surfaceSoft, panelAlpha)})`,
    );
    root.style.setProperty("--card-bg", hexToRgba(cardTint, cardAlpha));
    root.style.setProperty("--card-bg-soft", hexToRgba(cardTint, cardSoftAlpha));
    root.style.setProperty(
      "--hero-bg",
      `linear-gradient(160deg, ${hexToRgba(palette.accent, heroAlpha)}, ${hexToRgba(palette.surfaceSoft, heroAlpha)})`,
    );
    root.style.setProperty("--input-bg", hexToRgba(palette.surfaceSoft, inputAlpha));
    root.style.setProperty("--modal-overlay-bg", `rgba(8, 12, 20, ${overlayAlpha.toFixed(2)})`);

    const headingLatinChoice = normalizedCustom.heading_font_latin;
    const headingCjkChoice = normalizedCustom.heading_font_cjk;
    const bodyLatinChoice = normalizedCustom.body_font_latin;
    const bodyCjkChoice = normalizedCustom.body_font_cjk;

    const widgetTitleLatinChoice =
      normalizedCustom.widget_title_font_latin === "inherit" ? headingLatinChoice : normalizedCustom.widget_title_font_latin;
    const widgetTitleCjkChoice =
      normalizedCustom.widget_title_font_cjk === "inherit" ? headingCjkChoice : normalizedCustom.widget_title_font_cjk;
    const widgetBodyLatinChoice =
      normalizedCustom.widget_body_font_latin === "inherit" ? bodyLatinChoice : normalizedCustom.widget_body_font_latin;
    const widgetBodyCjkChoice =
      normalizedCustom.widget_body_font_cjk === "inherit" ? bodyCjkChoice : normalizedCustom.widget_body_font_cjk;

    const headingLatinStack = FONT_STACKS_LATIN[headingLatinChoice] || FONT_STACKS_LATIN.default;
    const headingCjkStack = FONT_STACKS_CJK[headingCjkChoice] || FONT_STACKS_CJK.default;
    const bodyLatinStack = FONT_STACKS_LATIN[bodyLatinChoice] || FONT_STACKS_LATIN.default;
    const bodyCjkStack = FONT_STACKS_CJK[bodyCjkChoice] || FONT_STACKS_CJK.default;
    const widgetTitleLatinStack = FONT_STACKS_LATIN[widgetTitleLatinChoice] || FONT_STACKS_LATIN.default;
    const widgetTitleCjkStack = FONT_STACKS_CJK[widgetTitleCjkChoice] || FONT_STACKS_CJK.default;
    const widgetBodyLatinStack = FONT_STACKS_LATIN[widgetBodyLatinChoice] || FONT_STACKS_LATIN.default;
    const widgetBodyCjkStack = FONT_STACKS_CJK[widgetBodyCjkChoice] || FONT_STACKS_CJK.default;

    root.style.setProperty("--heading-font", `${headingLatinStack}, ${headingCjkStack}`);
    root.style.setProperty("--body-font", `${bodyLatinStack}, ${bodyCjkStack}`);
    root.style.setProperty("--widget-title-font", `${widgetTitleLatinStack}, ${widgetTitleCjkStack}`);
    root.style.setProperty("--widget-body-font", `${widgetBodyLatinStack}, ${widgetBodyCjkStack}`);
    root.style.setProperty("--font-scale", (normalizedCustom.font_scale / 100).toFixed(3));
    root.style.setProperty("--radius-scale", (normalizedCustom.radius_scale / 100).toFixed(3));

    currentThemeId = theme.id;
    currentCustomTheme = normalizedCustom;
    syncThemeOptions();
    if (typeof options.assetUrlResolver === "function") {
      currentAssetUrlResolver = options.assetUrlResolver;
    } else if (options.resetAssetUrlResolver) {
      currentAssetUrlResolver = localAssetUrl;
    }
    applyCustomAssets(customAssets, options);
    return theme.id;
  }

  async function loadRemoteTheme() {
    const response = await fetch("/api/theme", { method: "GET" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Theme request failed (${response.status})`);
    }

    const themeId = THEMES_BY_ID.has(body.theme) ? body.theme : DEFAULT_THEME_ID;
    const customTheme = normalizeCustomTheme(body.custom_theme);
    const customAssets = normalizeCustomAssets(body.custom_assets);
    applyPalette(themeId, customTheme, customAssets, { resetAssetUrlResolver: true });
    return { theme: themeId, custom_theme: customTheme, custom_assets: customAssets };
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
    const customTheme = normalizeCustomTheme(body.custom_theme || currentCustomTheme);
    const customAssets = normalizeCustomAssets(body.custom_assets || currentCustomAssets);
    applyPalette(savedId, customTheme, customAssets, { resetAssetUrlResolver: true });
    return { theme: savedId, custom_theme: customTheme, custom_assets: customAssets };
  }

  async function saveCustomTheme(customTheme, adminToken, themeId = currentThemeId) {
    const normalizedTheme = THEMES_BY_ID.has(themeId) ? themeId : DEFAULT_THEME_ID;
    const token = String(adminToken || "").trim();
    if (!token) {
      throw new Error("缺少管理员 Token");
    }

    const payload = {
      theme: normalizedTheme,
      custom_theme: normalizeCustomTheme(customTheme),
    };

    const response = await fetch("/api/theme", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": token,
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Theme update failed (${response.status})`);
      error.status = response.status;
      throw error;
    }

    const nextTheme = THEMES_BY_ID.has(body.theme) ? body.theme : normalizedTheme;
    const nextCustomTheme = normalizeCustomTheme(body.custom_theme);
    const nextCustomAssets = normalizeCustomAssets(body.custom_assets || currentCustomAssets);
    applyPalette(nextTheme, nextCustomTheme, nextCustomAssets, { resetAssetUrlResolver: true });
    return { theme: nextTheme, custom_theme: nextCustomTheme, custom_assets: nextCustomAssets };
  }

  async function saveCustomAssets(customAssets, adminToken) {
    const token = String(adminToken || "").trim();
    if (!token) {
      throw new Error("缺少管理员 Token");
    }

    const response = await fetch("/api/assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": token,
      },
      body: JSON.stringify({ custom_assets: normalizeCustomAssets(customAssets) }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Assets update failed (${response.status})`);
      error.status = response.status;
      throw error;
    }

    const savedAssets = normalizeCustomAssets(body.custom_assets);
    applyPalette(currentThemeId, currentCustomTheme, savedAssets, { resetAssetUrlResolver: true });
    return { custom_assets: savedAssets };
  }

  function previewCustomTheme(customTheme, themeId = currentThemeId) {
    const normalizedTheme = THEMES_BY_ID.has(themeId) ? themeId : DEFAULT_THEME_ID;
    const normalizedCustom = normalizeCustomTheme(customTheme);
    applyPalette(normalizedTheme, normalizedCustom, currentCustomAssets);
    return { theme: normalizedTheme, custom_theme: normalizedCustom, custom_assets: currentCustomAssets };
  }

  function previewCustomAssets(customAssets, themeId = currentThemeId, customTheme = currentCustomTheme, options = {}) {
    const normalizedTheme = THEMES_BY_ID.has(themeId) ? themeId : DEFAULT_THEME_ID;
    const normalizedThemeConfig = normalizeCustomTheme(customTheme);
    const normalizedAssets = normalizeCustomAssets(customAssets);
    applyPalette(normalizedTheme, normalizedThemeConfig, normalizedAssets, options);
    return { theme: normalizedTheme, custom_theme: normalizedThemeConfig, custom_assets: normalizedAssets };
  }

  function getThemes() {
    return THEMES.map((theme) => ({ ...theme }));
  }

  function getCurrentCustomTheme() {
    return { ...currentCustomTheme };
  }

  function getCurrentCustomAssets() {
    return { ...currentCustomAssets };
  }

  function init() {
    applyPalette(DEFAULT_THEME_ID, DEFAULT_CUSTOM_THEME, DEFAULT_CUSTOM_ASSETS);
    loadRemoteTheme().catch(() => {
      // Keep default theme when remote loading fails.
    });
  }

  window.MeowTheme = {
    applyTheme: (themeId, customTheme, customAssets) =>
      applyPalette(themeId, customTheme, customAssets, { resetAssetUrlResolver: true }),
    getThemes,
    getCurrentTheme: () => currentThemeId,
    getCurrentCustomTheme,
    getCurrentCustomAssets,
    normalizeCustomTheme,
    normalizeCustomAssets,
    previewCustomTheme,
    previewCustomAssets,
    loadRemoteTheme,
    saveTheme,
    saveCustomTheme,
    saveCustomAssets,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
