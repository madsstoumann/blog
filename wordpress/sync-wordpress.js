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

const WORDPRESS_SITE = 'madsstoumann.wordpress.com';
const API_BASE = `https://public-api.wordpress.com/rest/v1.1/sites/${WORDPRESS_SITE}`;
const DELAY_MS = 300;

// Prefix for WordPress article IDs to avoid collision with dev.to IDs
const WP_ID_PREFIX = 'wp-';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with retry logic for network issues
async function fetchWithRetry(url, retries = 4) {
	const delays = [2000, 4000, 8000, 16000];
	let lastError;

	for (let i = 0; i <= retries; i++) {
		try {
			const response = await fetch(url);
			return response;
		} catch (err) {
			lastError = err;
			if (i < retries) {
				const waitTime = delays[i];
				console.log(`  Network error, retrying in ${waitTime / 1000}s...`);
				await delay(waitTime);
			}
		}
	}
	throw lastError;
}

// Extract all image URLs from WordPress content
function extractImageUrls(post) {
	const urls = new Set();

	// Featured image
	if (post.featured_image) {
		urls.add(post.featured_image);
	}

	// Post thumbnail (alternative)
	if (post.post_thumbnail?.URL) {
		urls.add(post.post_thumbnail.URL);
	}

	// Images in content (src attributes)
	const htmlRegex = /<img[^>]+src=["']([^"']+)["']/gi;
	let match;
	while ((match = htmlRegex.exec(post.content || '')) !== null) {
		urls.add(match[1]);
	}

	return Array.from(urls);
}

// Generate a local filename for an image URL
function getLocalAssetPath(url, articleId) {
	const hash = createHash('md5').update(url).digest('hex').slice(0, 8);

	let ext = '.jpg';
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;
		const pathExt = extname(pathname).split('?')[0];
		if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(pathExt.toLowerCase())) {
			ext = pathExt.toLowerCase();
		}
	} catch {
		// Use default extension
	}

	return `assets/${articleId}/${hash}${ext}`;
}

// Download an image and save it locally
async function downloadAsset(url, localPath) {
	const fullPath = join(__dirname, localPath);

	if (existsSync(fullPath)) {
		return true;
	}

	try {
		const response = await fetchWithRetry(url);
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

// Replace image URLs in content with local paths
function replaceImageUrls(content, urlMap) {
	let modified = content;
	for (const [originalUrl, localPath] of Object.entries(urlMap)) {
		modified = modified.split(originalUrl).join(localPath);
	}
	return modified;
}

// Download all assets for a post and return URL mapping
async function downloadPostAssets(post, articleId) {
	const urls = extractImageUrls(post);
	const urlMap = {};

	if (urls.length === 0) return urlMap;

	console.log(`  Downloading ${urls.length} asset(s)...`);

	for (const url of urls) {
		const localPath = getLocalAssetPath(url, articleId);
		const success = await downloadAsset(url, localPath);
		if (success) {
			urlMap[url] = localPath;
		}
		await delay(100);
	}

	return urlMap;
}

// Fetch all posts from WordPress.com API
async function fetchAllPosts() {
	const posts = [];
	let page = 1;
	const perPage = 100;

	while (true) {
		console.log(`Fetching WordPress posts page ${page}...`);
		const response = await fetchWithRetry(
			`${API_BASE}/posts/?number=${perPage}&page=${page}`
		);
		const data = await response.json();

		if (!data.posts || data.posts.length === 0) break;
		posts.push(...data.posts);

		if (data.posts.length < perPage) break;
		page++;
		await delay(DELAY_MS);
	}

	return posts;
}

// Remove "By Mads Stoumann" byline and extract first image as cover
function cleanupContent(html) {
	let content = html;
	let extractedImage = null;

	// Remove byline: standalone paragraph like <p>By <a...>Mads Stoumann</a></p>
	content = content.replace(/^(\s*<p>By\s+(?:<a[^>]*>)?Mads Stoumann(?:<\/a>)?\s*<\/p>\n?)/i, '');

	// Remove byline: inline at start of a paragraph like <p>By <a...>Mads Stoumann</a><br />\n
	content = content.replace(/^(\s*<p>)By\s+(?:<a[^>]*>)?Mads Stoumann(?:<\/a>)?\s*<br\s*\/?>\n?/i, '$1');

	// If byline wasn't at the very start, it may follow a first image paragraph
	// Check for image-then-byline pattern
	const imgThenByline = /^(\s*<p>(?:<a[^>]*>)?<img[^>]+\/?>(?:<\/a>)?<\/p>\n?)(\s*<p>By\s+(?:<a[^>]*>)?Mads Stoumann(?:<\/a>)?\s*<\/p>\n?)/i;
	const match = content.match(imgThenByline);
	if (match) {
		// Remove the byline paragraph that follows the image
		content = content.replace(match[2], '');
	}

	// Extract first image from an image-only paragraph (for cover_image)
	const firstImgParagraph = /^(\s*<p>(?:<a[^>]*>)?\s*<img[^>]+src=["']([^"']+)["'][^>]*\/?>(?:<\/a>)?\s*<\/p>\n?)/i;
	const imgMatch = content.match(firstImgParagraph);
	if (imgMatch) {
		extractedImage = imgMatch[2];
		content = content.replace(imgMatch[1], '');
	}

	return { content, extractedImage };
}

// Remove "By Mads Stoumann" prefix from description
function cleanupDescription(description) {
	return description.replace(/^By\s+Mads Stoumann\s*/i, '');
}

// Convert WordPress post to dev.to-like format
function convertToArticleFormat(post, urlMap) {
	const articleId = `${WP_ID_PREFIX}${post.ID}`;

	// Get cover image (local path if downloaded)
	let coverImage = post.featured_image || post.post_thumbnail?.URL || null;
	if (coverImage && urlMap[coverImage]) {
		coverImage = urlMap[coverImage];
	}

	// Replace image URLs in content
	let bodyHtml = post.content || '';
	bodyHtml = replaceImageUrls(bodyHtml, urlMap);

	// Clean up byline and extract first image
	const cleaned = cleanupContent(bodyHtml);
	bodyHtml = cleaned.content;
	if (!coverImage && cleaned.extractedImage) {
		coverImage = cleaned.extractedImage;
	}

	// Extract tags from categories and tags
	const tagList = [];
	if (post.categories) {
		Object.keys(post.categories).forEach(cat => {
			tagList.push(cat.toLowerCase().replace(/\s+/g, '-'));
		});
	}
	if (post.tags) {
		Object.keys(post.tags).forEach(tag => {
			const normalized = tag.toLowerCase().replace(/\s+/g, '-');
			if (!tagList.includes(normalized)) {
				tagList.push(normalized);
			}
		});
	}

	// Format date for readable display
	const date = new Date(post.date);
	const readableDate = date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: '2-digit'
	}).replace(',', ' \'');

	return {
		type_of: 'article',
		id: articleId,
		title: post.title,
		description: post.excerpt ? cleanupDescription(post.excerpt.replace(/<[^>]*>/g, '').trim()).slice(0, 200) : '',
		slug: post.slug,
		url: post.URL,
		path: `/${post.slug}`,
		canonical_url: post.URL,
		cover_image: coverImage || undefined,
		social_image: coverImage || undefined,
		body_html: bodyHtml,
		body_markdown: null, // WordPress doesn't provide markdown
		reading_time_minutes: Math.ceil((post.content?.split(/\s+/).length || 0) / 200),
		published_at: post.date,
		published_timestamp: post.date,
		created_at: post.date,
		edited_at: post.modified !== post.date ? post.modified : null,
		last_comment_at: null,
		comments_count: post.discussion?.comment_count || 0,
		public_reactions_count: post.like_count || 0,
		positive_reactions_count: post.like_count || 0,
		tag_list: tagList.join(', '),
		tags: tagList,
		language: 'en',
		source: 'wordpress',
		source_site: WORDPRESS_SITE,
		readable_publish_date: readableDate,
		user: {
			name: post.author?.name || 'Mads Stoumann',
			username: post.author?.login || 'madsstoumann',
			user_id: post.author?.ID || 1,
			profile_image: post.author?.avatar_URL || null,
			profile_image_90: post.author?.avatar_URL || null
		}
	};
}

