// End-to-end checks for Making Food, run in headless Chromium with Playwright.
// Usage: node tests/e2e.cjs   (needs the `playwright` package; see README)
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function serve() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Reads the whole database straight from IndexedDB, photos as base64, for exact comparisons.
const dumpDB = page => page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('making-food');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const all = store => new Promise(resolve => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
  });
  const recipes = (await all('recipes')).sort((a, b) => a.id.localeCompare(b.id));
  const photos = (await all('photos'))
    .map(p => ({ id: p.id, type: p.type, data: window.bufferToBase64(p.data) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  db.close();
  return { recipes, photos };
});

const cardIds = page => page.$$eval('#grid .card', cards => cards.map(c => c.dataset.id));

const CHICKEN = [
  'bbq-chicken-potato-wedges', 'buffalo-chicken-bowl', 'chicken-burrito-bowl', 'chicken-caesar-salad-bowl',
  'chicken-fried-rice', 'chicken-shawarma-bowl', 'chicken-tikka-masala', 'chipotle-chicken-fajita-bowl',
  'coconut-curry-chicken', 'garlic-butter-chicken-asparagus', 'ginger-garlic-chicken-stir-fry', 'golden-turmeric-chicken-bowl',
  'greek-chicken-souvlaki-bowl', 'honey-garlic-teriyaki-chicken', 'jerk-chicken-coconut-rice', 'lemon-herb-chicken-sweet-potatoes',
  'mediterranean-chicken-sheet-pan', 'walnut-pesto-chicken-zucchini',
];
const BEEF = [
  'beef-barbacoa-bowl', 'beef-bolognese-spaghetti-squash', 'beef-bulgogi-bowl', 'beef-stroganoff-mashed-potatoes',
  'beef-taco-salad-bowl', 'burger-bowl-sweet-potato-fries', 'carne-asada-bowl', 'chipotle-beef-fajita-bowl',
  'classic-beef-stew', 'cottage-pie', 'ginger-beef-broccoli', 'greek-beef-bowl',
  'herb-steak-brussels-sprouts', 'korean-ground-beef-bowl', 'meatballs-mashed-potatoes-gravy', 'mongolian-beef',
  'philly-cheesesteak-bowl', 'steak-bites-potato-hash', 'steak-sweet-potato-chimichurri', 'thai-basil-beef',
  'turmeric-beef-sweet-potato-skillet',
];
const ORIGINAL = [
  'chicken-burrito-bowl', 'chicken-shawarma-bowl', 'chipotle-chicken-fajita-bowl', 'honey-garlic-teriyaki-chicken',
  'beef-bulgogi-bowl', 'chipotle-beef-fajita-bowl', 'greek-beef-bowl', 'meatballs-mashed-potatoes-gravy',
  'steak-bites-potato-hash', 'steak-sweet-potato-chimichurri', 'thai-basil-beef',
];
const DESSERT = [
  'almond-flour-chocolate-chip-cookies', 'chocolate-banana-nice-cream', 'cinnamon-baked-apples-walnuts', 'crustless-pumpkin-pie-custard-cups',
  'dark-chocolate-avocado-mousse', 'dark-chocolate-coconut-macaroons', 'fudgy-almond-flour-brownies', 'golden-milk-chia-pudding',
  'greek-yogurt-berry-bark', 'lemon-blueberry-almond-cake', 'mango-lime-sorbet', 'mixed-berry-almond-crumble',
  'no-bake-carrot-cake-bites', 'no-bake-strawberry-cheesecake-jars', 'vanilla-panna-cotta-berry-sauce',
];
const firstIngredient = page => page.textContent('#ingredientList li:first-child .ing-text');

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function newPage(browser, base, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base);
  await page.waitForSelector('#grid .card');
  return { context, page, errors };
}

async function openRecipe(page, id) {
  await page.click(`#grid .card[data-id="${id}"]`);
  await page.waitForSelector('#viewSheet.open');
}

async function closeRecipe(page) {
  await page.click('[data-action="close-view"]');
  await page.waitForSelector('#viewSheet:not(.open)', { state: 'attached' });
}

