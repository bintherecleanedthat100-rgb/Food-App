# Making Food

A personal recipe app for iPhone. It is one screen with a Chicken and Beef toggle, recipe cards, a cook log with photos, and step timers. It runs as a home-screen web app (PWA). There is no App Store, no account, and no server. Everything is stored on the phone.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles, logic, and the seed recipes |
| `sw.js` | Service worker that caches the app so it works offline |
| `manifest.webmanifest` | Name, icons, and full-screen settings for "Add to Home Screen" |
| `icons/` | App icons |
| `tests/e2e.cjs` | End-to-end checks run in headless Chromium |

## Putting it on your iPhone

Service workers only run over HTTPS, so the folder needs to be hosted on any static HTTPS host. Some options:

- **GitHub Pages**: Settings → Pages → deploy from the `main` branch. On a free plan, Pages only works for public repositories. The recipes themselves are never uploaded anywhere, so a public repo exposes only the app code and the seed recipes.
- **Netlify or Cloudflare Pages**: drag the folder in, or connect the repo.

Then on the iPhone, open the URL in **Safari**, tap **Share → Add to Home Screen**, and launch it from the icon.

## Where your data lives

- Recipes, cook log entries, and photos are stored in IndexedDB on the phone. Photos are shrunk to 1200 px wide JPEGs before saving.
- A home-screen app has its own storage, separate from Safari. Recipes added in Safari will not appear in the installed app, and the reverse is also true.
- If you delete the app from the home screen, iOS deletes its data too. Use **... → Export backup** now and then. On iPhone this opens the share sheet, where **Save to Files** keeps a copy.
- **Import backup** replaces everything in the app with the backup's contents, after asking you to confirm.

## Updating the app

The service worker serves the cached copy first, then fetches the new version in the background. After you deploy a change, it shows up the second time you open the app. When you change any file, bump `CACHE` in `sw.js` (for example `making-food-v2`) so old files are cleared.

## Timers

Step timers keep counting correctly if you leave the app. While a timer runs, the app asks iOS to keep the screen awake. iOS does not let a web app play a sound or alert while the phone is locked or the app is in the background, so the "done" beep plays only while the app is open.

## Running the tests

The tests need Node.js and Playwright:

```sh
npm install -g playwright
npx playwright install chromium
NODE_PATH="$(npm root -g)" node tests/e2e.cjs
```

They cover:

- The Chicken/Beef toggle
- Opening the right recipe from a card
- Servings scaling
- The ingredient checklist
- Edits persisting after a reload
- Version history and restore
- Drag-to-reorder
- Rejecting bad amounts
- The camera and cook-log flow, including 1200 px compression and the cover photo
- Export/import round trips
- Offline loading
- Step timers
