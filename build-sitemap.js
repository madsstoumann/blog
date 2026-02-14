import { readFile, writeFile } from 'node:fs/promises';

const SITE = 'https://blog.stoumann.dk';
const articles = JSON.parse(await readFile('./data/articles.json', 'utf-8'));

const urls = [
	`  <url>\n    <loc>${SITE}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`
];

for (const article of articles) {
	if (!article.slug) continue;
	const lastmod = article.edited_at || article.published_timestamp;
	urls.push(`  <url>\n    <loc>${SITE}/${article.slug}</loc>\n    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>\n    <priority>0.8</priority>\n  </url>`);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

await writeFile('./sitemap.xml', sitemap);
console.log(`Generated sitemap.xml with ${urls.length} URLs`);
