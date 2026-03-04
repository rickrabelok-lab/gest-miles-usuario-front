/**
 * Aplica o SQL da tabela gestor_clientes no banco Supabase.
 * Uso: npm run db:setup
 * Requer no .env.local: DATABASE_URL=postgresql://... (Supabase → Settings → Database → Connection string URI)
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const root = join(__dirname, "..");
  for (const name of [".env.local", ".env"]) {
    try {
      const path = join(root, name);
      const content = readFileSync(path, "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
      }
    } catch {
      // file not found
    }
  }
  return process.env.DATABASE_URL;
}

async function main() {
  const databaseUrl = loadEnv();
  if (!databaseUrl) {
    console.error(`
Erro: DATABASE_URL não encontrada.

1. No Supabase: Settings → Database → Connection string → URI
2. Copie a URL (começa com postgresql://postgres.[ref]:[senha]@...)
3. Adicione no arquivo .env.local na raiz do projeto:

   DATABASE_URL=postgresql://postgres.xxxxx:SUA_SENHA@aws-0-xx.pooler.supabase.com:5432/postgres

4. Rode de novo: npm run db:setup
`);
    process.exit(1);
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("Instale a dependência: npm install pg");
    process.exit(1);
  }

  const sqlPath = join(__dirname, "..", "supabase", "RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = new pg.default.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(sql);
    console.log("OK: Tabela gestor_clientes criada e policies aplicadas. Pode vincular clientes no app.");
  } catch (err) {
    console.error("Erro ao rodar o SQL:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
