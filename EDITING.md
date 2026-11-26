# Editing your site from Figma

Your site: **https://le-beaver.github.io/seoyoungkong-art/** (later: your own domain).
Your Figma file: **https://www.figma.com/design/jTcylE29HWPZX0raAYuQmM** (“Seoyoung Site”).
It costs nothing to run. The only bill is your domain.

How it works: Figma holds an editable copy of every page. Keep the **Seoyoung Site Sync** plugin window open while you edit. About 20 seconds after you stop editing, it sends your changes to GitHub, and the site updates about 2 minutes later. With the plugin closed, nothing is sent; open it and press **Publish my edits now**.

---

## One-time setup (done, except the publish key)

1. ✅ The Figma file **Seoyoung Site** has a “Site · …” page for each page of the website.
2. ✅ The **Seoyoung Site Sync** plugin is installed in your Figma desktop app (**Plugins → Development → Seoyoung Site Sync**).
3. **GitHub publish key.** This lets the plugin send your edits to the website.
   1. Go to https://github.com/settings/personal-access-tokens/new
   2. **Token name:** `figma-publish`. **Expiration:** choose the longest option offered, or *No expiration* if you see it.
   3. **Repository access:** *Only select repositories* → `seoyoungkong-art`.
   4. **Permissions → Repository permissions → Contents:** *Read and write*.
   5. Click **Generate token**, copy it, and paste it into the plugin's **GitHub publish key** box. It's stored only in your Figma app.

No Figma API key is needed. On Figma's free plan, reading a file through Figma's API is limited to a few times a month, so the plugin sends your edits instead.

### Renew the publish key
When the key expires, the plugin tells you: *“Your GitHub publish key has expired”*. Repeat step 3 above and paste the new key into the same box. Nothing else needs to change, and your Figma pages stay as they are.

## Everyday editing

Make all changes inside the **Site · …** pages, directly inside a **Section** frame.

| You want to… | Do this in Figma |
|---|---|
| Change words | Double-click a text layer and type. Colors, bold (Space Grotesk Bold) and links (select text → link icon) carry over. |
| Make a heading or body text bigger or smaller | Change the font size. The site snaps it to the closest of its 7 sizes (4 heading sizes, and large, normal and small body text). |
| Swap a photo | Select the image → in Fill, click the image thumbnail → **Choose image**. |
| Add a photo | Drag an image file into a Section frame, as a direct child of the frame. |
| Add text | Use the Text tool inside a Section frame. |
| Move or resize something | Drag it. Positions snap to the site's 24-column grid. |
| Delete something | Delete the layer. |
| Change a button | Edit its label, and its link on the label text. |
| Replace a video or embed | Edit the **Link** text inside it to a new YouTube / Canva / Google link. |
| See it live | Keep the plugin open (auto-publish), or press **Publish my edits now**. Live in ~2 minutes. |

### Good to know
- **Phone layout.** Figma shows the desktop layout. Phones keep their own arrangement. New items you add are stacked at the bottom of their section on phones.
- **Not editable from Figma.** The header and menu, section background colors, new pages, and the auto-fit size of big words like “Hello!”. Ask Claude (or edit `content/site.json`) for these.
- **Safety net.** If a page suddenly loses most of its layers in Figma, for example from a bad paste, the robot refuses to apply it and the live page stays as it was.
- **Rebuild** replaces the Site · pages with what's live now. Publish your edits before you press it.
- **History.** Every change is saved as a commit on GitHub, so anything can be undone.

## Connecting seoyoungkong.art later
1. In the repo on GitHub: **Settings** → **Pages** → **Custom domain** → type `www.seoyoungkong.art` → **Save**.
2. At your domain registrar, add these DNS records:
   - `CNAME` for `www` → `le-beaver.github.io`
   - `A` records for the bare domain `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
3. Run:
   ```bash
   gh variable set CUSTOM_DOMAIN --repo le-beaver/seoyoungkong-art --body "www.seoyoungkong.art"
   ```
   Then re-run the **Deploy site** action on GitHub, or ask Claude to.
4. Once GitHub shows the certificate, tick **Enforce HTTPS**.
5. Optional: update the address in the plugin's **Website address** box.
