---
name: run-resitrat
description: Serve and drive the Resitrat static frontend (Supabase-backed project/stock/cost management app) in a headless browser. Use when asked to run Resitrat, start it, take a screenshot of a page (login, dashboard, requisição de estoque, etc.), or verify a change renders/behaves correctly in the real app.
---

Resitrat is a static HTML+Tailwind (CDN) app with no build step, backed by a
live Supabase project (real auth + real tables). "Running" it just means
serving the directory over HTTP and driving it with a headless Chromium via
`.claude/skills/run-resitrat/driver.mjs` (a minimal chromium-cli-style REPL
built for this skill, since `chromium-cli` isn't available in this
environment). All paths below are relative to the repo root.

## Prerequisites

Node.js and Python 3 are both already present in this environment (verified:
`node v22.14.0`, `python 3.12.9`). No OS packages needed — Chromium is
installed via Playwright, not the system package manager.

## Setup

The driver has its own `package.json` inside the skill folder (kept separate
from the app, which intentionally has none — see "No Build Step" in
`CLAUDE.md`). Install once:

```bash
cd .claude/skills/run-resitrat
npm install
npx playwright install chromium   # idempotent; no-ops if already cached
```

## Run (agent path)

1. Serve the app root (any static server works; this is the one verified):

```bash
python -m http.server 8080 &
timeout 15 bash -c 'until curl -sf http://localhost:8080/login.html >/dev/null; do sleep 0.5; done'
```

2. Drive it by piping commands to the driver (run from
   `.claude/skills/run-resitrat/`):

```bash
node driver.mjs <<'EOF'
nav http://localhost:8080/login.html
wait-for text=Entrar
screenshot login-page
console-errors
EOF
```

Screenshots land in `.claude/skills/run-resitrat/screenshots/<name>.png`
(gitignored — regenerate, don't rely on committed copies).

| command | what it does |
|---|---|
| `nav <url>` | navigate |
| `wait-for <selector>` or `wait-for text=<substring>` | wait up to 15s |
| `click <selector>` or `click text=<substring>` | click |
| `fill <selector> <value>` | fill an input |
| `press <key>` | keyboard press (e.g. `Enter`) |
| `eval <js>` | evaluate JS in page, prints result |
| `screenshot [name]` | full-page PNG |
| `console-errors` | prints any `console.error`/`pageerror` seen so far |
| `sleep <ms>` | wait |
| `quit` / `exit` | close browser early |

Native `alert()`/`confirm()` dialogs are auto-accepted and logged — several
pages in this app use `alert()` for error paths instead of the toast/banner
system (see Gotchas), so don't assume a hang means the driver is stuck.

**Authenticated pages:** there is no test account wired into this repo. To
drive anything past `login.html`, supply real Supabase credentials for a user
that exists in both `auth.users` and `public.users` (see CLAUDE.md's
"Importante" note on role assignment), then:

```bash
node driver.mjs <<'EOF'
nav http://localhost:8080/login.html
wait-for text=Entrar
fill #email SEU_EMAIL_REAL
fill #password SUA_SENHA_REAL
click text=Entrar
wait-for text=Painel
screenshot dashboard
EOF
```

Admins land on `gerenciamentodeprojetos.html`, operators on
`requisicao_estoque.html` (per `auth.js`).

Stop the server when done: `pkill -f "http.server 8080"`.

## Run (human path)

`python -m http.server 8080` (or `npx serve .`), then open
`http://localhost:8080/login.html` in a real browser. Useless headless —
this is just for a human with actual credentials.

## Test

No test suite (`CLAUDE.md`: "No linting or test suite. Validation is done
visually in the browser.") — the driver above **is** the validation path.

---

## Gotchas

- **`signIn()` in `js/auth.js` never rethrows on failure** — it catches the
  Supabase error internally and calls `alert('Credenciais inválidas: ' +
  error.message)`, then returns `undefined`. `login.html`'s own `catch` block
  (which calls `showError()` to populate `#error-banner`) never runs, because
  nothing was thrown. Net effect, verified by driving a failed login: the
  submit button gets stuck showing "Entrando..." forever (its
  `setLoading(false)` reset lives in that unreached catch), and the pretty
  `#error-banner` UI never appears — the only feedback is the native `alert`.
  Don't `wait-for #error-banner` after a failed login; it will time out.
  Instead check the dialog log (the driver auto-accepts and records
  `alert`/`confirm` text) or `console-errors` (auth.js also does
  `console.error('Error signing in:', ...)`).
- **Unauthenticated nav to any protected page redirects to `login.html`
  client-side**, not via HTTP redirect — `auth.js` runs synchronously on load
  and calls `window.location.href`. Confirmed by navigating straight to
  `gerenciamentodeprojetos.html` with no session: the page briefly loads then
  `window.location.pathname` becomes `/login.html` about a second later. Use
  `sleep` (or `wait-for` on a login-page element) after `nav`, not an
  immediate assertion.
- **All RLS policies now require `authenticated`** (see the Security section
  of `CLAUDE.md`) — every table returns `[]` to an anonymous request. There is
  no way to inspect real data through this driver without a logged-in
  session; screenshots of protected pages without credentials will show
  empty states, not an error.

## Troubleshooting

- **`ERR_ABORTED` on `nav`, followed by "Target page ... has been closed"**:
  this happened when the driver's line-reader used `pause()`/`resume()`
  around an async handler — with a piped heredoc, Node's readline buffers and
  emits all `line` events before the pause takes effect, so `quit` ran while
  `nav` was still in flight. Fixed by iterating `for await (const line of rl)`
  instead; if you modify the driver, keep that pattern.
- **Port already in use on `python -m http.server 8080`**: another instance
  is still running from a previous session — `pkill -f "http.server 8080"`
  before relaunching.
