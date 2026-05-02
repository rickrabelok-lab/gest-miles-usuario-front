# Milhas Vencendo Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the non-gestor card list in VencimentosPage to use urgency-band grouping, avatar initials, and a clean card layout — replacing the old flat bordered-card style.

**Architecture:** All changes are confined to `src/pages/VencimentosPage.tsx`. Helper functions are added as module-level constants/functions. The gestor view is completely untouched; only the non-gestor (`!isGestor`) rendering path changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS

---

### Task 1: Utility helpers + expired filter

**Files:**
- Modify: `src/pages/VencimentosPage.tsx`

- [ ] **Step 1: Add module-level helpers after the `urgencyConfig` block (around line 43)**

Add the following three helpers after `urgencyConfig`:

```typescript
const AVATAR_GRADIENTS: [string, string][] = [
  ["from-red-600", "to-rose-500"],
  ["from-purple-700", "to-violet-500"],
  ["from-orange-500", "to-amber-400"],
  ["from-blue-700", "to-blue-500"],
  ["from-green-700", "to-green-500"],
  ["from-indigo-700", "to-indigo-500"],
];

const getAvatarGradient = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const [from, to] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  return `bg-gradient-to-br ${from} ${to}`;
};

const getInitials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

const formatDataVencimento = (dateStr: string): string => {
  // dateStr is "DD/MM/YYYY" from toLocaleDateString pt-BR
  const [d, m, y] = dateStr.split("/");
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
};
```

- [ ] **Step 2: Filter expired items from `meusVencimentos`**

In `meusVencimentos` useMemo (around line 109), change the final return from:

```typescript
return items.sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 200);
```

To:

```typescript
return items
  .filter((i) => i.diasRestantes > 0)
  .sort((a, b) => a.diasRestantes - b.diasRestantes)
  .slice(0, 200);
```

- [ ] **Step 3: Remove dead state — `meusCounts` and `filteredMeus`**

Delete the `meusCounts` useMemo block (around lines 112–116):

```typescript
// DELETE this entire block:
const meusCounts = useMemo(() => ({
  critico: meusVencimentos.filter((i) => i.diasRestantes <= 30).length,
  atencao: meusVencimentos.filter((i) => i.diasRestantes > 30 && i.diasRestantes <= 60).length,
  ok: meusVencimentos.filter((i) => i.diasRestantes > 60).length,
}), [meusVencimentos]);
```

Delete the `filteredMeus` useMemo block (around lines 118–126):

```typescript
// DELETE this entire block:
const filteredMeus = useMemo(() => {
  const q = search.trim().toLowerCase();
  return meusVencimentos.filter((item) => {
    const matchesSearch = !q || item.programName.toLowerCase().includes(q);
    const matchesFilter =
      filter === "todos" || getUrgency(item.diasRestantes) === filter;
    return matchesSearch && matchesFilter;
  });
}, [meusVencimentos, search, filter]);
```

- [ ] **Step 4: Add `meusBands` useMemo after `meusVencimentos`**

Add this useMemo right after the `meusVencimentos` useMemo:

```typescript
const meusBands = useMemo(
  () => ({
    critico: meusVencimentos.filter((i) => i.diasRestantes <= 30),
    atencao: meusVencimentos.filter((i) => i.diasRestantes > 30 && i.diasRestantes <= 60),
    ok: meusVencimentos.filter((i) => i.diasRestantes > 60),
  }),
  [meusVencimentos],
);
```

- [ ] **Step 5: Update derived helpers that reference removed state**

Replace the `counts` and `isListEmpty` lines (around lines 145–146):

```typescript
// BEFORE:
const counts = isGestor ? gestorCounts : meusCounts;
const isListEmpty = isGestor ? filteredGestor.length === 0 : filteredMeus.length === 0;
const hasAnyData = isGestor ? vencimentosOrdenados.length > 0 : meusVencimentos.length > 0;
```

```typescript
// AFTER:
const counts = gestorCounts;
const isListEmpty = filteredGestor.length === 0;
const hasAnyData = vencimentosOrdenados.length > 0;
```

