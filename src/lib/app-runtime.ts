import type { AppSpec, Tab, Theme } from "./types";

// Returns the full HTML document served at /a/$slug.
// Uses tailwind CDN + tiny hash router, no service worker.
export function renderAppHTML(opts: {
  slug: string;
  title: string;
  theme: Theme;
  iconUrl: string | null;
  tabs: Tab[];
  manifestUrl: string;
  appDataEndpoint: string; // e.g. /api/public/app-data/<slug>
}): string {
  const { title, theme, iconUrl, tabs, manifestUrl, appDataEndpoint } = opts;

  const safeTabs = tabs.map((t, i) => ({
    name: t.name || `Tab ${i + 1}`,
    icon: t.icon || "•",
    html: t.html || "",
  }));

  const tabsJSON = JSON.stringify(safeTabs);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHTML(title)}</title>
<link rel="manifest" href="${manifestUrl}" />
<meta name="theme-color" content="${theme.primary}" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="${escapeHTML(title)}" />
${iconUrl ? `<link rel="apple-touch-icon" href="${iconUrl}" />` : ""}
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root {
    --primary: ${theme.primary};
    --background: ${theme.background};
    --foreground: ${theme.foreground};
    --accent: ${theme.accent};
  }
  html, body { background: var(--background); color: var(--foreground); height: 100%; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; padding-bottom: 72px; }
  main { min-height: calc(100vh - 72px); }
  .gen-btn-primary { background: var(--primary); color: #fff; padding: .625rem 1rem; border-radius: .5rem; font-weight: 600; }
  .gen-card { background: color-mix(in oklab, var(--foreground) 4%, transparent); border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent); border-radius: .75rem; padding: 1rem; }
  .tabbar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--background); border-top: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent); display: flex; padding-bottom: env(safe-area-inset-bottom, 0); }
  .tabbar a { flex: 1; padding: .75rem .25rem; text-align: center; color: color-mix(in oklab, var(--foreground) 60%, transparent); font-size: .75rem; line-height: 1.1; text-decoration: none; }
  .tabbar a.active { color: var(--primary); }
  .tabbar a .icon { display: block; font-size: 1.25rem; margin-bottom: 2px; }
  input, textarea, select { background: transparent; border: 1px solid color-mix(in oklab, var(--foreground) 20%, transparent); border-radius: .5rem; padding: .5rem .75rem; color: var(--foreground); width: 100%; }
</style>
</head>
<body>
<main id="app-main"><div class="p-6 text-center opacity-70">Loading…</div></main>
<nav class="tabbar" id="tabbar"></nav>
<script>
window.__APP_ENDPOINT__ = ${JSON.stringify(appDataEndpoint)};
window.__APP_SLUG__ = ${JSON.stringify(opts.slug)};
// Per-device key for app-data syncing.
(function(){
  try {
    var k = localStorage.getItem("__app_device_key__");
    if (!k) { k = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()); localStorage.setItem("__app_device_key__", k); }
    window.__APP_DEVICE_KEY__ = k;
  } catch(e) {}
})();
window.appStorage = {
  async get(key, fallback) {
    try {
      var v = localStorage.getItem("app:" + key);
      return v == null ? fallback : JSON.parse(v);
    } catch(e) { return fallback; }
  },
  async set(key, value) {
    try { localStorage.setItem("app:" + key, JSON.stringify(value)); } catch(e) {}
  },
};

const TABS = ${tabsJSON};

function renderTabbar(activeIdx){
  const bar = document.getElementById("tabbar");
  bar.innerHTML = TABS.map((t,i)=>'<a href="#/'+i+'" class="'+(i===activeIdx?"active":"")+'"><span class="icon">'+escapeHtml(t.icon)+'</span>'+escapeHtml(t.name)+'</a>').join("");
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function runScriptsIn(container){
  container.querySelectorAll("script").forEach(old => {
    const s = document.createElement("script");
    for (const a of old.attributes) s.setAttribute(a.name, a.value);
    s.textContent = old.textContent;
    old.replaceWith(s);
  });
}

function route(){
  let idx = parseInt((location.hash.match(/^#\\/(\\d+)/) || [])[1] || "0", 10);
  if (isNaN(idx) || idx < 0 || idx >= TABS.length) idx = 0;
  const main = document.getElementById("app-main");
  main.innerHTML = '<div class="px-4 pt-4">' + TABS[idx].html + '</div>';
  runScriptsIn(main);
  renderTabbar(idx);
  window.scrollTo(0,0);
}
window.addEventListener("hashchange", route);
route();
</script>
</body>
</html>`;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
