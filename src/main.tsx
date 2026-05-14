import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.PROD) {
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    value: undefined, writable: false, configurable: false,
  });
}

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(<App />);

// Keep the boot-loader visible until React has actually painted content.
// One rAF fires before paint; two rAFs guarantee we're past the first paint.
function fadeLoader() {
  const loader = document.getElementById("allgex-loader");
  if (!loader) return;
  loader.style.transition = "opacity 0.25s ease";
  loader.style.opacity = "0";
  setTimeout(() => loader.remove(), 260);
}

requestAnimationFrame(() => requestAnimationFrame(() => {
  // If root has rendered meaningful children, remove loader.
  if (rootEl.children.length > 0) {
    fadeLoader();
  } else {
    // Fallback: remove after 300ms regardless
    setTimeout(fadeLoader, 300);
  }
}));
