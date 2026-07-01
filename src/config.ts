// Config is imported as a module so the deployed bundle bakes in defaults (§1.4).
// `@site-config` is aliased by Vite/Vitest to the SITE-selected sites/<slug>/config.json.
import base from '../config/config.json';
import site from '@site-config';
import { mergeAppConfig } from '@/lib/config-merge';
import type { AppConfig } from '@/types/data-files';

export const config: AppConfig = mergeAppConfig(base, site);
