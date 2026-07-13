import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./AppContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><AppProvider><App/></AppProvider></BrowserRouter></StrictMode>,
);

if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
