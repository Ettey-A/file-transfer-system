// Bootstrap: mount React app into <div id="root"> from index.html
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner"; // Toast notifications
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster richColors position="top-right" />
  </StrictMode>
);
