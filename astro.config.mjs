// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL is used for canonical links and social previews.
// Set it in docker-compose.yml (or your shell) to the address the site is served from.
export default defineConfig({
  site: process.env.SITE_URL || 'https://www.osterbergdesign.site',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // The editor builds in a scratch folder; this keeps optimised images cached between builds.
  cacheDir: process.env.ASTRO_CACHE_DIR || './node_modules/.astro',
  // The editor shows the dev server as its live preview, without Astro's toolbar.
  devToolbar: { enabled: false },
  // Don't let the preview react to the editor's scratch build folder.
  vite: { server: { watch: { ignored: ['**/.build/**'] } } },
});
