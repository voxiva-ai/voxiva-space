import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import "./styles/index.css";

async function start() {
  const root = document.getElementById("root") as HTMLElement;
  if (window.voxiva && !localStorage.getItem("voxiva-space-state-v1")) {
    try {
      const raw = await window.voxiva.invoke("read_legacy_state") as string | null;
      if (raw) localStorage.setItem("voxiva-space-state-v1", raw);
    } catch {
      const heading = document.createElement("h2");
      heading.textContent = "Could not import the previous Voxiva Space workspaces";
      const hint = document.createElement("p");
      hint.textContent = "Close the previous app and restart Voxiva Space. Your old data has not been changed.";
      root.replaceChildren(heading, hint);
      return;
    }
  }
  ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
}

void start();
