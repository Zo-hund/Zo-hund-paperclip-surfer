import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./AppContext";
import { MemberAuthProvider } from "./member-auth";
import "./styles.css";
import "./event-merch.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><MemberAuthProvider><AppProvider><App/></AppProvider></MemberAuthProvider></BrowserRouter></StrictMode>,
);

if ("serviceWorker" in navigator) {
  const isPrivateSitesHost = location.hostname.endsWith(".chatgpt.site");
  const isLocalHost = location.hostname === "localhost" || location.hostname === "127.0.0.1";

  if (isPrivateSitesHost) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => void registration.unregister());
    });
  } else if (!isLocalHost) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
  }
}
