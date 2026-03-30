/**
 * Aplica supabase/RUN_IN_SUPABASE_ESTE_PRIMEIRO_CS.sql no Postgres do Supabase (via terminal).
 *
 * Uso: npm run db:apply-cs
 *
 * Requer no .env.local (ou .env):
 *   DATABASE_URL=postgresql://postgres.[ref]:[SENHA]@...pooler.supabase.com:5432/postgres
 *
 * Onde pegar: Supabase → Project Settings → Database → Connection string → URI
 * (use a senha que você definiu ao criar o projeto; não é a anon key.)
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
Não encontramos DATABASE_URL.

O terminal NÃO aplica SQL no Supabase sozinho: "npm run dev" só inicia o site.

Opção A — Pelo site (mais simples)
  Supabase → SQL Editor → cole o arquivo supabase/RUN_IN_SUPABASE_ESTE_PRIMEIRO_CS.sql → Run

Opção B — Por este comando
  1) Supabase → Settings → Database → Connection string → URI
  2) Crie .env.local na raiz do projeto com:
     DATABASE_URL=postgresql://postgres.xxx:SUA_SENHA@...pooler.supabase.com:5432/postgres
  3) Rode: npm run db:apply-cs
`);
    process.exit(1);
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("Dependência pg ausente. Rode: npm install");
    process.exit(1);
  }

  const sqlPath = join(__dirname, "..", "supabase", "RUN_IN_SUPABASE_ESTE_PRIMEIRO_CS.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = new pg.default.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(sql);
    console.log("OK: SQL CS aplicado no banco (cs_gestores, cliente_gestores, RLS, funções).");
    console.log("Lembrete: cadastre linhas em cs_gestores (CS ↔ gestor) no Table Editor ou por SQL.");
  } catch (err) {
    console.error("Erro ao rodar o SQL:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
