import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { Releases } from "./Releases.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {window.location.pathname.replace(/\/$/, "") === "/releases" ? <Releases /> : <App />}
  </React.StrictMode>,
);
