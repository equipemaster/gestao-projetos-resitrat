# CLAUDE.md — Proposta de Login Resitrat (redesign)

Guia da nova tela de **Login** da Resitrat. Mantém 100% da identidade visual do
sistema (azul de marca, Inter, ícones Material Symbols, modo claro/escuro) e
moderniza o layout em painel dividido, com destaque **institucional** (missão e
valores) no lado da marca.

## Arquivos desta proposta (Design Components)

| Arquivo | Papel |
|---|---|
| `Resitrat Login.dc.html` | Canvas de apresentação — mostra os 4 enquadramentos (desktop/mobile × claro/escuro) |
| `LoginDesktop.dc.html` | Tela de login desktop. Prop `theme: "light" \| "dark"` |
| `LoginMobile.dc.html` | Tela de login mobile. Prop `theme: "light" \| "dark"` |

Os componentes são apenas a **referência de design**. A implementação final vai
para `login.html` no stack do projeto (HTML + Tailwind CDN + Supabase), seguindo
o padrão de carregamento de scripts já documentado.

## Estrutura — Painel dividido

Layout em duas colunas no desktop; empilhado no mobile.

### Painel de marca (esquerda, ~56% no desktop / topo no mobile)

Fundo institucional fixo (sempre escuro, nos dois temas):

```
background: linear-gradient(155deg, #0a1233 0%, #15246b 52%, #1d4ed8 135%);
```

Decoração: 2 glows radiais (`rgba(59,130,246,.55)` e `rgba(13,91,236,.45)`) +
overlay de grade (`linear-gradient` 38px, opacidade ~.05) com máscara radial.

Conteúdo, de cima para baixo:
1. **Logo** — ícone `water_drop` (Material Symbols, FILL 1) em caixa
   `46×46`, `border-radius:13px`, gradiente `135deg,#3b82f6→#1d4ed8`. Ao lado:
   wordmark `RESITRAT` (800, letter-spacing `.14em`) + sub `GESTÃO INTEGRADA`.
2. **Missão** — eyebrow `NOSSA MISSÃO` (`#93c5fd`, 10px, letter-spacing `.28em`)
   seguido da frase da missão (27px, weight 700, line-height 1.32).
3. **Valores** — eyebrow `NOSSOS VALORES` + grid de 3 cards "glass"
   (`rgba(255,255,255,.07)`, borda `rgba(255,255,255,.12)`, radius 14):
   - `engineering` — **Excelência técnica**
   - `handshake` — **Transparência**
   - `verified` — **Compromisso**
   Ícone em caixa `32×32` `rgba(59,130,246,.22)` com glifo `#93c5fd`.
4. **Áreas de atuação** — linha discreta:
   `Reservatórios · Filtração · Bombas · Hidráulica · Dosadoras · Eletrólise`.
5. **Copyright** — `© 2026 Resitrat · Sistema interno de gestão`.

> ⚠️ O texto de missão e os valores são **rascunho**. Substituir pela redação
> oficial da empresa antes de publicar.

### Painel de formulário (direita / folha inferior no mobile)

- Fundo: `#f0f2f8` (claro) / `#0c111b` (escuro no desktop, `#101622` no mobile).
- Âncora visual: caixa `52×52` radius 15, gradiente `135deg,#1e3a8a→#2563eb`,
  ícone `lock` branco (FILL 1).
- Título `Bem-vindo de volta` (800) + subtítulo.
- Campo **E-mail**: input altura 48, radius 11, ícone `mail` à esquerda.
- Campo **Senha**: ícone `lock` à esquerda + botão olho à direita
  (`visibility` / `visibility_off`) que alterna `type` password↔text.
- Linha: checkbox `Lembrar-me` + link `Esqueceu a senha?` (`#135bec`).
- Botão **Entrar**: full-width, altura 48, gradiente
  `135deg,#1e3a8a→#2563eb`, ícone `arrow_forward`, hover `brightness(1.07)`.
- Rodapé: `Problemas para acessar? Suporte interno`.

Estado de foco dos inputs:
```
border-color:#2563eb; box-shadow:0 0 0 4px rgba(37,99,235,.13);
```

## Mobile (`LoginMobile.dc.html`, 390×844)

- Topo institucional (~336px): gradiente navy com logo, missão curta
  (`Tratamento de água com engenharia e transparência.`) e 3 chips de valor
  (ícone + rótulo: Excelência / Transparência / Compromisso).
- "Folha" branca/escura arredondada (`border-radius:28px 28px 0 0`) sobreposta
  em `-26px`, com o formulário (mesmos campos do desktop, alturas 50–52).

## Paleta por tema

| Token | Claro | Escuro |
|---|---|---|
| Fundo painel form | `#f0f2f8` | `#0c111b` (desktop) / `#101622` (mobile) |
| Fundo input | `#ffffff` | `#161d2b` |
| Borda input | `#e2e6f0` | `#283248` |
| Texto primário | `#0d121b` | `#ffffff` |
| Texto secundário | `#526071` | `#9ca3af` |
| Texto terciário | `#8292a2` | `#6b7280` |
| Marca / link | `#135bec` | `#135bec` |

O painel de marca não muda entre temas (sempre navy).

## Implementação no stack atual (`login.html`)

Manter o padrão já documentado do projeto:

```html
<script src="js/config.js"></script>
<script src="js/supabaseClient.js"></script>
<script src="js/auth.js" defer></script>
```

- O `<form>` chama `await signIn(email, password)` de `auth.js`.
- Em erro, exibir `#error-banner` via `showError(msg)` (não usar `alert()`).
- Em sucesso, `auth.js` faz o redirect (admin → `gerenciamentodeprojetos.html`,
  operador → `requisicao_estoque.html`).
- Botão com estado de loading (`setLoading(true)` → spinner + disabled).
- Fontes: `Inter:wght@300;400;500;600;700;800` + `Material Symbols Outlined`.

Cores de marca para o `tailwind.config` permanecem as do sistema
(`primary:#135bec`, `background.light:#f0f2f8`, `background.dark:#101622`).
