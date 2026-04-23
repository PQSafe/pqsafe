# The Agent Payments Handbook

**Live URL**: [pqsafe.xyz/handbook](https://pqsafe.xyz/handbook)

A 10,000-word authoritative guide on AI agent payment infrastructure. Written for AI agent developers, agentic workflow founders, and engineers evaluating payment infrastructure for autonomous systems.

## Publishing to pqsafe.xyz/handbook via Cloudflare Pages

The handbook is a single Markdown file (`handbook.md`). Publishing it at the `/handbook` route requires a small Cloudflare Pages setup that converts Markdown to HTML.

### Option A: Static HTML build (recommended for SEO)

1. **Create a `handbook/` directory** in the existing `pqsafe/landing` project (or as a standalone Pages project).

2. **Add a build step** using a static site generator. The simplest approach with full SEO control is a minimal Vite + markdown-it build:

```bash
cd /Users/tun/Projects/pqsafe/landing
npm install markdown-it gray-matter
```

3. **Create `handbook/build.mjs`**:

```javascript
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import MarkdownIt from "markdown-it";
import matter from "gray-matter";

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

const raw = readFileSync("../handbook/handbook.md", "utf8");
const { content } = matter(raw);
const body = md.render(content);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>The Agent Payments Handbook — PQSafe</title>
  <meta name="description" content="The authoritative developer guide to AI agent payment infrastructure. Covers identity, authorization, security, integration patterns, and the post-quantum future." />
  <meta property="og:title" content="The Agent Payments Handbook" />
  <meta property="og:description" content="Everything engineers and founders need to build autonomous AI agent payment systems." />
  <meta property="og:url" content="https://pqsafe.xyz/handbook" />
  <meta property="og:type" content="article" />
  <link rel="canonical" href="https://pqsafe.xyz/handbook" />
  <link rel="stylesheet" href="/handbook/style.css" />
</head>
<body>
  <div class="handbook-container">
    ${body}
  </div>
</body>
</html>`;

mkdirSync("dist/handbook", { recursive: true });
writeFileSync("dist/handbook/index.html", html);
console.log("Handbook built: dist/handbook/index.html");
```

4. **Add a minimal CSS** at `handbook/style.css` (served as `/handbook/style.css`):

```css
.handbook-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.7;
  color: #1a1a1a;
}
pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
code { font-family: "Fira Code", monospace; font-size: 0.9em; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
th { background: #f4f4f4; }
h1, h2, h3 { font-weight: 600; margin-top: 2rem; }
a { color: #0066cc; }
```

5. **Add to `package.json` scripts**:
```json
"build:handbook": "node handbook/build.mjs"
```

6. **Cloudflare Pages build command**: `npm run build && node handbook/build.mjs`
   - **Output directory**: `dist`
   - The handbook will be available at `/handbook/index.html` → routed as `/handbook`

### Option B: Direct Cloudflare Pages (zero-build)

If the `pqsafe/landing` project already uses Cloudflare Pages:

1. Copy `handbook.md` to the project repo.
2. Use Cloudflare Pages' built-in Markdown rendering: add `handbook.md` to the `public/` or static directory.
3. Cloudflare Pages does not natively render Markdown — use Option A or Option C for rendered HTML.

### Option C: Standalone Pages project (fastest to ship)

1. Create a new Cloudflare Pages project pointing to a new GitHub repo.
2. Copy `handbook.md` into the repo.
3. Set build command to `npx marked handbook.md -o dist/index.html && mkdir -p dist` (requires `marked` installed).
4. Set custom domain route: `pqsafe.xyz/handbook` → this Pages project using a Cloudflare Route.
5. In the existing `pqsafe.xyz` Cloudflare zone, add a Route:
   - Pattern: `pqsafe.xyz/handbook*`
   - Worker/Pages: your handbook Pages project

### Route configuration in Cloudflare (all options)

In the Cloudflare dashboard:
1. Go to the `pqsafe.xyz` zone → **Workers & Pages** → **Routes**
2. Add route: `pqsafe.xyz/handbook*` → handbook Pages project
3. The main `pqsafe.xyz` landing remains on its existing project

### SEO checklist before publishing

- [ ] Confirm canonical URL is `https://pqsafe.xyz/handbook` (not `/handbook/` with trailing slash)
- [ ] Add OpenGraph + Twitter card meta tags (template above includes these)
- [ ] Submit URL to Google Search Console after publishing
- [ ] Add internal link from `pqsafe.xyz` homepage → `/handbook`
- [ ] Add `handbook` to the sitemap (if one exists)
- [ ] Verify page loads in <2s (Cloudflare CDN should handle this)

## Updating the handbook

Edit `handbook.md` directly. The file is the source of truth. Re-run the build step and the Cloudflare Pages deploy triggers automatically on `git push`.

## License

The handbook text is published under CC BY 4.0. Code samples are MIT licensed.
