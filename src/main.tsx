import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
import "./index.css";
import { registerServiceWorker } from "./lib/serviceWorker";

// Register Service Worker for offline support
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
