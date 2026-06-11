import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface PreviewIframeProps {
  srcDoc: string;
  className?: string;
}

export function PreviewIframe({ srcDoc, className }: PreviewIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: only accept messages from our own iframe's content window
      if (event.source !== iframeRef.current?.contentWindow) return;

      if (event.data?.type === "error" && typeof event.data.message === "string") {
        const msg = event.data.message as string;
        console.error("[Preview Error]:", msg);
        toast.error(`Preview Error: ${msg.slice(0, 80)}${msg.length > 80 ? "…" : ""}`);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Injected script runs inside the sandbox and forwards runtime errors to the parent.
  const enhancedSrcDoc = `<script>
(function(){
  function send(msg){ try { window.parent.postMessage({ type: 'error', message: String(msg) }, '*'); } catch(_){} }
  window.addEventListener('error', function(e){ send(e.message || e.error || 'Unknown error'); });
  window.addEventListener('unhandledrejection', function(e){ send((e.reason && (e.reason.message || e.reason)) || 'Unhandled rejection'); });
  var origErr = console.error;
  console.error = function(){ try { send(Array.from(arguments).join(' ')); } catch(_){} origErr.apply(console, arguments); };
})();
</script>
${srcDoc}`;

  return (
    <iframe
      ref={iframeRef}
      title="App preview"
      srcDoc={enhancedSrcDoc}
      sandbox="allow-scripts"
      className={className}
    />
  );
}
