# Static Articles Archive Design

## Overview

Create a static archive of dev.to articles by Mads Stoumann, using the `<dev-to>` web component with local JSON data instead of the live API.

## Project Structure

```
articles/
├── index.html              # Main page with <dev-to> component
├── data/
│   ├── articles.json       # List metadata (id, title, cover, date, etc.)
│   └── articles/
│       ├── {id}.json       # Full article content per article
│       └── ...
├── sync.js                 # Node script to fetch from dev.to
└── README.md
```

## Component Modifications

The `<dev-to>` component in browser-style requires a new `baseurl` attribute:

- When set, overrides API endpoints to use local paths
- Example: `<dev-to author="madsstoumann" baseurl="./data">`

### Endpoint Logic Changes

```javascript
ENDPOINTS: {
  USER_ARTICLES: (username, page, perPage, baseUrl) =>
    baseUrl
      ? `${baseUrl}/articles.json`
      : `https://dev.to/api/articles?username=${username}&page=${page}&per_page=${perPage}`,
  SINGLE_ARTICLE: (id, baseUrl) =>
    baseUrl
      ? `${baseUrl}/articles/${id}.json`
      : `https://dev.to/api/articles/${id}`
}
```

### Pagination Handling

- With `baseurl`, component loads all articles from `articles.json` at once
- Client-side pagination works using `itemsperpage` attribute
- "More" button loads from already-fetched array

## Sync Script

`sync.js` - Node.js script (no dependencies, uses native fetch):

### Functionality

1. **Fetch all articles** from dev.to API for "madsstoumann"
   - Paginate through all pages (max 30 per request)
   - Respect rate limits with delays between requests

2. **Compare with local data**
   - Read existing `data/articles.json`
   - Detect new articles
   - Detect updated articles (via `edited_at` timestamp)

3. **Update local files**
   - Write `data/articles.json` with list metadata
   - Fetch full content for new/updated articles only
   - Write individual `data/articles/{id}.json` files

4. **Report changes**
   - Log summary: "Added X new, updated Y, unchanged Z"
   - List specific changed articles

### Usage

```bash
node sync.js           # Sync changes only
node sync.js --full    # Force re-fetch everything
```

## HTML Page

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Articles by Mads Stoumann</title>
</head>
<body>
  <h1>Articles</h1>

  <dev-to
    author="madsstoumann"
    baseurl="./data"
    theme="classic"
    itemsperpage="10">
  </dev-to>

  <script type="module">
    // Development: local import
    import '/Users/madsstoumann/Dropbox/Projects/browser-style/ui/dev-to/index.js';
    // Production: import 'https://browser.style/ui/dev-to/index.js';
  </script>
</body>
</html>
```

## Implementation Order

1. Modify `<dev-to>` component to support `baseurl` attribute
2. Create `sync.js` script
3. Run sync to populate `data/` folder
4. Create `index.html`
5. Test locally
6. Publish updated component to npm
7. Update import to use browser.style URL
