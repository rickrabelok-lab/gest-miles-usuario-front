import { createRoot } from "react-dom/client";
import "./index.css";
import { RootWithInitialSplash } from "./RootWithInitialSplash";

document.documentElement.classList.remove("dark");

createRoot(document.getElementById("root")!).render(
  <RootWithInitialSplash />,
);
