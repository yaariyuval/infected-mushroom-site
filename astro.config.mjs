import { defineConfig } from 'astro/config';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

// The hero's 3D code arrives through a dynamic import, which the browser only finds once the hero's script has
// loaded and run. Announce it in the page's head instead, so it downloads alongside the CSS.
const preloadGrove = {
  name: 'preload-grove',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const chunk = readdirSync(new URL('_astro/', dir)).find((f) => /^grove\..+\.js$/.test(f));
      const page = new URL('index.html', dir);
      const html = readFileSync(page, 'utf8');
      const prefix = html.match(/href="([^"]*)_astro\//)?.[1];
      if (!chunk || prefix === undefined) return;
      writeFileSync(page, html.replace('</head>', `<link rel="modulepreload" href="${prefix}_astro/${chunk}" crossorigin></head>`));
    },
  },
};

// SITE_URL / BASE_PATH are set by the GitHub Pages workflow.
// With a custom domain BASE_PATH is empty; on <user>.github.io/<repo> it is "/<repo>".
export default defineConfig({
  site: process.env.SITE_URL || 'https://infected-mushroom.com',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
  // the 3D hero (three.js) is one lazy-loaded chunk by design
  vite: { build: { chunkSizeWarningLimit: 700 } },
  integrations: [preloadGrove],
});
