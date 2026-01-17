# Static Articles Archive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a static archive of dev.to articles with local JSON data and a sync script.

**Architecture:** Extend `<dev-to>` component with `baseurl` attribute for local data fetching. Sync script pulls from dev.to API and stores as local JSON files. Single-page HTML displays articles.

**Tech Stack:** Vanilla JavaScript, Node.js (native fetch), Web Components

---

## Task 1: Add `baseurl` to observed attributes

**Files:**
- Modify: `/Users/madsstoumann/Dropbox/Projects/browser-style/ui/dev-to/index.js:18`

**Step 1: Add baseurl to observedAttributes array**

Change line 18 from:
```javascript
static observedAttributes = ['author', 'article', 'theme', 'itemsperpage', 'lang', 'i18n'];
```

To:
```javascript
static observedAttributes = ['author', 'article', 'theme', 'itemsperpage', 'lang', 'i18n', 'baseurl'];
```

**Step 2: Verify syntax**

Open the file and confirm no syntax errors.

---

## Task 2: Update ENDPOINTS to accept baseUrl parameter

**Files:**
- Modify: `/Users/madsstoumann/Dropbox/Projects/browser-style/ui/dev-to/index.js:5-9`

**Step 1: Modify ENDPOINTS configuration**

Change lines 5-9 from:
```javascript
ENDPOINTS: {
	USER_ARTICLES: (username, page, perPage) =>
		`https://dev.to/api/articles?username=${username}&page=${page}&per_page=${perPage}`,
	SINGLE_ARTICLE: (id) => `https://dev.to/api/articles/${id}`
},
```

To:
```javascript
ENDPOINTS: {
	USER_ARTICLES: (username, page, perPage, baseUrl) =>
		baseUrl
			? `${baseUrl}/articles.json`
			: `https://dev.to/api/articles?username=${username}&page=${page}&per_page=${perPage}`,
	SINGLE_ARTICLE: (id, baseUrl) =>
		baseUrl
			? `${baseUrl}/articles/${id}.json`
			: `https://dev.to/api/articles/${id}`
},
```

---

## Task 3: Update #fetchArticles to use baseurl

**Files:**
- Modify: `/Users/madsstoumann/Dropbox/Projects/browser-style/ui/dev-to/index.js:144-174`

**Step 1: Modify #fetchArticles method**

Replace the entire `#fetchArticles` method (lines 144-174) with:

```javascript
async #fetchArticles(author) {
	const baseUrl = this.getAttribute('baseurl');
	try {
		const response = await fetch(
			DevTo.CONFIG.ENDPOINTS.USER_ARTICLES(author, this.#currentPage, this.itemsPerPage, baseUrl),
			{ signal: this.#abortController.signal }
		);
		let articles = await response.json();

		// When using baseurl, handle client-side pagination
		if (baseUrl) {
			this.#articles = articles;
			const start = (this.#currentPage - 1) * this.itemsPerPage;
			const end = start + this.itemsPerPage;
			articles = this.#articles.slice(start, end);
		} else {
			this.#articles = this.#currentPage === 1 ? articles : [...this.#articles, ...articles];
		}

		this.renderArticlesList(articles, this.#currentPage === 1);

		const moreButton = this.#root.querySelector('[part~="more"]');
		const hasMore = baseUrl
			? (this.#currentPage * this.itemsPerPage) < this.#articles.length
			: articles.length >= this.itemsPerPage;

		if (hasMore) {
			if (!moreButton) {
				const btn = document.createElement('button');
				btn.part = 'more';
				btn.innerHTML = this.t('more');
				btn.addEventListener('click', async () => {
					btn.disabled = true;
					this.#currentPage++;
					await this.#fetchArticles(author);
				});
				this.#root.appendChild(btn);
			}
			moreButton?.removeAttribute('disabled');
		} else {
			moreButton?.remove();
		}
	} catch (error) {
		if (error.name !== 'AbortError') console.error('Error fetching articles:', error);
	}
}
```

---

## Task 4: Update #fetchArticle to use baseurl

**Files:**
- Modify: `/Users/madsstoumann/Dropbox/Projects/browser-style/ui/dev-to/index.js:176-187`

**Step 1: Modify #fetchArticle method**

Replace the `#fetchArticle` method with:

```javascript
async #fetchArticle(id) {
	const baseUrl = this.getAttribute('baseurl');
	try {
		const response = await fetch(
			DevTo.CONFIG.ENDPOINTS.SINGLE_ARTICLE(id, baseUrl),
			{ signal: this.#abortController.signal }
		);
		const article = await response.json();
		this.renderArticle(article);
	} catch (error) {
		if (error.name !== 'AbortError') console.error('Error fetching article:', error);
	}
}
```

---

## Task 5: Commit component changes

**Step 1: Commit in browser-style repo**

```bash
cd /Users/madsstoumann/Dropbox/Projects/browser-style
git add ui/dev-to/index.js
git commit -m "feat(dev-to): add baseurl attribute for local data fetching"
```

---

## Task 6: Create sync.js script

