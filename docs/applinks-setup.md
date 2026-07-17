# Android App Links (https universais) — setup

> **Status: PLACEHOLDER.** O `public/.well-known/assetlinks.json` já existe mas **ainda
> não está funcional** — falta o fingerprint real do Play e o intent-filter `autoVerify`
> no `AndroidManifest.xml`. Fazer **depois** de criar o app no Play Console (o fingerprint
> do certificado de assinatura só existe lá). Até lá, o retorno de auth continua pelo
> **custom scheme** (`br.com.gestmiles.app://auth-callback`), que já funciona.

## O que são App Links aqui

Fazem links `https://<domínio>/...` **abrirem o app direto** (sem o "abrir com" do
Android), verificado automaticamente via Digital Asset Links. São a versão "universal"
do custom scheme atual. Opcional — o custom scheme cobre o fluxo de auth hoje.

## O arquivo `public/.well-known/assetlinks.json`

Vite copia `public/` pra raiz do build, então será servido em
`https://<domínio-do-front>/.well-known/assetlinks.json`. O conteúdo é **agnóstico de
domínio** — quem define o domínio é onde ele é hospedado + o intent-filter do manifest.

Contém dois fingerprints SHA-256 no `sha256_cert_fingerprints`:

1. **`52:F0:14:...:94`** — cert da **upload key** (`android/gestmiles-upload.keystore`).
   Vale pra builds assinados localmente com a upload key (útil em teste). Já é o valor
   real.
2. **`REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FROM_PLAY_CONSOLE`** — **placeholder**. Com
   Play App Signing, o Google re-assina o app com **outra** chave (a de assinatura real,
   que o Google segura). É esse fingerprint que os apps instalados da Play carregam.
   Sem ele, a verificação falha pra quem baixou da loja.

### Como obter o fingerprint real (pós-upload)

Play Console → o app → **Test and release ▸ App integrity ▸ Play app signing** →
copiar o **SHA-256 certificate fingerprint** (formato `AA:BB:CC:...`). Substituir o
placeholder por ele. Pode manter os dois fingerprints no array (upload + Play) pra
funcionar nos dois tipos de build.

> Alternativa rápida: `https://play.google.com/store/apps/datasafety` não serve; use o
> painel App signing. Também dá pra gerar o bloco inteiro pelo **Statement List
> Generator** do Google.

## A outra metade — `AndroidManifest.xml` (ainda NÃO feito)

Pra o Android verificar e rotear os links, o `MainActivity` precisa de um intent-filter
`autoVerify` apontando pro **mesmo domínio** onde o `assetlinks.json` está hospedado.
Adicionar (trocando `<DOMINIO>` pelo domínio real do front, ex.: `app.gestmiles.com.br`):

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="<DOMINIO>" />
    <!-- opcional: restringir a um path, ex.: android:pathPrefix="/auth" -->
</intent-filter>
```

⚠️ Confirmar o **domínio público do front** antes (hoje `VITE_APP_URL` não está fixado;
exemplo no `.env.example` é `app.gestmiles.com.br`). O domínio do intent-filter e o do
host do `assetlinks.json` têm que ser o mesmo.

## Servir o arquivo (Vercel) — já ajustado

O `vercel.json` reescrevia **tudo** (menos `/assets/`) pra `index.html` (fallback SPA),
o que serviria o HTML do app em vez do JSON. O rewrite foi ajustado pra **excluir
`/.well-known/`** também, então o `assetlinks.json` é servido como arquivo estático.
Conferir pós-deploy: `curl https://<domínio>/.well-known/assetlinks.json` deve devolver
o JSON com `content-type: application/json` (não HTML).

## Verificar (pós-setup completo)

- Google Statement List Tester:
  `https://developers.google.com/digital-asset-links/tools/generator`
- No device: `adb shell pm get-app-links br.com.gestmiles.app` (estado da verificação) e
  `adb shell pm verify-app-links --re-verify br.com.gestmiles.app` pra reprocessar.

## Checklist pós-upload

- [ ] Substituir o placeholder pelo SHA-256 do Play App Signing.
- [ ] Confirmar o domínio público do front e adicionar o intent-filter `autoVerify` no `AndroidManifest.xml`.
- [ ] Deploy do front (arquivo no ar em `/.well-known/assetlinks.json`).
- [ ] Rebuild + reupload do app (o manifest mudou).
- [ ] Verificar com o Statement List Tester + `adb shell pm get-app-links`.
