// Runtime config loader for the pipelines (§1.4). The frontend imports config as
// a module; the pipelines read it from disk so a cron run picks up edits.
// SITE (env, default 'c-town') selects which sites/<slug>/ folder to operate on.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mergeAppConfig } from '@/lib/config-merge';
import type { AppConfig } from '@/types/data-files';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');

export const SITE = process.env.SITE ?? 'c-town';
export const SITE_DIR = resolve(REPO_ROOT, 'sites', SITE);
export const DATA_DIR = resolve(SITE_DIR, 'data');

export function loadConfig(): AppConfig {
  const base = JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'config', 'config.json'), 'utf8'),
  );
  const site = JSON.parse(readFileSync(resolve(SITE_DIR, 'config.json'), 'utf8'));
  return mergeAppConfig(base, site);
}