**Files:**
- Create: `/Users/madsstoumann/Library/CloudStorage/Dropbox/Projects/articles/sync.js`

**Step 1: Create the sync script**

```javascript
#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const ARTICLES_DIR = join(DATA_DIR, 'articles');
const ARTICLES_JSON = join(DATA_DIR, 'articles.json');

const USERNAME = 'madsstoumann';
const PER_PAGE = 30;
const DELAY_MS = 300;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAllArticles() {
	const articles = [];
	let page = 1;

	while (true) {
		console.log(`Fetching page ${page}...`);
		const response = await fetch(
			`https://dev.to/api/articles?username=${USERNAME}&page=${page}&per_page=${PER_PAGE}`
		);
		const batch = await response.json();

		if (batch.length === 0) break;
		articles.push(...batch);

		if (batch.length < PER_PAGE) break;
		page++;
		await delay(DELAY_MS);
	}

	return articles;
}

async function fetchArticle(id) {
	const response = await fetch(`https://dev.to/api/articles/${id}`);
	return response.json();
}

async function loadLocalArticles() {
	if (!existsSync(ARTICLES_JSON)) return [];
	const data = await readFile(ARTICLES_JSON, 'utf-8');
	return JSON.parse(data);
}

async function sync(forceFullSync = false) {
	console.log('Starting sync...\n');

	await mkdir(ARTICLES_DIR, { recursive: true });

	const remoteArticles = await fetchAllArticles();
	const localArticles = await loadLocalArticles();

	const localMap = new Map(localArticles.map(a => [a.id, a]));

	let added = 0;
	let updated = 0;
	let unchanged = 0;

	for (const remote of remoteArticles) {
		const local = localMap.get(remote.id);
		const articlePath = join(ARTICLES_DIR, `${remote.id}.json`);

		const isNew = !local;
		const isUpdated = local && remote.edited_at !== local.edited_at;

		if (isNew || isUpdated || forceFullSync) {
			console.log(`${isNew ? 'Adding' : 'Updating'}: ${remote.title}`);
			await delay(DELAY_MS);
			const fullArticle = await fetchArticle(remote.id);
			await writeFile(articlePath, JSON.stringify(fullArticle, null, 2));

			if (isNew) added++;
			else updated++;
		} else {
			unchanged++;
		}
	}

	// Save articles list (metadata only)
	const metadata = remoteArticles.map(({
		id, title, description, cover_image, published_timestamp,
		edited_at, url, tag_list, public_reactions_count
	}) => ({
		id, title, description, cover_image, published_timestamp,
		edited_at, url, tag_list, public_reactions_count
	}));

	await writeFile(ARTICLES_JSON, JSON.stringify(metadata, null, 2));

	console.log(`\nSync complete!`);
	console.log(`  Added: ${added}`);
	console.log(`  Updated: ${updated}`);
	console.log(`  Unchanged: ${unchanged}`);
	console.log(`  Total: ${remoteArticles.length}`);
}

const forceFullSync = process.argv.includes('--full');
sync(forceFullSync).catch(console.error);
```

---

## Task 7: Run sync to populate data folder

**Step 1: Run the sync script**

```bash
cd /Users/madsstoumann/Library/CloudStorage/Dropbox/Projects/articles
node sync.js
```

**Expected:** Script outputs progress and creates `data/articles.json` plus individual article files in `data/articles/`.

---

## Task 8: Create index.html

**Files:**
- Create: `/Users/madsstoumann/Library/CloudStorage/Dropbox/Projects/articles/index.html`

**Step 1: Create the HTML file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Articles by Mads Stoumann</title>
</head>
<body>
	<h1>Articles</h1>

	<dev-to
		author="madsstoumann"
		baseurl="./data"
		theme="classic"
		itemsperpage="10">
	</dev-to>

	<script type="module">
		// Development: local import
		import '/Users/madsstoumann/Dropbox/Projects/browser-style/ui/dev-to/index.js';
		// Production: import 'https://browser.style/ui/dev-to/index.js';
	</script>
</body>
</html>
```

---

## Task 9: Test locally

**Step 1: Start a local server**

```bash
cd /Users/madsstoumann/Library/CloudStorage/Dropbox/Projects/articles
npx serve .
```

**Step 2: Open browser**

Navigate to `http://localhost:3000` (or the port shown).

**Expected behavior:**
- Article list loads from local `data/articles.json`
- Clicking an article loads content from `data/articles/{id}.json`
- "More" button shows next 10 articles
- Back button returns to list

---

## Task 10: Commit articles project

**Step 1: Commit all new files**

```bash
cd /Users/madsstoumann/Library/CloudStorage/Dropbox/Projects/articles
git add sync.js index.html data/
git commit -m "feat: add static articles archive with sync script and index page"
```

---

## Summary

After completing all tasks:
1. The `<dev-to>` component supports `baseurl` for local data
2. `sync.js` fetches all articles from dev.to and stores locally
3. `index.html` displays the articles using local data
4. Run `node sync.js` anytime to update articles
5. When ready, publish updated component to npm and change import URL
