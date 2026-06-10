// Guarded service-worker registration. Refuses to register in dev, in iframes,
// in Lovable preview hosts, or when `?sw=off` is on the URL. In any refused
// context it actively unregisters any existing `/sw.js` so a stale worker
// from an earlier session can't keep serving cached HTML.

const SW_URL = "/sw.js";

function isPreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function unregisterMatching(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map((r) => {
        const scriptUrl = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
        return scriptUrl.endsWith(SW_URL) ? r.unregister() : Promise.resolve();
      })
    );
  } catch {
    /* ignore */
  }
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const inIframe = window.self !== window.top;
  const url = new URL(window.location.href);
  const swOff = url.searchParams.get("sw") === "off";
  const isProd = import.meta.env.PROD;
  const preview = isPreviewHost(window.location.hostname);

  if (!isProd || inIframe || preview || swOff) {
    void unregisterMatching();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
      /* ignore registration errors */
    });
  });
}