- [ ] **Step 6: Check TypeScript compiles with no errors**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors. If there are errors about `filteredMeus` or `meusCounts` still being referenced, find and remove those references.

- [ ] **Step 7: Commit**

```bash
git add src/pages/VencimentosPage.tsx
git commit -m "refactor: add avatar/date helpers, filter expired, remove dead meus state"
```

---

### Task 2: New card + band header render functions

**Files:**
- Modify: `src/pages/VencimentosPage.tsx`

- [ ] **Step 1: Add `renderMeuBandHeader` function inside `VencimentosPage`**

Add this function after `renderGestorCard` (around line 225):

```typescript
const renderMeuBandHeader = (
  variant: "critico" | "atencao" | "ok",
  label: string,
  pill: string,
) => {
  const colors =
    variant === "critico"
      ? { dot: "bg-red-500", title: "text-red-700", pill: "bg-red-50 text-red-700" }
      : variant === "atencao"
      ? { dot: "bg-amber-500", title: "text-amber-800", pill: "bg-amber-50 text-amber-800" }
      : { dot: "bg-green-500", title: "text-green-800", pill: "bg-green-50 text-green-800" };
  return (
    <div className="flex items-center gap-2 px-0.5">
      <div className={`h-2 w-2 flex-shrink-0 rounded-full ${colors.dot}`} />
      <span className={`flex-1 text-[11px] font-extrabold uppercase tracking-wide ${colors.title}`}>
        {label}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${colors.pill}`}>
        {pill}
      </span>
    </div>
  );
};
```

- [ ] **Step 2: Add `renderMeuCard2` function (replaces `renderMeuCard`)**

Add this function after `renderMeuBandHeader`:

```typescript
const renderMeuCard2 = (item: VencimentoMeuItem) => {
  const urgency = getUrgency(item.diasRestantes);
  const dayColor =
    urgency === "critico"
      ? "text-red-500"
      : urgency === "atencao"
      ? "text-amber-500"
      : "text-green-500";
  return (
    <div
      key={`${item.programName}-${item.data}`}
      className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
    >
      <div
        className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] text-[11px] font-black text-white ${getAvatarGradient(item.programName)}`}
      >
        {getInitials(item.programName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-bold text-gray-900">{item.programName}</div>
        <div className="mt-0.5 text-[10px] text-gray-400">
          {item.quantidade.toLocaleString("pt-BR")} pts · {formatDataVencimento(item.data)}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className={`text-[14px] font-black leading-none ${dayColor}`}>
          {item.diasRestantes}
        </div>
        <div className="mt-0.5 text-[9px] font-semibold text-gray-400">dias</div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Verify TypeScript with no errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/VencimentosPage.tsx
git commit -m "feat: add renderMeuCard2 and renderMeuBandHeader for new band layout"
```

---

### Task 3: Wire up JSX

**Files:**
- Modify: `src/pages/VencimentosPage.tsx`

- [ ] **Step 1: Update header — add count badge for non-gestor + rename title**

Find the header `<h1>` inside the `<header>` block (around line 272):

```tsx
// BEFORE:
<h1 className="text-[15px] font-bold tracking-tight text-gray-900">Vencendo</h1>
```

```tsx
// AFTER:
<div className="flex items-center gap-2">
  <h1 className="text-[15px] font-bold tracking-tight text-gray-900">
    Milhas Vencendo
  </h1>
  {!isGestor && meusVencimentos.length > 0 && (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
      {meusVencimentos.length} {meusVencimentos.length === 1 ? "programa" : "programas"}
    </span>
  )}
</div>
```

- [ ] **Step 2: Make search bar gestor-only**

Find the `{/* Search */}` block (around line 296). Wrap the entire `<div className="relative">` in `{isGestor && (...)}`  :

```tsx
// BEFORE:
{/* Search */}
<div className="relative">
  <Search ... />
  <input ... />
</div>
```

```tsx
// AFTER:
{/* Search */}
{isGestor && (
  <div className="relative">
    <Search ... />
    <input ... />
  </div>
)}
```

- [ ] **Step 3: Make filter chips gestor-only**

Find (around line 312):

```tsx
{/* Filter chips */}
{hasAnyData && renderChips()}
```

Replace with:

```tsx
{/* Filter chips */}
{isGestor && hasAnyData && renderChips()}
```

- [ ] **Step 4: Replace non-gestor list section with band layout**

Find the `{/* List */}` block (around line 314). Replace the entire conditional:

```tsx
// BEFORE:
{isListEmpty ? (
  <p className="py-10 text-center text-[13px] text-gray-400">
    {search || filter !== "todos"
      ? "Nenhum cliente encontrado para o filtro selecionado."
      : "Nenhum vencimento nos próximos dias na carteira."}
  </p>
) : isGestor ? (
  <div className="flex flex-col gap-1.5">
    {filteredGestor.map((item, idx) => renderGestorCard(item, idx))}
  </div>
) : (
  <div className="flex flex-col gap-1.5">
    {filteredMeus.map((item, idx) => renderMeuCard(item, idx))}
  </div>
)}
```

```tsx
// AFTER:
{isGestor ? (
  isListEmpty ? (
    <p className="py-10 text-center text-[13px] text-gray-400">
      {search || filter !== "todos"
        ? "Nenhum cliente encontrado para o filtro selecionado."
        : "Nenhum vencimento nos próximos dias na carteira."}
    </p>
  ) : (
    <div className="flex flex-col gap-1.5">
      {filteredGestor.map((item, idx) => renderGestorCard(item, idx))}
    </div>
  )
) : meusVencimentos.length === 0 ? (
  <div className="flex flex-col items-center gap-3 py-14 text-center">
    <span className="text-5xl opacity-20">🎉</span>
    <p className="text-[14px] font-bold text-gray-700">Tudo em dia!</p>
    <p className="text-[12px] leading-relaxed text-gray-400">
      Nenhuma milha vencendo nos próximos dias.
    </p>
  </div>
) : (
  <div className="flex flex-col gap-3">
    {meusBands.critico.length > 0 && (
      <div className="flex flex-col gap-2">
        {renderMeuBandHeader("critico", "Crítico", "≤ 30 dias")}
        <div className="flex flex-col gap-1.5">
          {meusBands.critico.map(renderMeuCard2)}
        </div>
      </div>
    )}
    {meusBands.critico.length > 0 && meusBands.atencao.length > 0 && (
      <div className="h-px bg-gray-200" />
    )}
    {meusBands.atencao.length > 0 && (
      <div className="flex flex-col gap-2">
        {renderMeuBandHeader("atencao", "Atenção", "31 – 60 dias")}
        <div className="flex flex-col gap-1.5">
          {meusBands.atencao.map(renderMeuCard2)}
        </div>
      </div>
    )}
    {(meusBands.critico.length > 0 || meusBands.atencao.length > 0) &&
      meusBands.ok.length > 0 && <div className="h-px bg-gray-200" />}
    {meusBands.ok.length > 0 && (
      <div className="flex flex-col gap-2">
        {renderMeuBandHeader("ok", "Tranquilo", "> 60 dias")}
        <div className="flex flex-col gap-1.5">
          {meusBands.ok.map(renderMeuCard2)}
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Delete the now-unused `renderMeuCard` function**

Remove the entire `renderMeuCard` function (the old one that used `cfg.cardBorder` and Fragment, around lines 227–258).

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Start dev server and verify in browser**

```bash
npm run dev
```

Open http://localhost:3082 and navigate to "Milhas Vencendo" as a non-gestor user. Verify:
- Header shows "Milhas Vencendo" with program count badge
- No search bar shown
- No filter chips shown
- Each faixa (Crítico / Atenção / Tranquilo) has colored header with dot + label + pill
- Cards show avatar with gradient initials, program name, pts + formatted date, days in urgency color
- Empty state (🎉) shown if no valid programs

- [ ] **Step 8: Commit**

```bash
git add src/pages/VencimentosPage.tsx
git commit -m "feat: redesign Milhas Vencendo user view with urgency bands and avatar cards"
```
