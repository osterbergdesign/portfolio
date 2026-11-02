// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL is used for canonical links and social previews.
// Set it in docker-compose.yml (or your shell) to the address the site is served from.
export default defineConfig({
  site: process.env.SITE_URL || 'https://www.osterbergdesign.site',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
