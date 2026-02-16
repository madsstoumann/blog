const ORIGIN = 'https://blog.stoumann.dk';
const SLUGS_URL = `${ORIGIN}/data/slugs.json`;
const SLUGS_CACHE_TTL = 3600;

// Bots allowed in robots.txt — keep in sync
const ALLOWED_BOTS = /googlebot|bingbot|duckduckbot|yandexbot|baiduspider|unified-search-bot|cloudflare-ai-search/i;

let slugsCache = null;
let slugsCacheTime = 0;

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const path = url.pathname;

		// Only handle single-segment paths (i.e. /slug, not /assets/... or /data/...)
		if (path === '/' || path.includes('.') || path.split('/').filter(Boolean).length !== 1) {
			return fetch(request);
		}

		// Block disallowed bots early — don't spend Worker time on them
		const ua = request.headers.get('User-Agent') || '';
		if (isBot(ua) && !ALLOWED_BOTS.test(ua)) {
			return new Response('Disallowed by robots.txt', { status: 403 });
		}

		const slug = path.replace(/^\/|\/$/g, '');
		const slugs = await getSlugs();

		if (!(slug in slugs)) {
			return fetch(request);
		}

		const articleId = slugs[slug];
		const articleUrl = `${ORIGIN}/data/articles/${articleId}.json`;
		const articleRes = await fetch(articleUrl, {
			cf: { cacheTtl: SLUGS_CACHE_TTL }
		});

		if (!articleRes.ok) {
			return fetch(request);
		}

		const article = await articleRes.json();
		const html = renderArticlePage(article, slug);

		return new Response(html, {
			status: 200,
			headers: {
				'Content-Type': 'text/html;charset=UTF-8',
				'Cache-Control': 'public, max-age=3600, s-maxage=86400',
			}
		});
	}
};

async function getSlugs() {
	const now = Date.now();
	if (slugsCache && (now - slugsCacheTime) < SLUGS_CACHE_TTL * 1000) {
		return slugsCache;
	}
	const res = await fetch(SLUGS_URL, {
		cf: { cacheTtl: SLUGS_CACHE_TTL }
	});
	slugsCache = await res.json();
	slugsCacheTime = now;
	return slugsCache;
}

function isBot(ua) {
	return /bot|crawl|spider|slurp|archive|scrape/i.test(ua);
}

function escapeHtml(str) {
	if (!str) return '';
	return str
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function renderArticlePage(article, slug) {
	const title = escapeHtml(article.title);
	const description = escapeHtml(article.description);
	const url = `${ORIGIN}/${slug}`;
	const coverImage = article.cover_image ? `${ORIGIN}/${article.cover_image}` : '';
	const socialImage = article.social_image ? `${ORIGIN}/${article.social_image}` : coverImage;

	return `<!DOCTYPE html>
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
			${article.body_markdown ? `<pre>${escapeHtml(article.body_markdown)}</pre>` : article.body_html}
		</article>
	</noscript>
	<script type="module">
		import 'https://browser.style/ui/dev-to/index.js';
	</script>
</body>
</html>`;
}
