# Guilds Comercial — DESIGN.md

Sistema de design do produto. Agentes de IA leem este arquivo e geram UI consistente com a identidade.

## Estratégia híbrida

| Superfície | Sistema base | Por quê |
|---|---|---|
| **App** (`/hoje`, `/pipeline`, `/funil`, `/raio-x`, `/equipe`, `/admin`, `/configuracoes`) | **Linear** | CRM de produtividade B2B — densidade alta, hierarquia precisa, dark-first |
| **Landing & marketing** (`/`, `/precos`, `/ajuda`, `/termos`, `/privacidade`, `/dpa`) | **Stripe** | Confiança institucional, premium, light-first com seções dark |
| **Auth** (`/login`, `/cadastro`, `/trocar-senha`) | Stripe (light) | Primeira impressão, calorosa |
| **Onboarding wizard** | Linear | Já é dentro do produto |
| **Billing & proposta** (`/configuracoes/billing`, `/proposta/[leadId]`) | Stripe | Feel financeiro |

Light + dark **ambos disponíveis** em todas as superfícies. Default segue OS (`prefers-color-scheme`).

Referências completas:
- [`docs/design/LINEAR.md`](./design/LINEAR.md) — sistema completo do Linear (cores, tipografia, depth)
- [`docs/design/STRIPE.md`](./design/STRIPE.md) — sistema completo do Stripe

---

## 1. Tokens de cor (HSL — vars CSS em `app/globals.css`)

### Light theme

| Token | HSL | Origem | Uso |
|---|---|---|---|
| `--background` | `180 5% 97%` (`#f7f8f8`) | Linear light bg | Página |
| `--card` | `0 0% 100%` (`#ffffff`) | Linear/Stripe | Cards, surfaces elevadas |
| `--popover` | `0 0% 100%` | Stripe | Popovers, dropdowns |
| `--foreground` | `212 79% 11%` (`#061b31`) | **Stripe deep navy** — não preto puro, calor financeiro | Headings, texto primário |
| `--muted-foreground` | `217 18% 47%` (`#64748d`) | Stripe slate | Body secundário, metadata |
| `--primary` | `232 56% 60%` (`#5e6ad2`) | **Linear brand indigo** | CTAs, accents, ativos |
| `--primary-foreground` | `0 0% 100%` | — | Texto sobre primary |
| `--secondary` | `213 38% 93%` (`#e5edf5`) | Stripe border soft | Surfaces secundárias |
| `--accent` | `241 100% 72%` (`#7170ff`) | **Linear violet** | Hover, links, seleção |
| `--border` | `213 38% 93%` (`#e5edf5`) | Stripe | Border default |
| `--input` | `213 38% 93%` | — | Inputs |
| `--ring` | `232 56% 60%` | — | Focus ring |
| `--destructive` | `345 84% 53%` (`#ea2261`) | Stripe ruby | Erros, urgent, danger |
| `--success` | `160 84% 39%` (`#10b981`) | Linear emerald | Sucesso, completion |

### Dark theme (Linear-first)

| Token | HSL | Origem | Uso |
|---|---|---|---|
| `--background` | `220 5% 4%` (`#08090a`) | **Linear marketing black** | Página |
| `--card` | `220 5% 7%` (`#0f1011`) | Linear panel dark | Cards (translúcidos sobre bg) |
| `--popover` | `220 5% 10%` (`#191a1b`) | Linear level 3 surface | Popovers, dropdowns |
| `--foreground` | `180 5% 97%` (`#f7f8f8`) | Linear primary text | Headings, texto primário |
| `--muted-foreground` | `216 6% 57%` (`#8a8f98`) | Linear tertiary text | Body secundário |
| `--primary` | `241 100% 72%` (`#7170ff`) | **Linear violet** (dark = punch maior) | CTAs |
| `--primary-foreground` | `0 0% 100%` | — | Texto sobre primary |
| `--secondary` | `220 5% 10%` (`#191a1b`) | — | Surfaces secundárias |
| `--accent` | `232 56% 60%` (`#5e6ad2`) | Linear brand indigo | Hover dim |
| `--border` | `0 0% 100% / 0.08` (`rgba(255,255,255,0.08)`) | **Linear semi-transparent border** | Borders cards/inputs |
| `--input` | `220 5% 10%` | — | Inputs |
| `--ring` | `241 100% 72%` | — | Focus ring |
| `--destructive` | `345 84% 53%` | — | Erros |
| `--success` | `160 84% 39%` | — | Sucesso |

### Aliases legados (compat — apontam pros novos)

`guild-50/100/500/600/700/900` continuam mapeados pra família primary/accent. Não usar em código novo, mas mantidos pra zero refactor das 83 ocorrências existentes.

---

## 2. Tipografia

### Fontes

