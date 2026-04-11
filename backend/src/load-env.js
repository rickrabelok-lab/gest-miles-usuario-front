/**
 * Carrega sempre backend/.env em relação a este ficheiro (não depende do cwd).
 * Deve ser o primeiro import em index.js.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

// override: true — se BREVO_* existir mal no ambiente/shell, backend/.env prevalece (dev local).
const { error } = dotenv.config({ path: envPath, override: true });
if (error && error.code !== "ENOENT") {
  console.warn("[load-env]", envPath, error.message);
}
