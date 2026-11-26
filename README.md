# seoyoungkong.art

Portfolio of Seoyoung (Elly) Kong, rebuilt from the Squarespace site as a free static site and edited from Figma.

- **Editing guide:** [EDITING.md](EDITING.md)
- **Live:** https://le-beaver.github.io/seoyoungkong-art/

## How it fits together
- `content/site.json` holds every page, section and block (text, image, video, embed, shape, button). It's the single source of content.
- `scripts/build.mjs` turns site.json into static HTML in `dist/`, using the same grid, themes and type scale as Squarespace (`src/styles.css`).
- `figma-plugin/` is a development plugin that builds editable "Site · …" pages in Figma from the live `content.json`.
- The plugin's Publish (manual, or automatic while it's open) commits `figma-inbox/export.json` plus any new images through the GitHub API. Figma's free plan rate-limits file reads to a few a month, so the site doesn't poll Figma.
- `scripts/figma-sync.mjs` turns that export into changes in site.json and `public/media`.
- `.github/workflows/figma-sync.yml` runs the sync and deploys. `deploy.yml` deploys on every other push.
- `scripts/import-squarespace.mjs` and `scripts/fetch-videos.mjs` handled the one-time import from the Squarespace backup.

## Commands
```bash
npm run dev          # build + serve on http://localhost:5302
npm run plugin       # regenerate figma-plugin/ui.html after editing src/richtext.cjs or the template
node test/sync.test.mjs   # offline test of the Figma sync
```
