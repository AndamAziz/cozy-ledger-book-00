import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
import "./index.css";
import { registerServiceWorker } from "./lib/serviceWorker";
import { initTvMode } from "./lib/tvMode";

// Flag Smart TV / low-memory browsers before first paint so the CSS in
// index.css can strip blur, animations and heavy shadows up front.
initTvMode();

// Register Service Worker for offline support
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
