import { createRoot } from "react-dom/client";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { installChunkReloadGuard } from "./lib/chunkReloadGuard";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";

initSentry();
installChunkReloadGuard();

document.documentElement.classList.remove("dark");

// O "splash" agora é o esqueleto estático do index.html: aparece no 1º frame e o React
// o substitui no primeiro commit do render — sem timer mínimo, sem espera artificial.
createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
