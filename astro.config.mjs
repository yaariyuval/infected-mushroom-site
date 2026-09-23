import { defineConfig } from 'astro/config';

// SITE_URL / BASE_PATH are set by the GitHub Pages workflow.
// With a custom domain BASE_PATH is empty; on <user>.github.io/<repo> it is "/<repo>".
export default defineConfig({
  site: process.env.SITE_URL || 'https://infected-mushroom.com',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
});
