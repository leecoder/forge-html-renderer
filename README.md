# forge-html-renderer

A Forge macro for Confluence Cloud that renders HTML attachments inline — with full JavaScript/CSS support.

## Features

- Render HTML attachments as sandboxed iframes inside Confluence pages
- **Inline JavaScript and CSS execution** (Chart.js, D3.js, Plotly, etc.)
- Upload HTML files directly from the macro toolbar
- Per-macro file selection saved automatically
- Auto-height (fits content up to 400px) + manual height override
- Edit mode toolbar / clean view mode (no controls)

## Usage

### Insert the Macro

1. In Confluence page edit mode, type `/HTML Attachment Renderer`
2. The macro toolbar provides:
   - **Upload HTML** — upload a local `.html` file (saved as page attachment)
   - **File selector** — pick from existing HTML attachments (when multiple)
   - **H: [px]** — set height manually (leave empty for auto)
3. Save the page → HTML renders inline in view mode

### Height Behavior

| State | Behavior |
|-------|----------|
| No height set + content < 400px | Auto-fits to content |
| No height set + content > 400px | 400px with scroll |
| Height manually set (e.g. 800) | Uses that value, no cap |

Height is saved per macro instance and persists across page loads.

### Supported HTML Content

- Static HTML/CSS layouts
- Inline `<script>` and `<style>` tags
- Event handlers (`onclick`, etc.)
- External CDN libraries (see "Allowed CDNs" below)

## Allowed CDN Domains

External `<script src="https://...">` references must match domains registered in `manifest.yml`.

Pre-registered domains:

| Domain | Use Case |
|--------|----------|
| `cdn.jsdelivr.net` | Chart.js, npm packages |
| `cdnjs.cloudflare.com` | General CDN |
| `unpkg.com` | npm packages |
| `d3js.org` | D3.js |
| `cdn.plot.ly` | Plotly |
| `cdn.datatables.net` | DataTables |
| `code.highcharts.com` | Highcharts |
| `www.gstatic.com` | Google Charts |
| `ajax.googleapis.com` | jQuery, Google libs |
| `code.jquery.com` | jQuery |
| `cdn.tailwindcss.com` | Tailwind CSS |
| `cdn.bokeh.org` | Bokeh |
| `fonts.googleapis.com` | Google Fonts |

### Adding a New CDN Domain

1. Add the domain to `manifest.yml` under `permissions.external.scripts` (or `styles`)
2. Deploy: `forge deploy --environment production`
3. Upgrade site: `forge install --upgrade` (required to approve new domains)

```yaml
permissions:
  external:
    scripts:
      - "https://new-cdn.example.com"   # add here
```

## Project Structure

```
forge-html-renderer/
├── manifest.yml              # Forge app config (scopes, CSP, CDN domains)
├── package.json              # Backend dependencies
├── src/
│   └── index.js              # Forge resolvers (attachment API, upload, KVS)
└── static/
    ├── package.json          # Frontend dependencies (React, Vite)
    ├── vite.config.js        # Vite build config
    ├── index.html            # Entry HTML
    ├── images/
    │   └── icon.svg          # Macro icon
    └── src/
        ├── index.jsx         # React entry
        └── App.jsx           # Main component
```

## Setup & Deployment

### Prerequisites

- Node.js 22+
- [Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/): `npm install -g @forge/cli`
- Atlassian account (any Confluence Cloud site)
- Site admin access (required to install apps)

### Step 1: Clone and Install

```bash
git clone https://github.com/leecoder/forge-html-renderer.git
cd forge-html-renderer
npm install
cd static && npm install && cd ..
```

### Step 2: Forge CLI Login

Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens

```bash
npm install -g @forge/cli
forge settings set usage-analytics false
forge login --email YOUR_EMAIL --token YOUR_API_TOKEN --non-interactive
```

> **Corporate proxy (self-signed cert)?** Add `export NODE_TLS_REJECT_UNAUTHORIZED=0` before running forge commands.

### Step 3: Register the App

```bash
forge register
```

This creates a Developer Space (if needed) and updates `manifest.yml` with your app ID.

### Step 4: Build and Deploy

```bash
cd static && npm run build && cd ..
forge deploy --environment production
```

### Step 5: Install on Your Confluence Site

```bash
forge install --site YOUR_SITE.atlassian.net --product confluence --environment production
```

If you don't have site-admin access, generate an installation link:

1. Go to https://developer.atlassian.com/console
2. Find your app → Distribution → Edit → Set to "Sharing"
3. Check "Confluence" under installation targets
4. Copy the installation link and share with your site admin

### Step 6: Distribute Internally (Optional)

To allow other Confluence sites to install:

1. Deploy to production: `forge deploy --environment production`
2. Developer Console → Distribution → Set "Sharing" status
3. Share the installation link with other site admins

### Subsequent Deployments

```bash
cd static && npm run build && cd ..
forge deploy --environment production
```

If you added new CDN domains or scopes:
```bash
forge install --upgrade --site YOUR_SITE.atlassian.net --product confluence --environment production
```

## How It Works

1. **Attachment API** (v2) — lists and downloads HTML attachments from the current page
2. **Forge KVS** — stores selected file + height per macro instance
3. **srcdoc iframe** — renders HTML with `sandbox="allow-scripts allow-same-origin allow-popups"`
4. **CSP** — `unsafe-inline` + `unsafe-eval` enabled for script/style execution
5. **postMessage** — injected height-reporter script communicates content height to parent
6. **Edit detection** — `context.extension.isEditing` controls toolbar visibility

## Known Limitations

| Limitation | Cause | Workaround |
|------------|-------|------------|
| No "open in new tab" | Forge sandbox blocks popups + Confluence forces HTML download | Set large height for full view |
| CDN wildcard not supported | Forge manifest rejects `https://*` | Explicitly list each CDN domain |

## Security

- HTML runs inside `sandbox="allow-scripts allow-same-origin allow-popups"` iframe
- CSP: `unsafe-inline` + `unsafe-eval` (required for inline scripts in attachments)
- All API calls use `api.asUser()` — operates under logged-in user's permissions
- Forge KVS stores only file selection metadata, not content
- App runs on Atlassian infrastructure — no external server

## License

MIT
