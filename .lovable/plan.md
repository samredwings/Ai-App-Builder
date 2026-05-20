## AI App Builder for non-technical users

A web app where someone describes an app idea in plain English and gets back a working **multi-page** mini-app they can preview, refine with chat, tweak visually, and install on their phone.

### What the user experiences

1. **Landing** — "Describe your app idea." One big input.
2. **Generation** — AI classifies the request, picks a template family (tracker / list / planner / catalog / utility / social-lite), and generates a multi-page app with bottom-tab navigation, an icon, and a color theme.
3. **Editor** — three panels:
   - **Phone-frame preview** (sandboxed iframe) showing the live app
   - **Chat** for refinement: "add a notes tab," "make it about plants," "remember entries between sessions"
   - **Visual edit** for no-cost tweaks: theme colors, app name, icon re-roll, tab labels, show/hide tabs
4. **Versions** — every chat refinement saves a revision. One-click revert.
5. **Install on phone** — Publish gives a public URL. Two install paths:
   - **Add to Home Screen** (works instantly on Android + iOS, no store)
   - **"Get APK" button** that hands the published URL to [PWABuilder.com](https://www.pwabuilder.com/) — a free Microsoft-run tool that wraps the PWA into a real signed APK in ~2 minutes. We don't build the APK ourselves (Lovable's sandbox can't), but PWABuilder does, and it's the only realistic path to a real APK for a non-technical user.
6. **Dashboard** — grid of the user's generated apps with thumbnails.

### Why no APK build inside Lovable

Lovable runs in the browser and has no Android SDK / Gradle / JDK. A "zip of source for APK Editor Pro / MT Manager" doesn't help because those tools *patch existing APKs*, they don't compile source. The PWABuilder handoff is the honest path that delivers a real signed APK to someone who can't open a terminal.

### Quality-first generation pipeline

Open-ended generation breaks ~40% of the time without guardrails. The pipeline enforces quality at every step:

1. **Classify** — AI categorizes the request into a template family + decides 2–5 tabs needed
2. **Generate** — AI fills the chosen template with structured tool-call output: `{ title, tabs: [{name, icon, html}], theme, icon_prompt, persistence: "local" | "synced" }`
3. **Validate** — server parses every tab's HTML, checks no console errors, confirms each tab link has a target, confirms required elements exist
4. **Auto-retry once** if validation fails, feeding the errors back to the model
5. **Generate icon** via image model from `icon_prompt`
6. Save as v1; show in editor

### Scope guardrails (what the generator CAN'T produce)

Hard refusals baked into the system prompt — keeps output safe, lawful, and reliably working:
- No login/signup screens, no payment forms, no fake "premium" toggles
- No third-party SDKs, no external API keys
- No multi-user backends (data is per-device or per-app anonymous)
- Single HTML file per tab, vanilla JS + Tailwind CDN, no build step

### Technical section

**Stack additions**
- Enable **Lovable Cloud** (auth + Postgres + storage)
- Use **Lovable AI Gateway**:
  - `google/gemini-3-flash-preview` — classify + visual edits
  - `openai/gpt-5` — main app generation (quality matters more than speed here)
  - `google/gemini-3.1-flash-image-preview` — app icons

**Database**
- `projects` — `id`, `owner_id`, `slug` (unique, public URL), `title`, `prompt`, `template_family`, `icon_url`, `theme` (jsonb), `current_version_id`, `is_published`, `created_at`, `updated_at`. RLS: owner CRUD; published rows publicly readable.
- `project_versions` — `id`, `project_id`, `version_num`, `tabs` (jsonb: `[{name, icon, html_content}]`), `created_at`, `created_by_message`. RLS: owner only.
- `project_messages` — chat history per project (`project_id`, `role`, `content`, `version_id_after`, `created_at`). RLS: owner only.
- `app_data` — optional per-generated-app KV store for apps the user marked "synced": `project_id`, `device_key` (anonymous), `key`, `value` (jsonb). Public read/write scoped by `device_key`.
- Storage bucket `app-icons` (public read).

**Routes** (TanStack Start file-based)
```
/                          → marketing landing
/auth                      → email auth
/_authenticated/dashboard  → projects grid
/_authenticated/new        → prompt input
/_authenticated/editor/$id → preview + chat + visual edit
/a/$slug                   → public app shell (loads tabs, hash router inside)
/api/public/manifest/$slug → dynamic web manifest per app (PWA install)
```

**Server functions** (`createServerFn`, all `requireSupabaseAuth` except public manifest):
- `classifyAndGenerate({ prompt })` — runs the full pipeline; returns new project
- `refineProject({ projectId, message })` — chat refinement, creates new version
- `revertToVersion({ projectId, versionId })`
- `updateTheme({ projectId, theme })` — visual edits
- `regenerateIcon({ projectId, prompt })`
- `publishProject({ projectId })`

**Generated app runtime** (what's served at `/a/$slug`)
- Single HTML shell with: theme CSS vars, web manifest link, theme-color meta, tiny hash router (~30 LOC), bottom tab bar
- Each tab's HTML injected into a `<main>` container on hash change
- For "synced" apps: small JS helper that reads/writes via `fetch` to `/api/public/app-data/$slug` using a device key stored in localStorage
- Renders inside `<iframe srcdoc>` with strict CSP in the editor — broken JS in a generated app never crashes the editor

**PWA install (manifest-only, no service worker)**
- `/api/public/manifest/$slug` returns JSON: `name`, `short_name`, `start_url: /a/{slug}`, `display: standalone`, `theme_color`, `icons` (from stored icon)
- No service worker — they break Lovable's preview and aren't needed for Add-to-Home-Screen
- "Get APK" button: opens `https://www.pwabuilder.com/reportcard?site={publishedUrl}` in a new tab

**Visual edit panel (no AI cost)**
- Color pickers → write to `theme` jsonb → re-injected into preview
- App name + tab label inputs
- Tab visibility toggles
- Icon re-roll button (re-prompts image model — costs 1 image gen)

### Build order

1. Lovable Cloud + tables + RLS + storage bucket + auth
2. Dashboard shell + `/new` page
3. **Generation pipeline**: classify → generate → validate → retry → save (text-only first)
4. `/editor/$id` with sandboxed iframe preview + chat refinement + version revert
5. Public `/a/$slug` route + hash router runtime + manifest endpoint
6. Visual edit panel + icon generation + theme application
7. Publish flow + PWABuilder handoff button
8. Landing page + polish

### Explicitly out of scope for v1

- Real APK builds inside Lovable
- Generated apps with login/auth/payments
- Multi-user collaboration on a generated app
- Custom domains per generated app
- iOS App Store / Play Store submission (PWABuilder handles this if user wants to pay $25 once for a Play Console account)

I'd recommend starting with steps 1–3 so you can see the core generation loop end-to-end, then iterating. Want me to start building?
