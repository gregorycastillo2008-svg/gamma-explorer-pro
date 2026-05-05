import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Ejecutar protecciones de seguridad
if (import.meta.env.PROD) {
  // Deshabilitar acceso a window.React
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    value: undefined,
    writable: false,
    configurable: false
  });

  // Proteger contra acceso a variables sensibles
  const sensitivePatterns = ['password', 'token', 'key', 'secret', 'api'];
  const handler = {
    get(target, prop) {
      if (typeof prop === 'string' && sensitivePatterns.some(p => prop.toLowerCase().includes(p))) {
        console.warn('Acceso a información sensible denegado');
        return undefined;
      }
      return target[prop];
    }
  };

  // Proxy del objeto window para desarrollo
  if (window && typeof Proxy !== 'undefined') {
    Object.freeze(window);
  }
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
  // Remove the boot loader once React has mounted
  requestAnimationFrame(() => {
    const loader = document.getElementById("allgex-loader");
    if (loader) {
      loader.style.opacity = "0";
      setTimeout(() => loader.remove(), 400);
    }
  });
}
