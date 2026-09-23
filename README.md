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
| Hero animation | `src/components/SporePrint.astro` |
| Styles and colour tokens | `src/styles/global.css` |
| Deploy + daily rebuild | `.github/workflows/deploy.yml` |

## Design notes

- **Hero:** the underside of a mushroom cap, drawn as a circular waveform. The gills pulse on a 145 BPM kick.
  The animation pauses when it's off-screen or the tab is hidden, and it renders as a still image when the visitor has *reduce motion* set.
- **Type:** Anybody (a variable-width display face) runs from ultra-condensed to extra-wide.
  City names widen on hover. Geologica is used for text and Martian Mono for dates and labels. All fonts are self-hosted.
- **Colour:** dark spore-print brown, with bone-coloured text and blacklight violet, magenta and ember accents.
- **Covers:** until real cover art is uploaded, each release shows a generated spore-print disc.
