# Usuario Front Smoke Report - 2026-05-19T11:08Z

## Scope

Local browser-ish smoke using Vite dev server and headless Chrome.

## Commands

- `npm run dev -- --host 127.0.0.1`
- `curl http://127.0.0.1:3081/`
- `google-chrome-stable --headless --no-sandbox --disable-gpu --window-size=1366,768 --screenshot=artifacts/smoke/usuario-home-20260519T1108Z.png http://127.0.0.1:3081/`
- `google-chrome-stable --headless --no-sandbox --disable-gpu --dump-dom http://127.0.0.1:3081/`

## Result

- HTTP: 200
- Screenshot captured: `artifacts/smoke/usuario-home-20260519T1108Z.png`
- App rendered fallback screen: `Configuração do Supabase ausente`

## Interpretation

Smoke is PASS for non-blank rendering and no white-screen crash.

Smoke is BLOCKED for real app workflow because local env lacks:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

This is expected if local env is intentionally absent. I did not create/edit env files.

## Cleanup

Stopped local Vite process after smoke.

## Not executed

No env/secrets, login, production, commit, push, deploy, db push, delete/move or rollback.
