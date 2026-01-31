#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const ARTICLES_DIR = join(DATA_DIR, 'articles');
const ARTICLES_JSON = join(DATA_DIR, 'articles.json');
const ASSETS_DIR = join(__dirname, 'assets');
const WP_POSTS_FILE = join(__dirname, 'wordpress-posts.json');

const WORDPRESS_SITE = 'madsstoumann.wordpress.com';
const WP_ID_PREFIX = 'wp-';

// Convert WordPress post to dev.to-like format
function convertToArticleFormat(post) {
	const articleId = `${WP_ID_PREFIX}${post.ID}`;

	// Use WordPress image URLs directly (remote)
	let coverImage = post.featured_image || null;
	if (coverImage === '') coverImage = null;

	// Extract tags from categories and tags
	const tagList = [];
	if (post.categories && Array.isArray(post.categories)) {
		post.categories.forEach(cat => {
			tagList.push(cat.toLowerCase().replace(/\s+/g, '-'));
		});
	}
	if (post.tags && Array.isArray(post.tags)) {
		post.tags.forEach(tag => {
			const normalized = tag.toLowerCase().replace(/\s+/g, '-');
			if (!tagList.includes(normalized)) {
				tagList.push(normalized);
			}
		});
	}

	// Format date for readable display
	const date = new Date(post.date);
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const readableDate = `${months[date.getMonth()]} ${date.getDate()} '${String(date.getFullYear()).slice(-2)}`;

	// Calculate reading time
	const wordCount = (post.content || '').replace(/<[^>]*>/g, '').split(/\s+/).length;
	const readingTime = Math.max(1, Math.ceil(wordCount / 200));

	return {
		type_of: 'article',
		id: articleId,
		title: post.title,
		description: post.excerpt ? post.excerpt.replace(/<[^>]*>/g, '').trim().slice(0, 200) : '',
		slug: post.slug,
		url: post.URL,
		path: `/${post.slug}`,
		canonical_url: post.URL,
		cover_image: coverImage,
		social_image: coverImage,
		body_html: post.content || '',
		body_markdown: null,
		reading_time_minutes: readingTime,
		published_at: post.date,
		published_timestamp: post.date,
		created_at: post.date,
		edited_at: post.modified !== post.date ? post.modified : null,
		last_comment_at: null,
		comments_count: post.comment_count || 0,
		public_reactions_count: post.like_count || 0,
		positive_reactions_count: post.like_count || 0,
		tag_list: tagList.join(', '),
		tags: tagList.map(tag => ({ id: tag, name: tag })),
		language: 'en',
		source: 'wordpress',
		source_site: WORDPRESS_SITE,
		readable_publish_date: readableDate,
		user: {
			name: post.author?.name || 'Mads Stoumann',
			username: post.author?.login || 'madsstoumann',
			user_id: 1,
			profile_image: null,
			profile_image_90: null
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
		tag_list: article.tags.map(t => t.name),
		public_reactions_count: article.public_reactions_count,
		source: 'wordpress'
	};
}

async function loadExistingArticles() {
	if (!existsSync(ARTICLES_JSON)) return [];
	const data = await readFile(ARTICLES_JSON, 'utf-8');
	return JSON.parse(data);
}

async function process() {
	console.log(`Processing WordPress posts from local file...\n`);

	await mkdir(ARTICLES_DIR, { recursive: true });

	// Load WordPress posts from local file
	const postsData = await readFile(WP_POSTS_FILE, 'utf-8');
	const posts = JSON.parse(postsData);

	console.log(`Found ${posts.length} WordPress posts.\n`);

	// Load existing articles (dev.to)
	const existingArticles = await loadExistingArticles();

	// Filter out any existing WordPress articles (to allow re-running)
	const devtoArticles = existingArticles.filter(a => !a.source || a.source !== 'wordpress');

	const wpMetadata = [];
	let processed = 0;

	// Sort posts by date (oldest first)
	posts.sort((a, b) => new Date(a.date) - new Date(b.date));

	for (const post of posts) {
		const articleId = `${WP_ID_PREFIX}${post.ID}`;
		console.log(`Processing: ${post.title}`);

		// Convert to article format
		const article = convertToArticleFormat(post);

		// Save individual article file
		const articlePath = join(ARTICLES_DIR, `${articleId}.json`);
		await writeFile(articlePath, JSON.stringify(article, null, 2));

		// Create metadata entry
		wpMetadata.push(createMetadataEntry(article));

		processed++;
	}

	// Sort WordPress by newest first (to match dev.to ordering within the WP section)
	wpMetadata.sort((a, b) => new Date(b.published_timestamp) - new Date(a.published_timestamp));

	// Combine: dev.to articles first, then WordPress articles at the end
	const allMetadata = [...devtoArticles, ...wpMetadata];

	// Save combined articles.json
	await writeFile(ARTICLES_JSON, JSON.stringify(allMetadata, null, '\t'));

	console.log(`\nWordPress processing complete!`);
	console.log(`  Processed: ${processed} posts`);
	console.log(`  Dev.to articles: ${devtoArticles.length}`);
	console.log(`  WordPress articles: ${wpMetadata.length}`);
	console.log(`  Total in articles.json: ${allMetadata.length}`);
}

process().catch(console.error);
