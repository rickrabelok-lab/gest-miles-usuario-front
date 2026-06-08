import { createRoot } from "react-dom/client";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { installChunkReloadGuard } from "./lib/chunkReloadGuard";
import { RootWithInitialSplash } from "./RootWithInitialSplash";

initSentry();
installChunkReloadGuard();

document.documentElement.classList.remove("dark");

createRoot(document.getElementById("root")!).render(
  <RootWithInitialSplash />,
);
