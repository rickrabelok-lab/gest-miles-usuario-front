import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import App from "./App.tsx";
import "./index.css";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { InitialSplashScreen } from "./components/loading/InitialSplashScreen";

document.documentElement.classList.remove("dark");

const FALLBACK_SPLASH_MIN_MS = 1200;
const FALLBACK_SPLASH_MAX_MS = 4000;
const APP_BOOT_READY_EVENT = "gest-miles:usuario-boot-ready";

const readSplashDurationMs = (
  envValue: string | undefined,
  fallbackMs: number,
  minAllowedMs: number,
  maxAllowedMs: number,
) => {
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed)) return fallbackMs;
  const normalized = Math.round(parsed);
  return Math.min(Math.max(normalized, minAllowedMs), maxAllowedMs);
};

const INITIAL_SPLASH_MIN_MS = readSplashDurationMs(
  import.meta.env.VITE_SPLASH_MIN_MS,
  FALLBACK_SPLASH_MIN_MS,
  0,
  10_000,
);
const INITIAL_SPLASH_MAX_MS = Math.max(
  INITIAL_SPLASH_MIN_MS,
  readSplashDurationMs(import.meta.env.VITE_SPLASH_MAX_MS, FALLBACK_SPLASH_MAX_MS, 300, 20_000),
);

function RootWithInitialSplash() {
  const [showSplash, setShowSplash] = useState(true);
  const [minDelayDone, setMinDelayDone] = useState(false);
  const [appBootReady, setAppBootReady] = useState(false);

  useEffect(() => {
    const minTimeoutId = window.setTimeout(() => setMinDelayDone(true), INITIAL_SPLASH_MIN_MS);
    const maxTimeoutId = window.setTimeout(() => setShowSplash(false), INITIAL_SPLASH_MAX_MS);
    const onBootReady = () => setAppBootReady(true);

    window.addEventListener(APP_BOOT_READY_EVENT, onBootReady);

    return () => {
      window.clearTimeout(minTimeoutId);
      window.clearTimeout(maxTimeoutId);
      window.removeEventListener(APP_BOOT_READY_EVENT, onBootReady);
    };
  }, []);

  useEffect(() => {
    if (minDelayDone && appBootReady) {
      setShowSplash(false);
    }
  }, [minDelayDone, appBootReady]);

  return (
    <>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
      {showSplash ? (
        <InitialSplashScreen appName="VOA" tagline="sua próxima viagem começa aqui" />
      ) : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <RootWithInitialSplash />,
);
