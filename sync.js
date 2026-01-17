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
