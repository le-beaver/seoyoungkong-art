# Editing your site from Figma

Your site: **https://le-beaver.github.io/seoyoungkong-art/** (later: your own domain).
It costs nothing to run. The only bill is your domain.

How it works: Figma holds an editable copy of every page. When you save in Figma, a free GitHub robot checks the file every 10 minutes, copies your changes into the site, and publishes them. Press **Publish my edits now** in the plugin to skip the wait (it takes about 2 minutes).

---

## One-time setup (about 10 minutes)

### 1. Make a Figma access key
1. In Figma, click your avatar (top-left) → **Settings** → **Security** → **Personal access tokens** → **Generate new token**.
2. Name it `website`. Under scopes, set **File content** to **Read-only**. Leave everything else as **No access**.
3. Copy the token. Figma shows it only once.

### 2. Give the key to GitHub
In Terminal, run the command below and paste the token when it asks:
```bash
gh secret set FIGMA_TOKEN --repo le-beaver/seoyoungkong-art
```

### 3. Tell GitHub which Figma file to read
Open the Figma file you want to edit the site in, and copy its link. It looks like `figma.com/design/AbC123xyz/...`. The `AbC123xyz` part is the file key. Then run:
```bash
gh variable set FIGMA_FILE_KEY --repo le-beaver/seoyoungkong-art --body "AbC123xyz"
```

### 4. Install the plugin (Figma desktop app)
1. Download this repo's `figma-plugin` folder. It's already on your Mac at `~/Developer/seoyoungkong-art/figma-plugin`.
2. In the Figma **desktop app**, open your file and go to **Plugins** → **Development** → **Import plugin from manifest…**, then pick `figma-plugin/manifest.json`.
3. Run it: **Plugins** → **Development** → **Seoyoung Site Sync**.
4. Click **Rebuild Figma pages from the live site**. You'll get one Figma page per website page, named **Site · Home**, **Site · AD Work**, and so on, plus **Site · Footer (all pages)**.

### 5. (Optional) Turn on the Publish button
1. On GitHub: **Settings** → **Developer settings** → **Fine-grained tokens** → **Generate new token**.
2. For **Repository access**, choose **Only select repositories** → `seoyoungkong-art`. Under permissions, set **Actions** to **Read and write**.
3. Paste the token into the plugin's **GitHub publish key** box. It's stored only in your Figma app.

---

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
| See it live | Save, then wait up to 10 minutes or press **Publish my edits now**. |

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
