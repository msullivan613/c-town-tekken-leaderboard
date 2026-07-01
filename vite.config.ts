import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { createReadStream } from 'node:fs';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Which group (sites/<slug>/) this build targets, and the GitHub Pages repo the
// sites are served under. base is /<repo>/<site>/ so asset + data URLs resolve
// under the Pages sub-path (§1.5); data is fetched via import.meta.env.BASE_URL.
const SITE = process.env.SITE ?? 'c-town';
const REPO = process.env.PAGES_REPO ?? 'c-town-tekken-leaderboard';

const siteDir = fileURLToPath(new URL(`./sites/${SITE}`, import.meta.url));
const siteConfig = JSON.parse(
  readFileSync(resolve(siteDir, 'config.json'), 'utf8'),
) as { site: { name: string; description: string } };

// Fill the %SITE_NAME% / %SITE_DESC% placeholders in index.html with this site's
// branding, and copy the site's data/ into the build output (public/ is shared).
function sitePlugin(): Plugin {
  return {
    name: 'site-branding',
    transformIndexHtml(html) {
      return html
        .replaceAll('%SITE_NAME%', siteConfig.site.name)
        .replaceAll('%SITE_DESC%', siteConfig.site.description);
    },
    closeBundle() {
      const src = resolve(siteDir, 'data');
      if (existsSync(src)) {
        cpSync(src, resolve(`dist/${SITE}`, 'data'), { recursive: true });
      }
    },
    // The dev server has no publicDir copy of the data, so serve any `.../data/<file>`
    // request straight from sites/<SITE>/data.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/\/data\/([\w.-]+)$/)?.[1];
        const file = name && resolve(siteDir, 'data', name);
        if (file && existsSync(file)) {
          res.setHeader('Content-Type', 'application/json');
          createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: `/${REPO}/${SITE}/`,
  build: { outDir: `dist/${SITE}` },
  plugins: [react(), sitePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@site-config': resolve(siteDir, 'config.json'),
    },
  },
});
