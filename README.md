# Dev.to Static Blog

A static archive of dev.to articles with locally hosted assets. Uses the `<dev-to>` web component to display articles in a clean, customizable interface.

## Features

- Syncs articles from any dev.to author
- Downloads and hosts all images locally
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

2. **Serve locally:**
   ```bash
   npx serve .
   # or use any static file server
   ```

3. **Open in browser:**
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
- Maintains an index at `data/articles.json`

## Folder Structure

```
blog/
├── index.html           # Main page
├── sync.js              # Sync script
├── assets/
│   ├── {articleId}/     # Article-specific images
│   │   └── {hash}.jpg
│   └── user/            # Shared profile images
│       └── {hash}.jpg
└── data/
    ├── articles.json    # Article index (metadata)
    └── articles/
        └── {id}.json    # Full article content
```

## Deploying

This is a static site that can be deployed anywhere:

- **GitHub Pages**: Push to a `gh-pages` branch or enable Pages in settings
- **Netlify/Vercel**: Connect your repo and deploy
- **Any static host**: Upload the files

## License

MIT
