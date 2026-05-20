import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./assets/css/App.css";
import App from "./App";

if (typeof window !== "undefined" && typeof window.console === "object" && window.console) {
  for (const method of ["log", "warn", "error", "info", "debug", "trace"]) {
    window.console[method] = () => {};
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  React.createElement(
    BrowserRouter,
    null,
    React.createElement(App),
  ),
);
