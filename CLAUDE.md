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
| `project_summaries` (view) | dashboard.js — returns `total_tasks`, `completed_tasks`, `total_cost`, `lead_name` |
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
| `tarefas.html` | `tasks.js`, `api.js` | Task board by project |
| `membros.html` | `members.js`, `api.js` | Team management |
| `relatorios.html` | `reports.js` | Reports |
| `previsao_projeto.html` | `project_forecasts.js` | Forecast per project (sub-page) |
| `cadastro_usuario.html` | `cadastro_usuario.js` | Admin-only user registration |
| `configuracoes.html` | `settings.js` | Settings |
| `montecarlo.html` | `montecarlo.js` | Monte Carlo stock forecast — chemical/hydraulic materials; reached from relatorios.html |
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
