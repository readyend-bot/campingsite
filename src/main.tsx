import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-kr";
import App from "./App";
import { ErrorBoundary } from "./components";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
