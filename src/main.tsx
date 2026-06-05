import { createRoot } from "react-dom/client";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { RootWithInitialSplash } from "./RootWithInitialSplash";

initSentry();

document.documentElement.classList.remove("dark");

createRoot(document.getElementById("root")!).render(
  <RootWithInitialSplash />,
);