// Create metadata entry for articles.json
function createMetadataEntry(article) {
	return {
		id: article.id,
		title: article.title,
		description: article.description,
		cover_image: article.cover_image,
		published_timestamp: article.published_timestamp,
		edited_at: article.edited_at,
		url: article.url,
		tag_list: article.tags,
		public_reactions_count: article.public_reactions_count,
		source: 'wordpress'
	};
}

async function loadExistingArticles() {
	if (!existsSync(ARTICLES_JSON)) return [];
	const data = await readFile(ARTICLES_JSON, 'utf-8');
	return JSON.parse(data);
}

async function sync() {
	console.log(`Starting WordPress sync from ${WORDPRESS_SITE}...\n`);

	await mkdir(ARTICLES_DIR, { recursive: true });

	const posts = await fetchAllPosts();
	console.log(`\nFound ${posts.length} WordPress posts.\n`);

	// Load existing articles (dev.to)
	const existingArticles = await loadExistingArticles();

	// Filter out any existing WordPress articles (to allow re-running)
	const devtoArticles = existingArticles.filter(a => !a.source || a.source !== 'wordpress');

	const wpMetadata = [];
	let processed = 0;

	// Sort posts by date (oldest first, so they appear in chronological order at the end)
	posts.sort((a, b) => new Date(a.date) - new Date(b.date));

	for (const post of posts) {
		const articleId = `${WP_ID_PREFIX}${post.ID}`;
		console.log(`Processing: ${post.title}`);

		// Download assets
		const urlMap = await downloadPostAssets(post, articleId);

		// Convert to article format
		const article = convertToArticleFormat(post, urlMap);

		// Save individual article file
		const articlePath = join(ARTICLES_DIR, `${articleId}.json`);
		await writeFile(articlePath, JSON.stringify(article, null, 2));

		// Create metadata entry
		wpMetadata.push(createMetadataEntry(article));

		processed++;
		await delay(DELAY_MS);
	}

	// Combine: dev.to articles first, then WordPress articles at the end
	// Sort WordPress by newest first (to match dev.to ordering within the WP section)
	wpMetadata.sort((a, b) => new Date(b.published_timestamp) - new Date(a.published_timestamp));

	const allMetadata = [...devtoArticles, ...wpMetadata];

	// Save combined articles.json
	await writeFile(ARTICLES_JSON, JSON.stringify(allMetadata, null, 2));

	console.log(`\nWordPress sync complete!`);
	console.log(`  Processed: ${processed} posts`);
	console.log(`  Dev.to articles: ${devtoArticles.length}`);
	console.log(`  WordPress articles: ${wpMetadata.length}`);
	console.log(`  Total in articles.json: ${allMetadata.length}`);
}

sync().catch(console.error);
