import { db } from "../../../shared/db/database.js";
import type { BrandingThemeColors } from "../../../shared/db/types.js";

export interface BrandingRuntimeConfig {
  appName: string;
  htmlTitle: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  backgroundUrl: string | null;
  themeColors: BrandingThemeColors;
}

export interface BrandingRuntimeConfigPatch {
  appName?: string;
  htmlTitle?: string;
  tagline?: string;
  logoUrl?: string;
  faviconUrl?: string;
  backgroundUrl?: string | null;
  themeColors?: Partial<BrandingThemeColors>;
}

const DEFAULT_THEME_COLORS: BrandingThemeColors = {
  brand: "#894040",
  bgBase: "#1e1f22",
  bgFloat: "#232428",
  bgElevated: "#2b2d31",
  bgModifier: "#3f4147",
  textPrimary: "#ffffff",
  textBody: "#dcddde",
  textSecondary: "#b5bac1",
  textMuted: "#6d6f78",
};

const DEFAULT_CONFIG: BrandingRuntimeConfig = {
  appName: "Koster",
  htmlTitle: "Koster - Online Video Chat",
  tagline: "Fast. Secure. No downloads needed.",
  logoUrl: "/logo/logo-invisible.svg",
  faviconUrl: "/logo/logo-flat.svg",
  backgroundUrl: null,
  themeColors: DEFAULT_THEME_COLORS,
};

const THEME_KEYS: Array<keyof BrandingThemeColors> = [
  "brand",
  "bgBase",
  "bgFloat",
  "bgElevated",
  "bgModifier",
  "textPrimary",
  "textBody",
  "textSecondary",
  "textMuted",
];

let cached: BrandingRuntimeConfig = { ...DEFAULT_CONFIG };
let loaded = false;

function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return code === "42P01";
}

function isSafePathUrl(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !/\s/.test(value);
}

function isDataImageUrl(value: string): boolean {
  return /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function isAllowedAssetUrl(value: string): boolean {
  return isSafePathUrl(value);
}

function sanitizePersistedAsset(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (isDataImageUrl(trimmed)) return fallback;
  return trimmed;
}

function sanitizePersistedOptionalAsset(value: string | null): string | null {
  const trimmed = value?.trim() ? value.trim() : null;
  if (!trimmed) return null;
  if (isDataImageUrl(trimmed)) return null;
  return trimmed;
}

function normalizeNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

function normalizeThemeColors(input: Partial<BrandingThemeColors> | undefined): BrandingThemeColors {
  const merged: BrandingThemeColors = { ...DEFAULT_THEME_COLORS, ...(input ?? {}) };
  for (const key of THEME_KEYS) {
    const value = merged[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`themeColors.${key} is required`);
    }
    merged[key] = value.trim();
  }
  return merged;
}

function normalize(input: BrandingRuntimeConfig): BrandingRuntimeConfig {
  const appName = normalizeNonEmpty(input.appName, "appName");
  const htmlTitle = normalizeNonEmpty(input.htmlTitle, "htmlTitle");
  const tagline = input.tagline.trim();

  const logoUrl = normalizeNonEmpty(input.logoUrl, "logoUrl");
  if (!isAllowedAssetUrl(logoUrl)) throw new Error("logoUrl must be a safe absolute path URL");
  const faviconUrl = normalizeNonEmpty(input.faviconUrl, "faviconUrl");
  if (!isAllowedAssetUrl(faviconUrl)) throw new Error("faviconUrl must be a safe absolute path URL");

  const backgroundUrl = input.backgroundUrl?.trim() ? input.backgroundUrl.trim() : null;
  if (backgroundUrl && !isAllowedAssetUrl(backgroundUrl)) {
    throw new Error("backgroundUrl must be a safe absolute path URL");
  }

  return {
    appName,
    htmlTitle,
    tagline,
    logoUrl,
    faviconUrl,
    backgroundUrl,
    themeColors: normalizeThemeColors(input.themeColors),
  };
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;

  try {
    const row = await db
      .selectFrom("branding_settings")
      .selectAll()
      .where("id", "=", 1)
      .executeTakeFirst();

    if (row) {
      cached = normalize({
        appName: row.app_name,
        htmlTitle: row.html_title,
        tagline: row.tagline,
        logoUrl: sanitizePersistedAsset(row.logo_url, DEFAULT_CONFIG.logoUrl),
        faviconUrl: sanitizePersistedAsset(row.favicon_url, DEFAULT_CONFIG.faviconUrl),
        backgroundUrl: sanitizePersistedOptionalAsset(row.background_url),
        themeColors: row.theme_colors,
      });
      loaded = true;
      return;
    }

    const seed = normalize(DEFAULT_CONFIG);
    await db
      .insertInto("branding_settings")
      .values({
        id: 1,
        app_name: seed.appName,
        html_title: seed.htmlTitle,
        tagline: seed.tagline,
        logo_url: seed.logoUrl,
        favicon_url: seed.faviconUrl,
        background_url: seed.backgroundUrl,
        theme_colors: seed.themeColors,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
    cached = seed;
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    cached = normalize(DEFAULT_CONFIG);
  } finally {
    loaded = true;
  }
}

export async function getBrandingRuntimeConfig(): Promise<BrandingRuntimeConfig> {
  await ensureLoaded();
  return { ...cached, themeColors: { ...cached.themeColors } };
}

export async function updateBrandingRuntimeConfig(
  patch: BrandingRuntimeConfigPatch,
): Promise<BrandingRuntimeConfig> {
  await ensureLoaded();

  const next = normalize({
    ...cached,
    ...patch,
    themeColors: {
      ...cached.themeColors,
      ...(patch.themeColors ?? {}),
    },
  });

  try {
    await db
      .insertInto("branding_settings")
      .values({
        id: 1,
        app_name: next.appName,
        html_title: next.htmlTitle,
        tagline: next.tagline,
        logo_url: next.logoUrl,
        favicon_url: next.faviconUrl,
        background_url: next.backgroundUrl,
        theme_colors: next.themeColors,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          app_name: next.appName,
          html_title: next.htmlTitle,
          tagline: next.tagline,
          logo_url: next.logoUrl,
          favicon_url: next.faviconUrl,
          background_url: next.backgroundUrl,
          theme_colors: next.themeColors,
        }),
      )
      .execute();
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new Error("Branding settings table is missing. Apply DB migrations first.");
    }
    throw err;
  }

  cached = next;
  return { ...cached, themeColors: { ...cached.themeColors } };
}

export async function resetBrandingRuntimeConfig(): Promise<BrandingRuntimeConfig> {
  await ensureLoaded();

  const next = normalize({
    ...DEFAULT_CONFIG,
    themeColors: { ...DEFAULT_THEME_COLORS },
  });

  try {
    await db
      .insertInto("branding_settings")
      .values({
        id: 1,
        app_name: next.appName,
        html_title: next.htmlTitle,
        tagline: next.tagline,
        logo_url: next.logoUrl,
        favicon_url: next.faviconUrl,
        background_url: next.backgroundUrl,
        theme_colors: next.themeColors,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          app_name: next.appName,
          html_title: next.htmlTitle,
          tagline: next.tagline,
          logo_url: next.logoUrl,
          favicon_url: next.faviconUrl,
          background_url: next.backgroundUrl,
          theme_colors: next.themeColors,
        }),
      )
      .execute();
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new Error("Branding settings table is missing. Apply DB migrations first.");
    }
    throw err;
  }

  cached = next;
  return { ...cached, themeColors: { ...cached.themeColors } };
}
