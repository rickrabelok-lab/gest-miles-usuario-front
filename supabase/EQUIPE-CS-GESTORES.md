# CS, gestores e equipes

**Onde fica a regra:** sempre no **Supabase** (tabelas + RLS). O **Vercel** só hospeda o front; não use Vercel para guardar “quem é da mesma equipe”.

## Duas formas (podem conviver)

### 1) Legado: `cs_gestores`

Uma linha = **um CS** supervisiona **um gestor**.

- **Vários CS no mesmo gestor:** várias linhas com o **mesmo** `gestor_id` e **diferentes** `cs_id`:

```sql
insert into public.cs_gestores (cs_id, gestor_id) values
  ('uuid-cs-1', 'uuid-gestor-a'),
  ('uuid-cs-2', 'uuid-gestor-a');
```

- **Equipes diferentes** (CS A ≠ CS B): cada CS só tem linhas para os gestores que deve ver.

### 2) Equipes nomeadas: `equipes` + `equipe_cs` + `equipe_gestores`

(Migration `20260323130000_equipes_cs_gestores.sql`)

- **`equipes`**: um registro por “equipe” (ex.: “Equipe Sul”, “Equipe Enterprise”).
- **`equipe_cs`**: quais usuários **CS** pertencem à equipe (vários CS na mesma equipe).
- **`equipe_gestores`**: quais **gestores** a equipe supervisiona (vários gestores por equipe).

**Exemplo:** Equipe A supervisiona gestores G1 e G2; CS1 e CS2 entram em `equipe_cs` na Equipe A → ambos enxergam G1 e G2.  
Outra equipe (Equipe B) tem outros `equipe_gestores` → outro conjunto de gestores.

**Quem cadastra:** apenas **admin** (policies `*_write_admin` no Supabase), via SQL Editor ou Table Editor.

**Script pronto (2 equipes):** `RUN_EQUIPES_1_E_2_GESTORES.sql` — Equipe 1 (Rick + Silmara), Equipe 2 (Bolsastart), com gestores por e-mail em `auth.users`. Ajuste o e-mail do CS no bloco `cs_email` ou insira `equipe_cs` manualmente.

**3 CS nas duas equipes:** `RUN_EQUIPE_CS_TRES_RESPONSAVEIS_AMBAS_EQUIPES.sql` — liga `redacted@example.com`, `redacted@example.com` e `redacted@example.com` à Equipe 1 e à Equipe 2 em `equipe_cs`.

**Remover equipe antiga do select (ex. “Gestão Joao Carvalho”):** isso vem de uma linha em `public.equipes`, não do código React. Rode `RUN_REMOVER_EQUIPE_GESTAO_JOAO_CARVALHO.sql` ou apague a linha no Table Editor (`equipes`).

**Mesma carteira para todos os gestores da equipe:** o painel CS agrega no front a **união** dos clientes por equipe. Para o **login como gestor** e para o banco refletirem a mesma regra, rode `RUN_SINCRONIZAR_CLIENTES_TODOS_GESTORES_DA_EQUIPE.sql` (replica vínculos em `cliente_gestores` para cada gestor do grupo). Rode de novo quando entrar cliente novo só em um dos gestores.

Exemplo de cadastro:

```sql
-- 1) Criar equipe
insert into public.equipes (nome) values ('Equipe A') returning id;

-- 2) CS da equipe (substitua UUIDs)
insert into public.equipe_cs (equipe_id, cs_id) values
  ('uuid-equipe', 'uuid-cs-1'),
  ('uuid-equipe', 'uuid-cs-2');

-- 3) Gestores da equipe
insert into public.equipe_gestores (equipe_id, gestor_id) values
  ('uuid-equipe', 'uuid-gestor-1'),
  ('uuid-equipe', 'uuid-gestor-2');
```

**Renomear** (o nome aparece no select “Vincular cliente a uma equipe” no app):

```sql
update public.equipes
  set nome = 'Equipe 1 Rick e Silmaria'
where id = 'uuid-da-equipe';  -- ou: where nome = 'Equipe';
```

A função **`cs_can_access_gestor`** considera **tanto** `cs_gestores` **quanto** equipe.

## App

O hook `useCsGestores` agrega gestores de **`cs_gestores`** e de **`equipe_gestores`** (via `equipe_cs`).
