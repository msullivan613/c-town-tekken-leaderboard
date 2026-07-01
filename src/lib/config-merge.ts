// Per-site config layering (§1.4). The shared config/config.json holds defaults;
// each sites/<slug>/config.json supplies the `site` block plus any overrides.
// The merged object is what satisfies AppConfig — neither input does on its own.
import type { AppConfig } from '@/types/data-files';

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge `override` onto `base` (override wins; arrays replace, not concat). */
function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override ?? base;
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out;
}

/** Merge shared defaults with a site's config into a complete AppConfig. */
export function mergeAppConfig(base: unknown, site: unknown): AppConfig {
  return deepMerge(base, site) as AppConfig;
}
