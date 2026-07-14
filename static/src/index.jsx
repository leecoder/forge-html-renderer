import React from "react";
import ReactDOM from "react-dom/client";
import { view } from "@forge/bridge";
import App from "./App";
import Config from "./Config";

const root = ReactDOM.createRoot(document.getElementById("root"));

view.getContext().then((context) => {
  const isConfigView = context?.extension?.type === "macro:config";
  if (isConfigView) {
    root.render(
      <React.StrictMode>
        <Config />
      </React.StrictMode>
    );
  } else {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
});
