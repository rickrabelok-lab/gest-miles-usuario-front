// scripts/n8n/push-workflow.mjs — cria/atualiza workflow no n8n da casa.
// Uso: node scripts/n8n/push-workflow.mjs <arquivo.workflow.json> [workflowId]
import { readFileSync } from 'node:fs'

const SECRETS = 'C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json'
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync(SECRETS, 'utf8'))
const [, , file, workflowId] = process.argv
if (!file) {
  console.error('uso: node scripts/n8n/push-workflow.mjs <arquivo.workflow.json> [workflowId]')
  process.exit(1)
}
const wf = JSON.parse(readFileSync(file, 'utf8'))
const base = `${N8N_URL.replace(/\/$/, '')}/api/v1/workflows`
const res = await fetch(workflowId ? `${base}/${workflowId}` : base, {
  method: workflowId ? 'PUT' : 'POST',
  headers: {
    'X-N8N-API-KEY': N8N_API_KEY,
    'content-type': 'application/json',
    // Cloudflare bloqueia UA não-browser (erro 1010) na frente do n8n da casa.
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126',
  },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings ?? {} }),
})
const body = await res.json()
if (!res.ok) {
  console.error('n8n respondeu', res.status, JSON.stringify(body).slice(0, 500))
  process.exit(1)
}
console.log(`ok: workflow ${body.id} (${body.name})`)
