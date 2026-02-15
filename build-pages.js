import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SITE = 'https://blog.stoumann.dk';
const articles = JSON.parse(await readFile('./data/articles.json', 'utf-8'));

let count = 0;

for (const meta of articles) {
	if (!meta.slug) continue;

	const article = JSON.parse(
		await readFile(join('./data/articles', `${meta.id}.json`), 'utf-8')
	);

	const title = escapeHtml(article.title);
	const description = escapeHtml(article.description);
	const url = `${SITE}/${meta.slug}`;
	const coverImage = article.cover_image ? `${SITE}/${article.cover_image}` : '';
	const socialImage = article.social_image ? `${SITE}/${article.social_image}` : coverImage;

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${title} — Mads Stoumann</title>
	<meta name="description" content="${description}">
	<link rel="canonical" href="${url}">
	<meta property="og:type" content="article">
	<meta property="og:title" content="${title}">
	<meta property="og:description" content="${description}">
	<meta property="og:url" content="${url}">
	${socialImage ? `<meta property="og:image" content="${socialImage}">` : ''}
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content="${title}">
	<meta name="twitter:description" content="${description}">
	${socialImage ? `<meta name="twitter:image" content="${socialImage}">` : ''}
	<base href="/">
	<style>
		body {
			background: canvas;
			color: canvastext;
			color-scheme: light dark;
			margin: 0;
		}
	</style>
</head>
<body>
	<dev-to
		author="madsstoumann"
		baseurl="./data"
		theme="classic"
		itemsperpage="10">
		<h1 slot="headline">Mads Stoumann's Blog</h1>
		<p slot="description">Articles about CSS, JavaScript, and web development.</p>
	</dev-to>
	<noscript>
		<article>
			<h1>${title}</h1>
			${article.body_html}
		</article>
	</noscript>
	<script type="module">
		import 'https://browser.style/ui/dev-to/index.js';
	</script>
</body>
</html>
`;

	const dir = join('.', meta.slug);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'index.html'), html);
	count++;
}

console.log(`Generated ${count} static pages`);

function escapeHtml(str) {
	if (!str) return '';
	return str
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
