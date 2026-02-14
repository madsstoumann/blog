import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ARTICLES_DIR = './data/articles';
const SLUGS_JSON = './data/slugs.json';

const files = (await readdir(ARTICLES_DIR)).filter(f => f.endsWith('.json'));
const slugs = {};
const seen = new Map();

for (const file of files) {
	const article = JSON.parse(await readFile(join(ARTICLES_DIR, file), 'utf-8'));
	const { id, slug } = article;
	if (!slug) {
		console.warn(`Warning: ${file} has no slug`);
		continue;
	}
	if (seen.has(slug)) {
		console.warn(`Warning: duplicate slug "${slug}" in ${file} (already in ${seen.get(slug)})`);
		continue;
	}
	seen.set(slug, file);
	slugs[slug] = id;
}

await writeFile(SLUGS_JSON, JSON.stringify(slugs, null, '\t'));
console.log(`Generated ${SLUGS_JSON} with ${Object.keys(slugs).length} entries`);
