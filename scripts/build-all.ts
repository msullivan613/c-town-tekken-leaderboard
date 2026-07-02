// Multi-site build (§1.5). Discovers every sites/<slug>/ folder, runs a Vite build
// per site into dist/<slug>/, and writes a root dist/index.html that links to them.
// Typecheck (tsc --noEmit) runs once in the npm `build` script before this.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SITES_DIR = resolve(REPO_ROOT, 'sites');
const REPO = process.env.PAGES_REPO ?? 'tekken-leaderboard';

function listSites(): string[] {
  return readdirSync(SITES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function siteName(slug: string): string {
  const cfg = JSON.parse(
    readFileSync(resolve(SITES_DIR, slug, 'config.json'), 'utf8'),
  ) as { site: { name: string; description: string } };
  return cfg.site.name;
}

function landingHtml(sites: string[]): string {
  const links = sites
    .map((slug) => `      <li><a href="./${slug}/">${siteName(slug)}</a></li>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <title>Tekken Leaderboards</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; }
      li { margin: 0.5rem 0; font-size: 1.25rem; }
    </style>
  </head>
  <body>
    <h1>Tekken Leaderboards</h1>
    <ul>
${links}
    </ul>
  </body>
</html>
`;
}

const sites = listSites();
if (sites.length === 0) throw new Error('No sites found under sites/');

for (const slug of sites) {
  console.log(`\n[build-all] building ${slug}…`);
  execFileSync('npx', ['vite', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, SITE: slug, PAGES_REPO: REPO },
  });
}

mkdirSync(resolve(REPO_ROOT, 'dist'), { recursive: true });
writeFileSync(resolve(REPO_ROOT, 'dist', 'index.html'), landingHtml(sites));
// The landing page lives at the dist root (not under a site), so give it its own
// copy of the shared favicon that public/ only copies into each dist/<slug>/.
copyFileSync(
  resolve(REPO_ROOT, 'public', 'favicon.svg'),
  resolve(REPO_ROOT, 'dist', 'favicon.svg'),
);
console.log(`\n[build-all] done: ${sites.join(', ')} + landing page`);
