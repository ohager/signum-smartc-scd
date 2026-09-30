/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 *
 * The locale is activated before `App` is imported, not merely before it
 * renders: the editor documentation calls `t()` while its modules load, and
 * must see the chosen language when it does.
 */

import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { Crypto } from "@signumjs/crypto";
import { WebCryptoAdapter } from "@signumjs/crypto/adapters";
import { boot } from "./i18n/boot";
import { startApp } from "./start-app";

Crypto.init(new WebCryptoAdapter());

async function start() {
  await boot();
  const elem = document.getElementById("root")!;

  await startApp({
    root: elem,
    importApp: () => import("./App"),
    render: (App) => {
      const app = (
        <StrictMode>
          <App />
        </StrictMode>
      );
      if (import.meta.hot) {
        // With hot module reloading, `import.meta.hot.data` is persisted.
        const root = (import.meta.hot.data.root ??= createRoot(elem));
        root.render(app);
      } else {
        // The hot module reloading API is not available in production.
        createRoot(elem).render(app);
      }
    },
  });
}

void start();
