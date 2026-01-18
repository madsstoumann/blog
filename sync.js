#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const ARTICLES_DIR = join(DATA_DIR, 'articles');
const ARTICLES_JSON = join(DATA_DIR, 'articles.json');
const ASSETS_DIR = join(__dirname, 'assets');

const USERNAME = 'madsstoumann';
const PER_PAGE = 30;
const DELAY_MS = 300;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Extract all image URLs from an article
function extractImageUrls(article) {
	const urls = new Set();

	// Cover and social images
	if (article.cover_image) urls.add(article.cover_image);
	if (article.social_image) urls.add(article.social_image);

	// User profile images
	if (article.user?.profile_image) urls.add(article.user.profile_image);
	if (article.user?.profile_image_90) urls.add(article.user.profile_image_90);

	// Images in body_html (src attributes)
	const htmlRegex = /<img[^>]+src=["']([^"']+)["']/gi;
	let match;
	while ((match = htmlRegex.exec(article.body_html || '')) !== null) {
		urls.add(match[1]);
	}

	// Images in body_markdown ![alt](url)
	const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
	while ((match = mdRegex.exec(article.body_markdown || '')) !== null) {
		urls.add(match[1]);
	}

	return Array.from(urls);
}

// Generate a local filename for an image URL
function getLocalAssetPath(url, articleId) {
	// Create a hash of the URL to handle duplicates and special chars
	const hash = createHash('md5').update(url).digest('hex').slice(0, 8);

	// Try to get extension from URL
	let ext = '.jpg'; // default
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;
		// Handle dev.to dynamic URLs - extract original extension
		if (pathname.includes('format=auto')) {
			ext = '.jpg'; // dev.to auto-format
		} else {
			const pathExt = extname(pathname).split('?')[0];
			if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(pathExt.toLowerCase())) {
				ext = pathExt.toLowerCase();
			}
		}
	} catch {
		// Use default extension
	}

	return `assets/${articleId}/${hash}${ext}`;
}

// Download an image and save it locally
async function downloadAsset(url, localPath) {
	const fullPath = join(__dirname, localPath);

	// Skip if already downloaded
	if (existsSync(fullPath)) {
		return true;
	}

	try {
		const response = await fetch(url);
		if (!response.ok) {
			console.warn(`  Failed to download: ${url} (${response.status})`);
			return false;
		}

		const buffer = await response.arrayBuffer();
		await mkdir(dirname(fullPath), { recursive: true });
		await writeFile(fullPath, Buffer.from(buffer));
		return true;
	} catch (err) {
		console.warn(`  Error downloading ${url}: ${err.message}`);
		return false;
	}
}

// Replace image URLs in article with local paths
function replaceImageUrls(article, urlMap) {
	let modified = { ...article };

	for (const [originalUrl, localPath] of Object.entries(urlMap)) {
		// Replace in cover_image
		if (modified.cover_image === originalUrl) {
			modified.cover_image = localPath;
		}

		// Replace in social_image
		if (modified.social_image === originalUrl) {
			modified.social_image = localPath;
		}

		// Replace in body_html
		if (modified.body_html) {
			modified.body_html = modified.body_html.split(originalUrl).join(localPath);
		}

		// Replace in body_markdown
		if (modified.body_markdown) {
			modified.body_markdown = modified.body_markdown.split(originalUrl).join(localPath);
		}
	}

	return modified;
}

// Download all assets for an article and return URL mapping
async function downloadArticleAssets(article) {
	const urls = extractImageUrls(article);
	const urlMap = {};

	if (urls.length === 0) return urlMap;

	console.log(`  Downloading ${urls.length} asset(s)...`);

	for (const url of urls) {
		const localPath = getLocalAssetPath(url, article.id);
		const success = await downloadAsset(url, localPath);
		if (success) {
			urlMap[url] = localPath;
		}
		await delay(100); // Small delay between downloads
	}

	return urlMap;
}

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

			// Download assets and replace URLs
			const urlMap = await downloadArticleAssets(fullArticle);
			const articleWithLocalAssets = replaceImageUrls(fullArticle, urlMap);

			await writeFile(articlePath, JSON.stringify(articleWithLocalAssets, null, 2));

			if (isNew) added++;
			else updated++;
		} else {
			unchanged++;
		}
	}

	// Build cover image mapping from processed articles
	const coverImageMap = new Map();
	for (const remote of remoteArticles) {
		const articlePath = join(ARTICLES_DIR, `${remote.id}.json`);
		if (existsSync(articlePath)) {
			try {
				const data = await readFile(articlePath, 'utf-8');
				const article = JSON.parse(data);
				if (article.cover_image) {
					coverImageMap.set(remote.id, article.cover_image);
				}
			} catch {
				// Use original cover_image if article file can't be read
			}
		}
	}

	// Save articles list (metadata only) with local cover_image paths
	const metadata = remoteArticles.map(({
		id, title, description, cover_image, published_timestamp,
		edited_at, url, tag_list, public_reactions_count
	}) => ({
		id, title, description,
		cover_image: coverImageMap.get(id) || cover_image,
		published_timestamp,
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
