# infected-mushroom.com

A static site for Infected Mushroom: tour dates, the latest release, discography and links.
It's built with [Astro](https://astro.build), edited with [Pages CMS](https://pagescms.org), and hosted on GitHub Pages.

- No server, database or plugins, so there's nothing to patch or hack. The whole site is about 400 KB.
- Past shows drop off automatically. The site rebuilds every morning, and a small script hides shows that end between rebuilds.
- Each show is published with `MusicEvent` structured data, so Google can list it in event search.

## Editing the site (for the band / management)

1. Go to **https://app.pagescms.org** and sign in with GitHub.
2. Pick this repository.
3. Use the sidebar:
   - **Tour dates**: *Add an entry*, fill in date, city, country, venue and ticket link, then *Save*.
     For a festival that runs several days, also set *Last day*.
     To mark a show *Sold out*, *Cancelled* or *Postponed*, use *Status*. The ticket button changes to match.
   - **Music**: add releases and upload cover art. Tick *Feature on the homepage* on the one to feature, with its tracklist and listen link.
   - **Site settings**: bio, merch/fan-ticket/plugin links, booking email, social links, and an optional YouTube video.
     Leaving a field empty hides it.
4. Saving commits to GitHub, and the live site updates about a minute later.

To add an editor, invite their GitHub account as a collaborator on the repo (*Settings → Collaborators*).
They don't need to know anything about Git.

## One-time setup

1. Push this folder to a GitHub repo, for example `infected-mushroom/website`.
2. In the repo, go to *Settings → Pages → Build and deployment* and set *Source* to **GitHub Actions**.
   The first push deploys to `https://<owner>.github.io/<repo>/`. The base path is picked up automatically.
3. Custom domain: in *Settings → Pages → Custom domain*, enter `infected-mushroom.com`. Then at the DNS provider:
   - apex `A` records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `www` `CNAME` → `<owner>.github.io`

   Once DNS resolves, tick *Enforce HTTPS*.
4. Pages CMS: sign in at app.pagescms.org and install its GitHub app on the repo when asked.
   The CMS is configured in [`.pages.yml`](.pages.yml).

## Developing

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
```

| What | Where |
| --- | --- |
| Tour dates (one file per show) | `src/content/shows/*.md` |
| Releases | `src/content/releases/*.md` |
| Links, bio, settings | `src/data/site.json` |
| Uploaded images | `public/media/` |
| Page | `src/pages/index.astro` |
| Hero 3D scene | `src/scripts/grove.ts` (loader: `src/components/MushroomScene.astro`) |
| Styles and colour tokens | `src/styles/global.css` |
| Deploy + daily rebuild | `.github/workflows/deploy.yml` |

## Design notes

- **Hero:** a real-time 3D night grove, written with [three.js](https://threejs.org) in `src/scripts/grove.ts`. It draws on the band's Monstercat-era covers:
  - Giant Amanita-style mushrooms with sculpted, lumpy caps, raised warts, a hanging skirt and about 150 glowing gill plates each.
  - Clusters of bioluminescent mushrooms that ripple with light.
  - A violet sky with a ringed planet, a crescent moon, shooting stars, a flying saucer with a tractor beam, and drifting spores.
  - The glow pulses on a 145 BPM kick.
- **Performance:**
  - The 3D code is about 150 KB gzipped and loads only after the page is interactive. Until then, and on devices without WebGL, the hero shows a gradient.
  - Rendering resolution adapts to how fast frames draw.
  - The scene pauses when off-screen or in a background tab, and renders one still frame for visitors with *reduce motion* set.
- **Logo:** the hero wordmark (`src/components/Wordmark.astro`) and the header emblem and favicon (`src/components/Emblem.astro`) are vector traces of the band's own logo, used with their permission.
- **Type:** Tektur is the display face. It's a blocky, chamfered variable font picked to match the wordmark, and city names widen on hover. Geologica is used for text and Martian Mono for dates and labels. All fonts are self-hosted.
- **Colour:** indigo night, moonlight text, and bioluminescent cyan and magenta, taken from the IM30, IM25 and Head of NASA covers.
- **Covers** live in `public/media/covers/` and can be replaced from the CMS.
