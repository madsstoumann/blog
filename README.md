# Dev.to Static Blog

A static archive of dev.to and WordPress articles with locally hosted assets. Uses the [`<dev-to>`](https://browser.style/ui/dev-to) web component to display articles in a clean, customizable interface.

## Live Demo

[blog.stoumann.dk](https://blog.stoumann.dk) — archive of [dev.to/madsstoumann](https://dev.to/madsstoumann)

## Features

- Syncs articles from any dev.to author
- Imports WordPress articles from exported data
- Downloads and hosts all images locally
- Clean slug-based URLs (e.g. `/creating-a-grid-visualizer`)
- Auto-generated sitemap
- No external dependencies at runtime (except the web component)
- Supports dark mode automatically
- Pagination built-in

## Quick Start

1. **Clone and sync articles:**
   ```bash
   git clone https://github.com/madsstoumann/blog.git
   cd blog
   node sync.js <your-devto-username> --full
   ```

2. **Generate slug map and sitemap:**
   ```bash
   node build-slugs.js
   node build-sitemap.js
   ```

3. **Serve locally:**
   ```bash
   npx serve . -s
   ```
   The `-s` flag enables SPA fallback (rewrites unknown routes to `index.html`), which is needed for slug-based URLs.

4. **Open in browser:**
   ```
   http://localhost:3000
   ```

## Customization

Edit `index.html` to customize the `<dev-to>` component:

```html
<dev-to
  author="your-username"
  baseurl="./data"
  theme="classic"
  itemsperpage="10">
</dev-to>
```

| Attribute | Description |
|-----------|-------------|
| `author` | Your dev.to username |
| `baseurl` | Path to the data folder |
| `theme` | Visual theme (`classic`, etc.) |
| `itemsperpage` | Articles per page |

## Syncing Articles

The `sync.js` script fetches articles from dev.to and stores them locally with all assets.

### Usage

```bash
# Incremental sync (only new/updated articles)
node sync.js <username>

# Full sync (re-download all articles and assets)
node sync.js <username> --full

# Or use environment variable
DEVTO_USERNAME=<username> node sync.js [--full]
```

### What it does

- Fetches article metadata and full content from the dev.to API
- Downloads all images (cover, social, inline, profile) to `assets/`
- Replaces remote URLs with local paths in the JSON
- Stores article data in `data/articles/{id}.json`
- Maintains an index at `data/articles.json` (includes `slug` for each article)

### WordPress Articles

WordPress articles are processed separately using `wordpress/process-wordpress.js`, which reads from a local `wordpress/wordpress-posts.json` export and merges them into `data/articles.json`.

```bash
node wordpress/process-wordpress.js
```

### Build Scripts

```bash
# Generate slug-to-ID map (data/slugs.json)
node build-slugs.js

# Generate sitemap (sitemap.xml)
node build-sitemap.js
```

Run these after syncing or adding new articles.

## URL Routing

Articles use clean slug-based URLs (e.g. `blog.stoumann.dk/creating-a-grid-visualizer`). This works via:

1. **GitHub Pages**: `404.html` catches unknown paths, saves the slug to `sessionStorage`, and redirects to `/`
2. **`index.html`**: Restores the slug path via `history.replaceState`
3. **`<dev-to>` component**: Detects the slug in the pathname, resolves it from `articles.json` metadata, and renders the article

For local development, use `npx serve . -s` to enable the same SPA fallback behaviour.

## Folder Structure

```
blog/
├── index.html           # Main page
├── 404.html             # GitHub Pages SPA fallback
├── sync.js              # Dev.to sync script
├── build-slugs.js       # Generates data/slugs.json
├── build-sitemap.js     # Generates sitemap.xml
├── sitemap.xml          # Auto-generated sitemap
├── assets/
│   ├── {articleId}/     # Article-specific images
│   │   └── {hash}.jpg
│   └── user/            # Shared profile images
│       └── {hash}.jpg
├── data/
│   ├── articles.json    # Article index (metadata with slugs)
│   ├── slugs.json       # Slug-to-ID mapping
│   └── articles/
│       ├── {id}.json    # Dev.to article content
│       └── wp-{id}.json # WordPress article content
└── wordpress/
    ├── process-wordpress.js  # WordPress import script
    └── wordpress-posts.json  # WordPress export data
```

## Deploying

This is a static site that can be deployed anywhere:

- **GitHub Pages**: Push to main and enable Pages in settings. The `404.html` handles SPA routing automatically.
- **Netlify/Vercel**: Connect your repo and deploy. Add a rewrite rule: `/*` → `/index.html` (200).
- **Any static host**: Upload the files and configure a fallback to `index.html` for unknown routes.

## License

MIT