- **Sans (default)**: `Inter Variable` via `next/font/google` — usar com `font-feature-settings: "cv01", "ss03"` (Linear DNA: alternates geométricos).
- **Mono (código)**: `JetBrains Mono Variable` (substituto open-source pro Berkeley Mono do Linear).
- **Não usar Sohne** (Stripe) — proprietária. Onde queremos "feel Stripe" (landing/billing), usar Inter weight **300** com letter-spacing tight — mesma sensação de elegância anti-bold sem violar IP.

### Pesos

- **400**: leitura (body)
- **510**: ênfase / UI (Linear's signature — entre regular e medium)
- **590**: emphasis forte (headings de card, labels)
- **300**: hero/landing (Stripe-feel — confiança quieta)

Não usar **700** no Inter — fica pesado demais pro feel Linear/Stripe.

### Letter-spacing por tamanho (compressão progressiva)

| Tamanho | Tracking |
|---|---|
| 72px (display XL) | `-1.584px` |
| 56px (hero) | `-1.4px` |
| 48px (display) | `-1.056px` |
| 32px (h1) | `-0.704px` |
| 24px (h2) | `-0.288px` |
| 20px (h3) | `-0.24px` |
| 16-18px (body) | `normal` |
| 13-15px (small) | `-0.165px` |

### Hierarquia (App — Linear)

| Role | Tamanho | Peso | LH | Tracking |
|---|---|---|---|---|
| H1 page | 32px | 510 | 1.13 | -0.704 |
| H2 section | 24px | 510 | 1.33 | -0.288 |
| H3 card | 20px | 590 | 1.33 | -0.24 |
| Body | 16px | 400 | 1.50 | normal |
| Body emphasis | 16px | 510 | 1.50 | normal |
| Small | 14-15px | 400 | 1.50 | -0.165 |
| Caption | 13px | 510 | 1.40 | -0.13 |
| Label | 12px | 510 uppercase | 1.40 | wider tracking |

### Hierarquia (Landing — Stripe-feel)

| Role | Tamanho | Peso | LH | Tracking |
|---|---|---|---|---|
| Hero | 56px | **300** | 1.03 | -1.4 |
| Display | 48px | 300 | 1.15 | -0.96 |
| Section | 32px | 300 | 1.10 | -0.64 |
| Body large | 18px | 300 | 1.40 | normal |
| Body | 16px | 300-400 | 1.40 | normal |
| Button | 16px | 400 | 1.00 | normal |

---

## 3. Componentes-chave

Todas as classes utilitárias em `app/globals.css` `@layer components`.

### `.btn-primary`
- Light: `bg-primary text-white` (`#5e6ad2` → branco). Padding `8px 16px`, radius `6px`.
- Dark: `bg-primary text-white` (`#7170ff` → branco). Mesmo radius.
- Hover: `brightness-110`. Active: `scale-[.98]`.
- Shadow inset: `inset 0 1px 0 rgba(255,255,255,0.15)` (Linear-style relevo sutil).

### `.btn-secondary`
- Light: `bg-secondary border border-border text-foreground`. Hover: `bg-muted`.
- Dark: `bg-white/[0.04] border border-white/8 text-foreground`. Hover: opacity bg sobe pra `0.06`.
- Radius `6px`.

### `.btn-ghost`
- Transparent bg, `text-muted-foreground`. Hover `bg-accent/10 text-foreground`.

### `.card`
- Light: `bg-card border border-border rounded-lg shadow-stripe-sm` (Stripe blue-tinted shadow).
- Dark: `bg-white/[0.02] border border-white/8 rounded-lg` (Linear translucent on dark).
- Radius `8px` (cards), `12px` (featured), `4-6px` (compact widgets).

### `.input-base`
- Light: `bg-background border border-input rounded-md px-3 py-2 text-sm`. Focus: `ring-2 ring-primary border-transparent`.
- Dark: `bg-white/[0.02] border border-white/8`. Mesmo focus.

### `.label`
- `text-[10px] font-bold uppercase tracking-widest text-muted-foreground` (mantido — já está Linear-style).

### Pills / Badges
- Neutral: transparent bg, `border border-border text-muted-foreground rounded-full px-2.5 py-0 text-xs font-medium` (Linear pill).
- Success: `bg-success/15 text-success-700 border-success/30` (Stripe-style success badge).
- Urgent: `bg-destructive/15 text-destructive border-destructive/30`.

---

## 4. Spacing & layout

- **Base unit**: 8px. Scale: 1, 4, 8, 12, 16, 24, 32, 48, 64.
- **Max container width**: 1200px (Linear) pra app; 1080px (Stripe) pra landing.
- **Vertical section padding**: 80px+ landing, 32-48px no app.
- **Border radius scale**:
  - 2px (micro: badges, inline tags)
  - 4px (Stripe default — buttons, inputs em landing)
  - 6px (Linear default — buttons, inputs no app)
  - 8px (cards)
  - 12px (panels, featured cards)
  - 9999px (pills, status dots)

---

## 5. Depth & elevation

### Light (Stripe shadows — blue-tinted)

```css
/* Ambient — toolbar buttons, hover */
shadow-stripe-xs: rgba(50,50,93,0.08) 0px 1px 3px

/* Standard — cards */
shadow-stripe-sm: rgba(50,50,93,0.11) 0px 4px 6px -2px, rgba(0,0,0,0.06) 0px 2px 3px -1px

/* Elevated — featured, dropdowns */
shadow-stripe-md: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px

/* Dialog */
shadow-stripe-lg: rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px
```

### Dark (Linear — luminance stepping)

Em dark, **shadows tradicionais não funcionam** (escuro sobre escuro). Linear resolve subindo a opacidade do bg branco translúcido por nível:

```css
Level 1: bg-white/[0.02]   /* base card */
Level 2: bg-white/[0.04]   /* hover, secondary */
Level 3: bg-white/[0.05]   /* elevated dropdown */
Level 4: bg-white/[0.08]   /* modal */
```

E borders são sempre `border-white/[0.08]` (default) ou `border-white/[0.05]` (subtle), nunca solid escuro sobre escuro.

---

## 6. Do's and Don'ts (Guilds-specific)

### Do
- Usar `Inter Variable` com `cv01, ss03` em **todo** texto sans (config global em `body`).
- `JetBrains Mono` pra labels técnicos (códigos de feature IA, tax_id, métricas raw).
- `weight 510` como ênfase default no app (Linear DNA).
- `weight 300` em hero/landing (Stripe-feel).
- Tracking negativo em display sizes (proporcional à tabela acima).
- `#5e6ad2` (light) / `#7170ff` (dark) como **única cor cromática** no chrome do app — todo resto é grayscale.
- Borders translúcidas brancas em dark (`border-white/8`), borders soft-blue em light (`#e5edf5`).
- Status colors apenas pra: success (verde), destructive/urgent (Stripe ruby), warning (amber). Sem outras cromáticas no UI.

### Don't
- Não usar `text-white` puro em dark — sempre `#f7f8f8` (`hsl(180 5% 97%)`).
- Não usar `#000000` puro em headings light — sempre `#061b31` (Stripe navy, calor financeiro).
- Não usar weight 700 no Inter.
- Não usar tracking positivo em display.
- Não usar shadow neutro (cinza) em light — sempre Stripe blue-tinted (`rgba(50,50,93,0.X)`).
- Não usar border solid escuro em dark — sempre semi-transparente branco.
- Não introduzir cores warm (laranja, amarelo) no UI chrome — paleta é cool gray + violet + ruby/emerald de status.
- Não pill-shape em buttons/cards — radius máximo 12px (panels). Pills só em badges/chips/avatars.
- Não usar `bg-guild-600` em código novo — usar `bg-primary`.

---

## 7. Mapeamento por tela (status atual + onda planejada)

| Tela | Status | Onda |
|---|---|---|
| `app/login`, `app/cadastro`, `app/trocar-senha` | Stripe-feel light, dark-mode-ok | 2 |
| `app/(marketing)/*` | Stripe full | 2 |
| `components/sidebar`, `components/mobile-nav`, `components/trial-banner` | Linear app shell | 2 |
| `app/(app)/hoje` | Linear dashboard | 3 |
| `app/(app)/pipeline` (kanban) | Linear (cores de stage = pills) | 3 |
| `app/(app)/base` | Linear list/table | 3 |
| `app/(app)/funil`, `/raio-x`, `/canais`, `/time` | Linear data-dense | 4 |
| `app/(app)/configuracoes/*` | Linear forms | 5 |
| `app/(app)/configuracoes/billing` | Stripe-feel (financeiro) | 5 |
| `app/(app)/admin/ai` | Linear admin | 5 |

---

## 8. Para agentes de IA gerando código

**Sempre que gerar uma tela nova**:
1. Decidir se é "app" (Linear) ou "marketing/billing" (Stripe-feel) baseado na rota.
2. Usar tokens HSL via Tailwind (`bg-card`, `text-foreground`, `border-border`) — nunca cores literais.
3. Ativar `font-feature-settings` global (já no `body`).
4. Aplicar tracking proporcional ao tamanho (ver tabela).
5. Em light, usar `shadow-stripe-sm` em cards. Em dark, usar luminance stepping (`bg-white/[0.02]`).
6. CTA primário: `btn-primary`. Secundário: `btn-secondary`. Ghost: `btn-ghost`.
7. Container: `card` (cobre 90% dos casos).
8. Status: `text-success-500`, `text-destructive`, `text-warning-500` — nunca verde/vermelho/amarelo arbitrários.