// A 2400x1800 JPEG so we can confirm the app shrinks photos to 1200px wide.
async function makeTestPhoto(page) {
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2400;
    c.height = 1800;
    const g = c.getContext('2d');
    g.fillStyle = '#d2691e';
    g.fillRect(0, 0, 2400, 1800);
    g.fillStyle = '#fff';
    g.fillRect(600, 450, 1200, 900);
    return c.toDataURL('image/jpeg', 0.95).split(',')[1];
  });
  return { name: 'meal.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') };
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'making-food-'));
  try {
    const { context, page, errors } = await newPage(browser, base);

    await check('seeds 18 chicken, 21 beef, and 15 dessert recipes; toggle filters', async () => {
      assert.deepEqual((await cardIds(page)).sort(), CHICKEN);
      await page.click('.top [data-cat="beef"]');
      assert.equal(await page.getAttribute('.top [data-cat="beef"]', 'aria-pressed'), 'true');
      assert.deepEqual((await cardIds(page)).sort(), BEEF);
      await page.click('.top [data-cat="dessert"]');
      assert.equal(await page.getAttribute('.top [data-cat="dessert"]', 'aria-pressed'), 'true');
      assert.deepEqual((await cardIds(page)).sort(), DESSERT);
      await page.click('.top [data-cat="chicken"]');
      assert.equal((await cardIds(page)).length, CHICKEN.length);
    });

    await check('starter recipes show their bundled photo, others a title tile, with the title above', async () => {
      for (const cat of ['chicken', 'beef', 'dessert']) {
        await page.click(`.top [data-cat="${cat}"]`);
        for (const id of await cardIds(page)) {
          const card = `#grid .card[data-id="${id}"]`;
          assert.equal(await page.$eval(card, el => el.firstElementChild.className), 'card-name');
          if (fs.existsSync(path.join(ROOT, 'photos', `${id}.jpg`))) {
            await page.waitForFunction(sel => document.querySelector(sel)?.naturalWidth >= 700, `${card} img`);
            assert.equal(await page.getAttribute(`${card} img`, 'src'), `photos/${id}.jpg`);
          } else {
            assert.ok(await page.isVisible(`${card} .tile`), `${id} should show a tile`);
          }
        }
      }
      await page.click('.top [data-cat="chicken"]');
    });

    await check('a new recipe without a photo shows a colored tile with its name', async () => {
      await page.click('#addBtn');
      await page.waitForSelector('#editSheet.open');
      assert.ok(await page.isVisible('#coverField .photo-placeholder'));
      await page.fill('#fTitle', 'Plain Beef Test');
      await page.click('#editForm .seg label:has(input[value="beef"]) span');
      await page.fill('#ingRows li:first-child .name', 'ground beef');
      await page.fill('#stepRows li:first-child .text', 'Cook it.');
      await page.click('#saveEdit');
      await page.waitForSelector('#editSheet:not(.open)', { state: 'attached' });
      await closeRecipe(page);
      assert.equal(await page.getAttribute('.top [data-cat="beef"]', 'aria-pressed'), 'true');
      assert.ok(await page.isVisible('#grid .card:has(.card-name:text-is("Plain Beef Test")) .tile'));
      await page.click('.top [data-cat="chicken"]');
    });

    await check('tapping a card opens that recipe', async () => {
      await page.click('.top [data-cat="beef"]');
      await openRecipe(page, 'thai-basil-beef');
      assert.equal(await page.textContent('#viewBody .title'), 'Thai Basil Beef');
      await closeRecipe(page);
      await page.click('.top [data-cat="chicken"]');
      await openRecipe(page, 'honey-garlic-teriyaki-chicken');
      assert.equal(await page.textContent('#viewBody .title'), 'Honey Garlic Teriyaki Chicken');
      await closeRecipe(page);
    });

    await check('servings stepper scales every amount', async () => {
      await openRecipe(page, 'chicken-shawarma-bowl');
      assert.equal(await page.textContent('#servingsOut'), '4');
      assert.equal(await firstIngredient(page), '3 lb boneless skinless chicken thighs');
      for (let i = 0; i < 4; i++) await page.click('[data-action="servings-up"]');
      assert.equal(await page.textContent('#servingsOut'), '8');
      const at8 = await page.$$eval('#ingredientList .ing-text', els => els.map(e => e.textContent));
      assert.equal(at8[0], '6 lb boneless skinless chicken thighs');
      assert.equal(at8[1], '½ cup extra virgin olive oil');
      assert.equal(at8[3], '12 cloves garlic, minced');
      assert.equal(at8[12], '4 cups jasmine rice, uncooked');
      for (let i = 0; i < 6; i++) await page.click('[data-action="servings-down"]');
      assert.equal(await page.textContent('#servingsOut'), '2');
      const at2 = await page.$$eval('#ingredientList .ing-text', els => els.map(e => e.textContent));
      assert.equal(at2[0], '1½ lb boneless skinless chicken thighs');
      assert.equal(at2[1], '⅛ cup extra virgin olive oil');
      assert.match(await page.textContent('#scaledNote'), /scaled from 4 servings/);
    });

    await check('ingredients check off', async () => {
      const item = '#ingredientList li:nth-child(2) .check';
      await page.click(item);
      assert.equal(await page.getAttribute(item, 'aria-checked'), 'true');
      await page.click(item);
      assert.equal(await page.getAttribute(item, 'aria-checked'), 'false');
      await closeRecipe(page);
    });

    await check('edits persist after reload, with version history and restore', async () => {
      await openRecipe(page, 'chicken-shawarma-bowl');
      await page.click('#editBtn');
      await page.waitForSelector('#editSheet.open');
      await page.fill('#fTitle', 'Shawarma Bowl, Extra Garlic');
      await page.fill('#ingRows li:first-child .amt', '3 1/2');
      await page.fill('#fNotes', 'Double the garlic sauce.');
      await page.click('[data-action="add-ingredient"]');
      await page.fill('#ingRows li:last-child .amt', '2');
      await page.fill('#ingRows li:last-child .unit', 'tbsp');
      await page.fill('#ingRows li:last-child .name', 'fresh mint, chopped');
      // Drag the last step to the top, holding near the top edge so the list auto-scrolls.
      const steps = await page.$$('#stepRows .row');
      const from = await steps[steps.length - 1].$('.drag');
      await from.scrollIntoViewIfNeeded();
      const a = await from.boundingBox();
      const top = (await page.$eval('#editScroll', el => el.getBoundingClientRect().top)) + 10;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2, top, { steps: 25 });
      await page.waitForFunction(() => document.querySelector('#editScroll').scrollTop === 0);
      await page.waitForTimeout(200);
      await page.mouse.up();
      assert.match(await page.inputValue('#stepRows .row:first-child .text'), /^Build bowls/);
      assert.equal(await page.textContent('#stepRows .row:first-child .num'), '1');
      await page.click('#saveEdit');
      await page.waitForSelector('#editSheet:not(.open)', { state: 'attached' });
      assert.equal(await page.textContent('#viewBody .title'), 'Shawarma Bowl, Extra Garlic');

      await page.reload();
      await page.waitForSelector('#grid .card');
      await openRecipe(page, 'chicken-shawarma-bowl');
      assert.equal(await page.textContent('#viewBody .title'), 'Shawarma Bowl, Extra Garlic');
      assert.equal(await firstIngredient(page), '3½ lb boneless skinless chicken thighs');
      assert.equal(await page.textContent('#ingredientList li:last-child .ing-text'), '2 tbsp fresh mint, chopped');
      assert.match(await page.textContent('#viewBody .steps li:first-child p'), /Build bowls/);
      assert.match(await page.textContent('#viewBody'), /Double the garlic sauce\./);

      let db = await dumpDB(page);
      let r = db.recipes.find(x => x.id === 'chicken-shawarma-bowl');
      assert.equal(r.versions.length, 1);
      assert.equal(r.versions[0].snapshot.title, 'Chicken Shawarma Bowl');
      assert.equal(r.ingredients[0].amount, 3.5);

      await page.click('#editBtn');
      await page.waitForSelector('#editSheet.open');
      await page.click('[data-action="restore-version"]');
      assert.equal(await page.inputValue('#fTitle'), 'Chicken Shawarma Bowl');
      await page.click('#saveEdit');
      await page.waitForSelector('#editSheet:not(.open)', { state: 'attached' });
      db = await dumpDB(page);
      r = db.recipes.find(x => x.id === 'chicken-shawarma-bowl');
      assert.equal(r.title, 'Chicken Shawarma Bowl');
      assert.equal(r.ingredients[0].amount, 3);
      assert.equal(r.versions.length, 2);
      assert.equal(r.versions[1].snapshot.title, 'Shawarma Bowl, Extra Garlic');
    });

    await check('saving with no changes does not add a version', async () => {
      await page.click('#editBtn');
      await page.waitForSelector('#editSheet.open');
      await page.click('#saveEdit');
      await page.waitForSelector('#editSheet:not(.open)', { state: 'attached' });
      const r = (await dumpDB(page)).recipes.find(x => x.id === 'chicken-shawarma-bowl');
      assert.equal(r.versions.length, 2);
    });

    await check('bad amounts are rejected instead of saved', async () => {
      await page.click('#editBtn');
      await page.waitForSelector('#editSheet.open');
      await page.fill('#ingRows li:first-child .amt', 'lots');
      await page.click('#saveEdit');
      assert.equal(await page.getAttribute('#ingRows li:first-child .amt', 'aria-invalid'), 'true');
      assert.ok(await page.isVisible('#editSheet.open'));
      await page.click('#cancelEdit');
      await page.waitForSelector('#editSheet:not(.open)', { state: 'attached' });
      const r = (await dumpDB(page)).recipes.find(x => x.id === 'chicken-shawarma-bowl');
      assert.equal(r.ingredients[0].amount, 3);
    });

    await check('"I made this" saves photo, rating, note, servings, and cover', async () => {
      await page.click('[data-action="servings-up"]');
      const chooser = page.waitForEvent('filechooser');
      await page.click('#madeBtn');
      await (await chooser).setFiles(await makeTestPhoto(page));
      await page.waitForSelector('#logSheet.open #logPhoto img');
      assert.equal(await page.inputValue('#logDate'), await page.evaluate(() => todayISO()));
      assert.equal(await page.textContent('#logServings'), '5');
      assert.ok(await page.isChecked('#logCover'));
      await page.click('[data-action="rate"][data-value="4"]');
      await page.fill('#logChange', 'More lemon, less cinnamon');
      await page.click('#saveLog');
      await page.waitForSelector('#logSheet:not(.open)', { state: 'attached' });

      const db = await dumpDB(page);
      const r = db.recipes.find(x => x.id === 'chicken-shawarma-bowl');
      assert.equal(r.cookLog.length, 1);
      const entry = r.cookLog[0];
      assert.equal(entry.rating, 4);
      assert.equal(entry.changeNextTime, 'More lemon, less cinnamon');
      assert.equal(entry.servingsMade, 5);
      assert.ok(entry.photoId);
      assert.equal(r.coverPhotoId, entry.photoId);
      const photo = db.photos.find(p => p.id === entry.photoId);
      assert.equal(photo.type, 'image/jpeg');
      const size = await page.evaluate(async b64 => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
        return [bitmap.width, bitmap.height];
      }, photo.data);
      assert.deepEqual(size, [1200, 900]);

      assert.match(await page.textContent('#viewBody .last-time'), /More lemon, less cinnamon/);
      assert.equal(await page.getAttribute('#viewBody .last-time .stars', 'aria-label'), '4 out of 5 stars');
      assert.equal(await page.$$eval('#viewBody .timeline .log-item', els => els.length), 1);
      await page.waitForFunction(() => document.querySelector('#viewBody .hero img')?.src.startsWith('blob:'));
      await closeRecipe(page);
      await page.waitForFunction(() => document.querySelector('#grid .card[data-id="chicken-shawarma-bowl"] img')?.naturalWidth === 1200);
    });

    await check('a cover photo can be set and removed from Edit before cooking', async () => {
      await page.click('.top [data-cat="beef"]');
      await openRecipe(page, 'thai-basil-beef');
      await page.click('#editBtn');
      await page.waitForSelector('#editSheet.open');
      const chooser = page.waitForEvent('filechooser');
      await page.click('#coverField [data-action="choose-cover"]');
      await (await chooser).setFiles(await makeTestPhoto(page));
      await page.waitForSelector('#coverField img[src^="blob:"]');
      await page.click('#saveEdit');
      await page.waitForSelector('#editSheet:not(.open)', { state: 'attached' });
      let db = await dumpDB(page);
      let r = db.recipes.find(x => x.id === 'thai-basil-beef');
      assert.ok(r.coverPhotoId);
      assert.equal(r.versions.length, 0);
      assert.ok(db.photos.some(p => p.id === r.coverPhotoId));
      await page.waitForFunction(() => document.querySelector('#viewBody .hero img')?.naturalWidth === 1200);
      await page.waitForFunction(() => document.querySelector('#grid .card[data-id="thai-basil-beef"] img')?.naturalWidth === 1200);

      await page.click('#editBtn');
      await page.waitForSelector('#editSheet.open');
      await page.click('#coverField [data-action="remove-cover"]');
      await page.click('#saveEdit');
      await page.waitForSelector('#editSheet:not(.open)', { state: 'attached' });
      const removedId = r.coverPhotoId;
      db = await dumpDB(page);
      r = db.recipes.find(x => x.id === 'thai-basil-beef');
      assert.equal(r.coverPhotoId, null);
      assert.ok(!db.photos.some(p => p.id === removedId));
      assert.equal(await page.getAttribute('#grid .card[data-id="thai-basil-beef"] img', 'src'), 'photos/thai-basil-beef.jpg');
      await closeRecipe(page);
      await page.click('.top [data-cat="chicken"]');
    });

    await check('dismissing the camera still opens the log form, and a rating is required', async () => {
      await openRecipe(page, 'chicken-burrito-bowl');
      const chooser = page.waitForEvent('filechooser');
      await page.click('#madeBtn');
      await chooser;
      await page.dispatchEvent('#cameraInput', 'cancel');
      await page.waitForSelector('#logSheet.open .photo-placeholder');
      assert.ok(await page.isHidden('#coverRow'));
      await page.click('#saveLog');
      assert.ok(await page.isVisible('#logSheet.open'));
      await page.click('[data-action="rate"][data-value="5"]');
      await page.click('#saveLog');
      await page.waitForSelector('#logSheet:not(.open)', { state: 'attached' });
      const r = (await dumpDB(page)).recipes.find(x => x.id === 'chicken-burrito-bowl');
      assert.equal(r.cookLog.length, 1);
      assert.equal(r.cookLog[0].photoId, null);
      assert.equal(r.coverPhotoId, null);
      await closeRecipe(page);
    });

    await check('export then import into a fresh phone round-trips all data', async () => {
      const before = await dumpDB(page);
      assert.equal(before.photos.length, 1);
      await page.click('#menuBtn');
      const actions = await page.$$eval('#actionList button', els => els.map(e => e.textContent));
      assert.deepEqual(actions, ['Export backup', 'Import backup']);
      const download = page.waitForEvent('download');
      await page.click('#actionList [data-id="export"]');
      const file = path.join(tmp, (await download).suggestedFilename());
      await (await download).saveAs(file);
      assert.match(path.basename(file), /^making-food-backup-\d{4}-\d{2}-\d{2}\.json$/);

      const fresh = await newPage(browser, base);
      assert.equal((await dumpDB(fresh.page)).photos.length, 0);
      await fresh.page.click('#menuBtn');
      const chooser = fresh.page.waitForEvent('filechooser');
      await fresh.page.click('#actionList [data-id="import"]');
      await (await chooser).setFiles(file);
      await fresh.page.waitForFunction(() => document.querySelector('#toast').textContent === 'Backup imported');
      assert.deepEqual(await dumpDB(fresh.page), before);
      await fresh.page.waitForFunction(() => document.querySelector('#grid .card[data-id="chicken-shawarma-bowl"] img')?.naturalWidth === 1200);
      await fresh.page.reload();
      await fresh.page.waitForSelector('#grid .card');
      assert.deepEqual(await dumpDB(fresh.page), before);
      assert.deepEqual(fresh.errors, []);
      await fresh.context.close();
    });

    await check('importing a file that is not a backup changes nothing', async () => {
      const before = await dumpDB(page);
      const bad = path.join(tmp, 'bad.json');
      fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));
      await page.click('#menuBtn');
      const chooser = page.waitForEvent('filechooser');
      await page.click('#actionList [data-id="import"]');
      await (await chooser).setFiles(bad);
      await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Could not import'));
      assert.deepEqual(await dumpDB(page), before);
    });

    await check('works offline after the first visit', async () => {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForSelector('#grid .card');
      await context.setOffline(true);
      await page.reload();
      await page.waitForSelector('#grid .card');
      assert.equal((await cardIds(page)).length, CHICKEN.length);
      await page.waitForFunction(() => document.querySelector('#grid .card[data-id="chicken-burrito-bowl"] img')?.naturalWidth > 0);
      await context.setOffline(false);
    });

    await check('no errors in the console', async () => {
      assert.deepEqual(errors, []);
    });
    await context.close();

    await check('an install from before the new recipes gets them, without reviving deleted ones', async () => {
      const old = await newPage(browser, base);
      // Recreate an original install: only the first 11 recipes, one of them deleted, and no seedVersion yet.
      await old.page.evaluate(async ([newIds]) => {
        const db = await new Promise(resolve => { const req = indexedDB.open('making-food'); req.onsuccess = () => resolve(req.result); });
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['recipes', 'meta'], 'readwrite');
          [...newIds, 'greek-beef-bowl'].forEach(id => tx.objectStore('recipes').delete(id));
          tx.objectStore('meta').delete('seedVersion');
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
        db.close();
      }, [[...CHICKEN, ...BEEF, ...DESSERT].filter(id => !ORIGINAL.includes(id))]);
      await old.page.reload();
      await old.page.waitForSelector('#grid .card');
      const ids = (await dumpDB(old.page)).recipes.map(r => r.id).sort();
      assert.deepEqual(ids, [...CHICKEN, ...BEEF, ...DESSERT].filter(id => id !== 'greek-beef-bowl').sort());
      await old.page.reload();
      await old.page.waitForSelector('#grid .card');
      assert.equal((await dumpDB(old.page)).recipes.length, ids.length);
      assert.deepEqual(old.errors, []);
      await old.context.close();
    });

    // Timers use a fake clock so a 5-minute countdown can be checked in milliseconds.
    const timerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const timerPage = await timerCtx.newPage();
    await timerPage.clock.install();
    await timerPage.goto(base);
    await timerPage.waitForSelector('#grid .card');
    await check('step timers count down, pause, and finish', async () => {
      await openRecipe(timerPage, 'chicken-shawarma-bowl');
      const timer = '#viewBody .steps li:nth-child(5) .timer';
      assert.match(await timerPage.textContent(`${timer} .timer-btn`), /Start 5:00/);
      await timerPage.click(`${timer} .timer-btn`);
      await timerPage.clock.runFor(61_000);
      assert.equal(await timerPage.textContent(`${timer} .timer-btn`), '3:59');
      await timerPage.click(`${timer} .timer-btn`);
      await timerPage.clock.runFor(30_000);
      assert.equal(await timerPage.textContent(`${timer} .timer-btn`), '3:59 paused');
      await timerPage.click(`${timer} .timer-btn`);
      await timerPage.clock.runFor(240_000);
      assert.equal(await timerPage.textContent(`${timer} .timer-btn`), 'Done');
      assert.match(await timerPage.textContent('#toast'), /Timer done: Chicken Shawarma Bowl, step 5/);
      await timerPage.click(`${timer} .timer-reset`);
      assert.match(await timerPage.textContent(`${timer} .timer-btn`), /Start 5:00/);
    });
    await timerCtx.close();

    console.log(`\n${passed} checks passed`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
