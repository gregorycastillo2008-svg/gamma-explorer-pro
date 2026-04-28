import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
