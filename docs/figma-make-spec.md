# UX Analytics — Especificação completa para implementação (Figma Make)

> **Objetivo deste documento:** ser a fonte única de verdade para reconstruir a
> plataforma **UX Analytics** com fidelidade — regra de negócio, modelo de dados,
> fórmulas exatas, componentes, estados, interações, motion e textos (copy deck).
> Escrito para ser **acionável por IA**: cada seção tem regras determinísticas,
> valores literais e critérios de aceite.
>
> Stack de referência da implementação atual: **HTML + CSS + JavaScript (ES
> modules), sem build**. No Figma Make (React), traduza cada módulo para
> componentes/estado equivalentes — a lógica e os valores abaixo são o contrato.

---

## 0. Sumário

1. Visão, JTBD e princípios
2. SOMA Design System (tokens completos)
3. Tipografia, layout e grid da aplicação
4. Arquitetura de informação e componentes de tela
5. Modelo de dados
6. Ingestão de dados (imagem, planilha, Figma)
7. Regras de negócio e fórmulas (métricas e insights)
8. Especificação de cada feature (comportamento + estados)
9. Heatmap (algoritmo detalhado)
10. Zoom & pan
11. Modo Figma (embed, API, ancoragem por frame, refresh)
12. Motion design (tokens e receitas)
13. Copy deck (todos os textos)
14. Estados vazios, erros e edge cases
15. Critérios de aceite por feature
16. Roadmap de evolução (contexto de produto)

---

## 1. Visão, JTBD e princípios

**O que é:** uma plataforma onde o **Product Designer** sobe (ou conecta) uma
tela de produto, sobe dados de uso real (export do GA4/Looker) e a ferramenta
gera visualizações e hipóteses de UX **ancoradas por componente** — não por
pixel ou coordenada de tela.

**Job-to-be-done:** *“Como Product Designer, quero avaliar sozinho se meu design
está funcionando, com dado real de comportamento, para decidir o que redesenhar,
remover ou testar — sem depender de analista de dados.”*

**Decisão de arquitetura fundamental — ancoragem por componente (não por pixel):**
- Elimina stitching por visão computacional (o print é contexto visual, não fonte de verdade).
- Resiste a mudança de layout entre versões.
- É o único nível em que um export de GA/Looker (sem coordenada) faz sentido.
- Cada retângulo é um par **(componente na tela ↔ evento na planilha)**.

**Princípio dos insights:** cada insight vem com no mínimo **duas hipóteses
concorrentes** (uma “boa”, uma “ruim”). Dado quantitativo aponta “onde olhar”,
não “por quê”. A ferramenta nunca dá veredito fechado — sugere e explica.

**Tom visual:** cockpit de instrumentação, dark-first, denso mas refinado. Marca
amarela XP (`#FBC105`) sobre quase-preto (`#121212`).

---

## 2. SOMA Design System (tokens completos)

Implementar como CSS custom properties (ou tokens do tema). Trocar tema via
atributo `data-theme="dark" | "light"` na raiz. **Dark é o padrão.**

### 2.1 Superfície (Surface)
| Token | Dark | Light |
|---|---|---|
| surface-pure | `#121212` | `#FFFFFF` |
| surface-card | `#222222` | `#EDEDED` |
| surface-raised | `#1A1A1A` | `#FFFFFF` |
| surface-sunken | `#0C0C0C` | `#F4F4F4` |
| surface-container | `rgba(255,255,255,.12)` | `rgba(18,18,18,.06)` |
| surface-inverse | `#FFFFFF` | `#121212` |

### 2.2 Brand (independe de tema)
| Token | Valor |
|---|---|
| brand-pure | `#FBC105` |
| brand-container | `rgba(251,193,5,.16)` |

### 2.3 Conteúdo (Content)
| Token | Dark | Light |
|---|---|---|
| content-pure | `#FFFFFF` | `#121212` |
| content-01 | `#CACACA` | `#333333` |
| content-02 | `#A1A1A1` | `#545454` |
| content-03 | `#8E8E8E` | `#767575` |
| content-inverse | `#121212` | `#FFFFFF` |
| content-line | `rgba(255,255,255,.10)` | `rgba(18,18,18,.10)` |
| content-line-strong | `rgba(255,255,255,.16)` | `rgba(18,18,18,.16)` |
| content-brand-highlight | `#FBC105` | `#95520B` |

### 2.4 Feedback
| Token | Dark pure | Dark surface | Light pure | Light surface |
|---|---|---|---|---|
| success | `#3EEA9B` | `#02311D` | `#0B844C` | `#DAFEEC` |
| info | `#9CB2FF` | `#13146A` | `#505AFF` | `#E5ECFF` |
| error | `#F28080` | `#400F0F` | `#CC3333` | `#FDD8D8` |
| alert | `#F7C028` | `#441B04` | `#BA6C0C` | `#FFF0AD` |

Containers de feedback = `pure` a 12% de opacidade.

### 2.5 Risk
| Token | Dark | Light |
|---|---|---|
| risk-low | `#FEFFC2` | `#CE9F00` |
| risk-medium | `#FBE78C` | `#B1560C` |
| risk-high | `#F5ACAC` | `#AC2929` |

### 2.6 Chart colors (usadas para colorir cada componente/região)
Índice 1–20; a cor da região `i` (0-based) = `chart-((i mod 20)+1)`.

| # | Dark | Light | | # | Dark | Light |
|---|---|---|---|---|---|---|
| 01 | `#FBC105` | `#95520B` | | 11 | `#FFC107` | `#D13200` |
| 02 | `#9CB2FF` | `#9C27B0` | | 12 | `#648291` | `#395663` |
| 03 | `#F44336` | `#C54601` | | 13 | `#FF5722` | `#A51B03` |
| 04 | `#00BCD4` | `#01819D` | | 14 | `#9E9E9E` | `#757575` |
| 05 | `#E6308A` | `#B51A63` | | 15 | `#FE9867` | `#795548` |
| 06 | `#8BABF0` | `#2849F0` | | 16 | `#4C74FA` | `#5928ED` |
| 07 | `#FFEF66` | `#BA5920` | | 17 | `#CDDC39` | `#02873A` |
| 08 | `#009688` | `#016D61` | | 18 | `#606FF3` | `#3F51B5` |
| 09 | `#FF8A00` | `#9B6E17` | | 19 | `#8BC34A` | `#026C2E` |
| 10 | `#4CAF50` | `#015123` | | 20 | `#9B8BF4` | `#673AB7` |

### 2.7 Tipografia
- **Font family:** original é “XP” (proprietária). Substitutos: **Schibsted
  Grotesk** (display/títulos), **Hanken Grotesk** (corpo/UI), **JetBrains Mono**
  (números/dados, tabular). Fallback `system-ui`.
- **Font size:** `12 / 14 / 16 / 20 / 24 / 32 / 40 / 48 / 56` (xxxs→xxxl).
- **Line height:** `16 / 24 / 32 / 40 / 48 / 56`.
- **Font weight:** light 300, regular 400, medium 500, bold 700.
- Números e métricas sempre com fonte mono + `font-variant-numeric: tabular-nums`.
- Locale de formatação: **pt-BR** (milhar com `.`, decimal com `,`).

### 2.8 Espaçamento / Padding
`sp: none 0 · xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 48 · xxxl 64`.
`pd: xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48`.

### 2.9 Borda / Raio
- Width: `sm 1 · md 2 · lg 4 · xl 8`.
- Radius: `xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 48 · circular 9999`.
- Component radius: button/iconbutton/search/tooltip → circular; card/shortcut/banner → lg (24); input/alert → md (16); chips → xs (8); smallchips → xxs (4).

### 2.10 Efeitos
- Opacidade: `xxs 8 · xs 12 · sm 16 · md 24 · lg 32 · xl 56 · xxl 72 · sharp 100`.
- Background blur: `sm 4 · md 8 · lg 16 · xl 24 · xxl 56`.
- Elevação (sombra) — no dark são sombras profundas:
  - elev-1 `0 1px 2px rgba(0,0,0,.40), 0 2px 8px rgba(0,0,0,.24)`
  - elev-2 `0 2px 4px rgba(0,0,0,.44), 0 8px 16px rgba(0,0,0,.32)`
  - elev-3 `0 4px 8px rgba(0,0,0,.48), 0 16px 32px rgba(0,0,0,.40)`
  - elev-4 `0 8px 16px rgba(0,0,0,.52), 0 24px 56px rgba(0,0,0,.48)`
  - glow-brand `0 0 0 1px rgba(251,193,5,.32), 0 8px 32px rgba(251,193,5,.18)`

### 2.11 Motion tokens
- Durações: `dur-1 120ms · dur-2 180ms · dur-3 240ms · dur-4 300ms · dur-5 500ms`.
- Ease-out: quad `cubic-bezier(.25,.46,.45,.94)` · cubic `(.215,.61,.355,1)` · **quart `(.165,.84,.44,1)`** (default enter/exit) · quint `(.23,1,.32,1)` · expo `(.19,1,.22,1)`.
- Ease-in-out: **cubic `(.645,.045,.355,1)`** (default morph) · quart `(.77,0,.175,1)`.
- Sempre respeitar `prefers-reduced-motion: reduce` (zerar animações/transições).

---

## 3. Tipografia, layout e grid da aplicação

**Shell:** `grid-template-rows: 56px 1fr` (topbar + workspace).

**Workspace:** 3 colunas — `272px | 1fr | 340px`.
- ≤1180px: `240px | 1fr | 300px`.
- ≤980px: 1 coluna (empilha; canvas com min-height ~70vh).

**Topbar (56px):** logo “UX” (quadrado brand, 30px, texto `#121212`) + wordmark
“**UX** Analytics”; à direita: pill “N imagens”, pill brand “N posicionados”,
botão de alternar tema (ícone lua).

**Coluna esquerda (Painel de entrada):** seções IMAGENS, DADOS, CONTEXTO DA
TELA, COLUNAS DO ARQUIVO, EVENTOS DO ARQUIVO.

**Centro (Stage):** tabs de imagens no topo; canvas com a tela + overlay de
regiões; barra de zoom (para imagem) ou barra do Figma (para embed).

**Coluna direita (Insights):** CAMADAS (toggles Regiões/Heatmap), AJUSTES DO
HEATMAP (quando heatmap ativo), cards CONCENTRAÇÃO, RANKING & PARETO, SCROLL ×
RELEVÂNCIA, e rodapé com botão brand “Gerar heatmap” + botão destrutivo “Remover
todas as posições”.

Fundo do canvas: gradiente radial sutil brand no topo-direito + azul no rodapé-
esquerdo sobre `surface-sunken`; grão (noise) ~3.5% e um padrão de pontos com
máscara radial no topo.

---

## 4. Arquitetura de informação e componentes de tela

Inventário de componentes (todos estilizados via tokens SOMA):

- **Topbar**: brand, pills (muted/brand), icon-button.
- **Painel esquerdo**: dropzone (imagem), botões (brand/outline/ghost/danger),
  chip de arquivo de dados (com check verde), input numérico (com check de ok),
  selects de colunas, lista de eventos (status pendente/mapeado/macro/armado),
  hint-callout (info).
- **Lista de imagens (imgitem)**: handle de arrastar (⋮⋮), thumbnail, nome +
  arquivo, badge de ativo, botão remover (×). Reordenável por drag.
- **Tabs de imagem**: dot (ativo), nome, arquivo, remover (×). Reordenável por drag.
- **Canvas**:
  - Estado vazio (needs image): card tracejado com CTA “Adicionar imagem”,
    “Conectar Figma”, “Carregar exemplo”.
  - Imagem: `.imgframe` que embrulha a `<img>` (ou iframes do Figma) + `<canvas>`
    heatlayer + overlay de regiões + coachmark de detalhe.
  - Barra de zoom (bottom-right): −, %, +, separador, ajustar.
  - Barra do Figma (top): badge de navegação, id do node, “Atualizado …”,
    botão “Atualizar protótipo”.
- **Região (retângulo mapeado)**: borda + preenchimento na cor do chart; label
  flutuante (número + evento + ×); linha discreta de volumetria (`Xk cliques ·
  Yk users`); 4 handles de resize (nw/ne/sw/se). Coachmark de detalhe on select.
- **Cards de insight**: header (título eyebrow + ações: expandir + info), corpo,
  card-tip (info acionável), estado vazio.
- **Camadas (layer toggles)**: linha com ícone, nome e olho (aberto/riscado).
- **Sliders**: range com thumb brand.
- **Modais**: export (prévia + baixar), insight expandido, adicionar tela
  (upload/Figma). Backdrop com blur; fecha por ×, clique fora e Esc.
- **Loader do Figma**: overlay com card (spinner conic brand + texto).
- **Toasts**: canto inferior direito, tone success/info/error.

---

## 5. Modelo de dados

```
State {
  screens: Screen[]              // telas adicionadas
  events: EventRow[]             // eventos do arquivo (planilha)
  fileName: string | null        // nome do arquivo de dados
  headers: string[]              // cabeçalhos da planilha
  rawRows: string[][]            // linhas brutas (sem cabeçalho)
  columns: { name, count, total } // índices das colunas mapeadas (total pode ser -1)
  suggestedTotal: number         // total de usuários sugerido pela planilha
  screenIndex: number            // tela ativa (-1 = nenhuma)
  totalUsers: number             // denominador de relevância (editável)
  show: { regions: bool, heatmap: bool } // camadas visíveis (independentes)
  zoom: number                   // 1 = fit (0.4..6)
  selectedId, hoverId: string|null
  armedEvent: string|null        // evento “armado” para desenhar
  heat: { radius: number, opacity: number } // 1.0 e 0.85 default
  figmaNode: string|null         // node atual do protótipo (embed)
  figmaToken, figmaProxy: string|null
}

Screen {
  id: string
  name: string                   // ex.: "Imagem 1" / nome do frame Figma
  file: string                   // nome do arquivo/origem
  type?: "figma-embed" | "figma-frame"  // ausente = imagem (print)
  imageURL?: string              // dataURL/objectURL (print ou frame Figma renderizado)
  figmaEmbed?: string            // URL do embed (type=figma-embed)
  figmaSource?: string           // link original
  figmaKey?, figmaNodeId?: string // type=figma-frame (import via API)
  updatedAt?: number             // timestamp última atualização (embed)
  baseUsers: number              // total de usuários base
  regions: Region[]
}

Region {
  id: string
  event: string                  // nome do evento vinculado
  x, y, w, h: number             // fração 0..1 relativa à tela
  nodeId?: string|null           // ancoragem ao frame/estado do Figma (embed)
}

EventRow {
  name: string
  count: number                  // event_count
  users: number                  // total_users do evento (opcional)
  macro: boolean                 // evento sem elemento visual
}
```

**Eventos macro** (não entram no ranking por componente; alimentam métricas de
tela inteira): conjunto por nome (case-insensitive) =
`page_view, screen_view, scroll_depth, session_start, user_engagement,
first_visit, first_open, app_remove`.

---

## 6. Ingestão de dados

### 6.1 Imagem (print)
- Aceita PNG/JPG/WebP; múltiplos (empilham como página contínua — ver 8.7).
- Lê via FileReader → dataURL → cria `Screen` (sem `type`).
- A tela em análise **é** a imagem. Regiões são percentuais relativos à imagem.

### 6.2 Planilha (GA/Looker) — parser sem dependências
- **CSV/TSV/TXT:** detectar delimitador (`,`, `;`, `\t` — o mais frequente na 1ª
  linha); parser respeita aspas duplas (`""` = aspas escapada).
- **XLSX:** ler ZIP manualmente (End Of Central Directory → central directory →
  local headers), inflar entradas comprimidas com
  `DecompressionStream("deflate-raw")`; parsear `xl/sharedStrings.xml` e a
  primeira `xl/worksheets/sheet*.xml`; resolver células `t="s"` (shared string),
  `t="inlineStr"` e numéricas; montar linhas por coluna (letra→índice, base 26).
  - Se o navegador não tiver `DecompressionStream`, orientar exportar CSV.
- **Detecção de colunas** (case-insensitive, com fallback):
  - `name`: `^event_?name$` → `^evento$` → contém `event`+`name`/`evento`/`name`/`nome` → **fallback 0**.
  - `count`: `^event_?count$` → contém `count`/`contagem`/`eventos`/`quantidade`/`qtd`/`hits` → **fallback 1**.
  - `total`: `^total_?users$` → contém `total`+`user`/`usuários`/`users` → **fallback -1** (ausente).
  - As 3 colunas são **remapeáveis** por selects na UI; ao trocar, re-derivar eventos.
- **Derivação de eventos:** agrupar por `name` (somando `count`), `users` = max
  do total por evento, `macro` = nome ∈ conjunto macro. Ordenar por `count` desc.
  `suggestedTotal` = max da coluna total; se ausente, usar `count` de `screen_view`.
  - Se `totalUsers` ainda é 0 e `suggestedTotal > 0`, pré-preencher o contexto.

### 6.3 Figma — ver seção 11.

---

## 7. Regras de negócio e fórmulas

Todas as métricas usam o conjunto **ativo** de regiões (`activeRegions`, ver
11.4). `counts[name]` = event_count do evento. `TU` = `state.totalUsers`.

### 7.1 Relevância (por região)
```
relevance(region) = TU > 0 ? counts[region.event] / TU : 0
```
Pode ser **> 1** (evento disparou mais vezes que usuários → uso repetido). Exibir
como percentual: `fmtPct(v) = (v*100) com 1 casa, vírgula decimal, sufixo %`.

### 7.2 Ranking & Pareto
```
rows = regions.map(r => ({ region:r, event, count, relevance, area = r.w*r.h }))
rows.sort desc por relevance
total = Σ relevance (>0 protegido = 1)
para cada row (na ordem): share = relevance/total; cum += share
rows.cutIndex = índice da 1ª row com cum >= 0.8   (linha de corte 80%)
rows.max = relevance da 1ª row (topo)
```
- Barra de cada row: largura = `clamp(relevance/rows.max, 0.02, 1) * 100%`.
- Inserir divisor “80% ACUMULADO” imediatamente antes da row de índice `cutIndex`
  (se `cutIndex > 0`).
- Número/cor da região = índice **global** dela no array `regions` (estável entre
  painéis), via `regionIndex(id)` e `chartColor(regionIndex+1)`.

### 7.3 Índice de concentração (Gini simplificado)
```
vals = regions.map(relevance).filter(>0)
n = vals.length
se n < 2: retorna (n===1 ? 1 : 0)
vals.sort asc
sum = Σ vals
cum = Σ (i+1)*vals[i]      // i 0-based
gini = (2*cum)/(n*sum) - (n+1)/n
resultado = clamp(gini, 0, 1)
```
Níveis (rótulo + tom):
- `>= 0.55` → “Alta concentração” (tom **error**)
- `>= 0.35` → “Concentração média” (tom **alert**)
- `< 0.35` → “Distribuição equilibrada” (tom **success**)

Barra de concentração: gradiente `success → alert (55%) → error`; preenchimento =
`gini*100%`. Valor exibido com 2 casas (ex.: `0.29`), com count-up animado.

**Mais influência na nota:** top 3 do ranking por `share`; exibir chips “evento
share%” com dot na cor da região (se houver ≥ 2 componentes).

### 7.4 Scroll × Relevância
Para cada região (ordenada por relevância desc, usando `rows.max`):
```
depth    = region.y + region.h/2            // 0 topo → 1 rodapé
rel      = relevance / rows.max             // 0..1 normalizado
expected = exp(-1.8 * depth)                // curva de decaimento esperada
residual = rel - expected
anomaly  = |residual| > 0.32
positive = residual > 0                      // acima da curva
```
- Gráfico: eixo X = depth (esq=topo, dir=rodapé), eixo Y = rel (topo=1). Curva
  tracejada = `expected`. Pontos coloridos pela cor da região.
- Flag de anomalia (card pequeno): **verde “▲ oportun.”** se `positive`, **vermelho
  “▼ atenção”** se não. Legenda: “▲ acima do esperado — oportunidade · ▼ abaixo —
  atenção”. Chip “anomalia” (tom alert) no header quando existe qualquer anomalia.

### 7.5 Vereditos por item (usados nos modais expandidos)
Cada componente recebe um veredito {tone, label, texto} explicando **por que é
positivo/negativo** para aquele insight.

**Concentração** (por `share`):
- `share >= 0.30` → tom **alert**, “Domina a atenção”. Texto: responde por
  `round(share*100)%`; positivo se é o elemento principal (foco proposital),
  negativo se é secundário roubando atenção — validar com teste de 5 segundos.
- `share >= 0.15` → tom **info**, “Peso relevante”. Divide protagonismo com o topo.
- else → tom **neutral**, “Pouca influência”. Se deveria ser importante, pode
  estar mal posicionado/pouco visível.

**Ranking** (por posição `i` vs `cutIndex`):
- `i <= cutIndex` (dentro dos 80%) → tom **success**, “Alto uso — invista aqui”.
  Positivo: é onde os usuários estão; priorizar otimização/redesenho.
- else (cauda longa) → tom **alert**, “Cauda longa — decida”. Pode ser negativo
  (ocupa espaço sem uso): **remover** se desnecessário, ou **testar
  reposicionamento/redesign** se boa função com má comunicação.

**Scroll** (por `residual` e `depth>0.5`):
- `residual > 0.2` → tom **success**. Se profundo: “Oportunidade” (conteúdo forte
  vence a posição, testar subir). Se topo: “Acima do esperado” (hierarquia
  funciona aqui).
- `residual < -0.2` → tom **error**, “Atenção”. Se profundo: ambíguo/negativo
  (posição ou desinteresse — reposicionar/remover). Se topo: negativo (problema
  de clareza/comunicação, não posição — testar compreensão).
- else → tom **neutral**, “Dentro do esperado” (segue a curva).

### 7.6 Volumetria por região (sempre visível, discreta)
Linha sob o label: `fmtK(count) cliques · fmtK(users) users` (users só se > 0).
`fmtK`: `>=1e6 → “X,YM”`, `>=1e3 → “X,Yk”`, senão inteiro (vírgula decimal pt-BR;
remove `,0`).

### 7.7 Coachmark de detalhe (ao selecionar uma região)
Popover ancorado à região mostrando: **Cliques** (`fmtInt(count)`), **Total de
usuários** (`fmtInt(users)` ou “—”), **Relevância** (`fmtPct` ou “—”), **Freq /
usuário** (`count/users` com 2 casas ou “—”). Tem botão × de fechar. Posição:
flip vertical se `y+h >= 0.72` (abre acima), flip horizontal se centro `x+w/2 >
0.5` (ancora à direita). `pointer-events: none` no popover, exceto no botão ×.

### 7.8 Contadores
- Topbar “N imagens” = `screens.length`; “N posicionados” = `activeRegions().length`.
- Seção eventos: `activeRegions().length / events.length`.

---

## 8. Especificação de cada feature

### 8.1 Adicionar / listar / trocar imagem
- Dropzone e botão “Adicionar imagem” → seletor de arquivo (múltiplo) → `addImages`.
- Cada imagem vira uma tela; primeira adicionada torna-se ativa.
- Lista e tabs refletem as telas; clicar troca a tela ativa (`switchScreen`), que
  **reseta zoom para 1**, limpa seleção/hover/armado.

### 8.2 Reordenar (imagens e tabs)
- Drag-and-drop nativo (HTML5). Indicador visual de inserção (before/after) por
  metade do item (vertical na lista, horizontal nas tabs). Ao soltar, mover a
  tela no array preservando a ativa por id.

### 8.3 Remover imagem
- × em cada item da lista e em cada tab. Ajustar `screenIndex` para manter a ativa
  por id; se remover a última, canvas volta ao estado vazio. Remover iframe do
  Figma correspondente (se houver) do DOM.

### 8.4 Mapear evento → região (draw-to-map)
- Clicar num evento **pendente** (não-macro) “arma” o evento (destaque). Requer
  ter uma tela (imagem ou embed).
- Com evento armado, desenhar retângulo sobre a tela (mouse down→move→up). Cria a
  região com `event` = armado; se embed, `nodeId = figmaNode` atual.
- Retângulo mínimo: `w > 0.04 && h > 0.02` (senão toast de erro).
- Evento **macro** clicado → toast explicando que alimenta métricas de tela
  inteira (não entra no ranking).
- `Esc` desarma / limpa seleção. `Delete`/`Backspace` (foco no body) remove a
  região selecionada.

### 8.5 Mover / redimensionar / remover região
- Drag no corpo move (clamp dentro de 0..1). Handles nos cantos redimensionam
  (mínimos: `w>=0.04`, `h>=0.02`). × no label remove (com stopPropagation para
  não vazar clique ao protótipo no modo embed).
- Coordenadas são **percentuais** → escalam com zoom e com o tamanho da tela.

### 8.6 Camadas (Regiões / Heatmap) — exibir/ocultar independentes
- **Não são abas.** São dois toggles com ícone de olho (aberto = visível). Podem
  estar os dois ativos ao mesmo tempo.
- Regiões off → overlay `opacity 0` + `pointer-events none`; coachmark escondido.
- Heatmap on → desenha o heatmap; mostra o card “Ajustes do heatmap”.
- Overlay das regiões fica **acima** do heatlayer (z-index maior).

### 8.7 Juntar em página completa
- Empilha verticalmente todas as telas do tipo imagem (na ordem atual) num único
  canvas contínuo; largura normalizada (maior largura); reposiciona as regiões de
  cada tela no espaço unificado; gera nova imagem (PNG) e nova tela “Página
  completa”. Telas Figma-embed não entram. Cap de 8000px (ver 9/export).

### 8.8 Insights expandíveis (modais)
- Cada card (concentração, ranking, scroll) tem ícone de **expandir** → modal
  largo com: título, **subtítulo do critério** (linguagem simples), a
  métrica/gráfico ampliado, **lista selecionável de itens**, um **painel de
  veredito** que atualiza ao selecionar cada item (tom + explicação de por que é
  positivo/negativo), e a nota acionável geral. Auto-seleciona o 1º item ao abrir.
- Ícone de **info** (ⓘ) em cada card abre um `card-tip` inline com a nota
  acionável (toggle; fecha ao clicar fora).

### 8.9 Contexto da tela
- Input “Total de usuários” (numérico; só dígitos). Ao mudar, recalcula todos os
  insights ao vivo e re-desenha heatmap se ativo. Eco formatado “N usuários”.

---

## 9. Heatmap (algoritmo detalhado)

Estilo mercado (Maze): blobs orgânicos, núcleo vermelho, anéis verde/amarelo,
halo azul suave. Duas passagens: **intensidade → colormap**.

**LUT (gradiente 256px, RGBA):**
```
0.00 rgba(60,60,220,0)     // halo transparente
0.08 rgba(70,80,230,.55)   // azul suave
0.20 rgba(0,150,255,.9)    // ciano-azul
0.35 rgba(0,225,180,1)     // verde-água
0.50 rgba(60,235,60,1)     // verde
0.66 rgba(230,255,0,1)     // amarelo
0.82 rgba(255,150,0,1)     // laranja
1.00 rgba(255,30,30,1)     // vermelho (núcleo)
```

**Passagem de intensidade (offscreen, canal alpha acumulado):**
```
rows = ranking(activeRegions)
para cada row (até ceil(rows.length*progress)):
  share  = clamp(relevance/max, 0.14, 1)
  centro = (x+w/2, y+h/2) em px
  rng    = PRNG determinístico semeado por region.id  // blobs estáveis entre redraws
  pts    = round(10 + share*46)                        // mais quente = mais denso
  spread = (w*0.42, h*0.42)
  dot    = max(10, min(w,h)*0.5) * radiusMult
  alpha  = 0.10 + share*0.16
  para k em pts:
    px = cx + gauss(rng)*spreadX ; py = cy + gauss(rng)*spreadY  // gauss ~ (r+r+r-1.5)
    rad = dot*(0.6 + rng()*0.6)
    fill radial-gradient(rgba(0,0,0,alpha) → transparente) em (px,py,rad)
```
Depois: **um blur único** sobre o campo de intensidade (`filter blur ~
max(3, min(w,h)*0.016)px`), então colorizar por pixel via LUT (índice = alpha
acumulado 0..255) e escrever `alpha = LUT.alpha * heat.opacity`.

**Ajustes (sliders):** Range (raio) 40–220% (default 100 → `radiusMult 1`);
Opacidade 20–100% (default **85%** → `heat.opacity 0.85`). Mudança redesenha.

**Gerar heatmap (botão brand):** liga a camada, anima `progress` de 0→1
(`1 - (1-k)^3` ao longo de ~900ms) e mostra toast. Em reduced-motion, desenha
direto.

**Download (ver 8/export):** compõe imagem base + heatmap num canvas e exporta
PNG. Cap de **8000px** no maior lado. Preferir **blob URL** (data URL grande
falha silenciosamente no Chrome). No **modo Figma embed** (iframe não
rasterizável), a base é um **“mapa de atenção”**: board neutro `#0e0f16` + grid
sutil + retângulos das regiões (preenchimento 14%, borda, label “N evento”) + o
heatmap por cima. Abrir modal de prévia com botão “Baixar PNG” (dispara download
via âncora anexada ao DOM + revoga o blob depois; fallback data URL; mensagem
clara em SecurityError).

---

## 10. Zoom & pan (telas de imagem)

- `fit`: escala = `min(availW/nW, availH/nH, 2.2)` onde `avail` = canvas menos
  ~56px de folga; `nW/nH` = tamanho natural da imagem.
- Zoom `state.zoom` relativo ao fit; range **0.4 a 6**; passo ×1.25 (botões),
  `Ctrl/⌘ + scroll` (×1.1/0.9). “Ajustar” volta a 1 e recentraliza.
- Aplicar largura = `nW*fitScale*zoom` px na imagem; canvas com `overflow:auto` e
  centralização “safe” (sem cortar ao rolar). Barra de zoom mostra `round(zoom*100)%`.
- Regiões são percentuais → permanecem alinhadas em qualquer zoom. O heatmap e o
  coachmark reagem ao zoom.

---

## 11. Modo Figma

O modo Figma tem **dois caminhos** (com trade-offs honestos):

### 11.1 Embed (Embed Kit) — caminho cliente principal
- Sem token, sem CORS. Funciona em **site publicado (https)**; **não** funciona em
  preview com CSP restrito nem em `file://` (o Figma recusa).
- URL do embed: `https://www.figma.com/embed?embed_host=uxanalytics&url=<PROTO>`
  onde `<PROTO>` é o link do protótipo com params anexados: `hide-ui=1`,
  `hotspot-hints=0`, `scaling=contain` (mostrar **só o protótipo**, sem chrome).
- Requer protótipo compartilhado como “qualquer pessoa com o link pode ver” e o
  visitante **logado no Figma** para os eventos dispararem.
- **Iframe persistente por tela:** manter um `<iframe>` vivo por tela Figma e só
  alternar visibilidade — **trocar de tab não recarrega** o embed. Criar sob
  demanda; remover do DOM ao remover a tela.
- **Tamanho:** preencher o canvas (`width = canvasW-24`, `height = canvasH-40`).
  Overlay das regiões por cima com `pass-through`: `pointer-events none` no
  overlay (clique passa ao protótipo), `auto` nas regiões e enquanto desenha.

### 11.2 Eventos de navegação (postMessage)
Escutar `message` de origem `*.figma.com`:
- `PRESENTED_NODE_CHANGED` → nova tela (frame). `figmaNode = presentedNodeId`.
  Badge “🆕 Nova tela”.
- `NEW_STATE` → variação (variante do componente). `figmaNode = nodeId/newVariantId`.
  Badge “🔁 Variação”.
- O badge só aparece quando um evento chega (sem navegação → oculto). Não há nome
  de frame via embed (só id) — mostrar “id <node>”.

### 11.3 Barra do Figma
- “Atualizar protótipo” (refresh): recarrega o iframe ativo (src → about:blank →
  src), atualiza `updatedAt = now`, limpa `figmaNode`, mostra **loader animado**.
- “Atualizado …” (relativo): `<45s` “agora mesmo”; `<60min` “há N min”; senão “às
  HH:MM”.
- Loader: overlay com blur + card (spinner conic brand girando linear 900ms +
  texto “Atualizando protótipo…”), fade/scale-in (dur-3, ease-out-quart), some no
  `load` do iframe (fallback timeout 4.5s).

### 11.4 Ancoragem por frame (regra crítica)
Cada retângulo pertence **só ao frame/estado onde foi criado** (`region.nodeId`).
```
activeRegions() =
  (embed && figmaNode) ? regions.filter(r => r.nodeId === figmaNode) : regions
```
Ao mudar de frame (evento de navegação): limpar seleção e re-renderizar regiões,
insights, contadores e eventos — **o mapeamento de outro frame não aparece**.
Se `figmaNode` é null (sem eventos ainda / não logado), mostra todas (tela única).

### 11.5 Import via API (avançado) — nome real + heatmap/download
A API REST do Figma **não expõe CORS** ao navegador → um site estático não
consegue chamá-la diretamente. Solução honesta: campo de **proxy CORS do próprio
usuário** (obrigatório) + **Personal Access Token** (escopo *File content:
read*), guardados só na sessão.
- Parse do link: `figma.com/(file|design|proto)/<KEY>` → KEY; `node-id=1-2` →
  `1:2` (decodificar e trocar `-`→`:`).
- `GET {proxy}https://api.figma.com/v1/files/{KEY}?depth=2` (header
  `X-Figma-Token`) → coletar frames de topo (`FRAME/COMPONENT/COMPONENT_SET`) e
  seus nomes.
- `GET {proxy}.../v1/images/{KEY}?ids=...&format=png&scale=2` → URLs renderizadas.
- Buscar cada imagem via `fetch(proxy+url)` → **blob** → objectURL (mantém o
  canvas exportável, sem taint). Criar tela `type:"figma-frame"` (é tratada como
  imagem, com **nome real do frame**, `figmaNodeId`), habilitando regiões,
  heatmap, zoom e download normais.
- Erros mapeados: 403 (token/sem acesso), 404 (arquivo), “Failed to
  fetch/CORS” → orientar sobre o proxy.

---

## 12. Motion design (receitas)

| Elemento | Propósito | Easing | Duração | Notas |
|---|---|---|---|---|
| Entrada de cards de insight | reveal | ease-out-quart | dur-4 | stagger ~70ms |
| Count-up da concentração | entendimento | ease-out-quart (k⁴) | 500ms | pular em reduced-motion |
| Barras de ranking/relevância | reveal | ease-out-quart | dur-5 | anima largura |
| Dropdown/segmented/modais (enter) | responsividade | ease-out-quart | dur-3 | scale 0.94–0.96 + fade; origem no gatilho |
| Modais (exit) | — | ease-out | dur-2 | mais rápido que enter |
| Toggle de camada / botão press | feedback | ease-out-quad | dur-1 | `scale(.97)` no active |
| Heatmap “gerar” | entendimento | progress `1-(1-k)³` | ~900ms | — |
| Loader do Figma (enter/exit) | loading | ease-out-quart | dur-3 | spinner linear 900ms |
| Hover states | sutil | `ease` | 150ms | não mover o elemento em hover (mover filho) |
| Zoom / drag de região | manipulação direta | sem transição durante o gesto | — | recalcular no fim |

Regras: animar só `transform`/`opacity`; `backdrop-filter: blur()` ≤ 20px;
respeitar `prefers-reduced-motion`.

---

## 13. Copy deck (textos exatos, pt-BR)

**Topbar/pills:** “N imagens”, “N posicionados”.

**Painel esquerdo:**
- Eyebrows: “Imagens”, “Dados”, “Contexto da tela”, “Colunas do arquivo”,
  “Eventos do arquivo”.
- Dropzone: “Adicionar imagem” · “PNG, JPG, WebP · arraste ou clique”.
- Botões: “Conectar protótipo Figma”, “Juntar em página completa”.
- Vazio imagens: “Nenhuma imagem ainda. Adicione a captura da tela que você quer analisar.”
- Data dropzone: “Anexar planilha” · “Export GA/Looker · .xlsx ou .csv”.
- Data chip: “{arquivo}” · “{N} eventos · clique para substituir”.
- Contexto: “Total de usuários” · “denominador para % relevância · {N} usuários”.
- Colunas vazio: “Anexe a planilha para mapear as colunas.” Selects: “Evento *”,
  “Contagem (event_count) *”, “Total de usuários”.
- Hint eventos: “Clique num evento pendente e desenhe o retângulo sobre o componente correspondente na tela.”
- Vazio eventos: “Os eventos aparecem aqui depois que você anexa a planilha.”
- Tags de evento: “mapeado” / “macro” / “desenhe →” / “pendente”.

**Canvas vazio:** “Comece anexando uma imagem” · “Suba a captura da tela que você
quer analisar e o export do GA/Looker (.xlsx ou .csv). Depois é só desenhar um
retângulo por componente e ligá-lo a um evento.” · botões “Adicionar imagem”,
“Conectar Figma”, “Carregar exemplo”.

**Camadas:** “Camadas”, “Regiões”, “Heatmap”.

**Cards:**
- Concentração: “Concentração” · vazio “Mapeie componentes para ver a
  concentração de atenção.” · “Mais influência na nota:”.
- Ranking: “Ranking & Pareto” · chip “% usuários” · divisor “80% acumulado”.
- Scroll: “Scroll × Relevância” · chip “anomalia” · labels “topo · profundidade
  de scroll” / “relevância ↑”.
- Ajustes heatmap: “Ajustes do heatmap” · “Range (raio)” · “Opacidade” · “Baixar
  imagem com heatmap”.
- Rodapé: “Gerar heatmap” / “Atualizar heatmap” · “Remover todas as posições”.

**Subtítulos dos modais (critério):**
- Concentração: “Mede o quanto a atenção se concentra em poucos componentes (0 =
  espalhada, 1 = tudo num só). Quanto maior a % de um item, mais ele puxa a nota
  para cima. Selecione um componente para ver o papel dele.”
- Ranking: “Ordena os componentes pelo uso relativo (cliques ÷ total de usuários).
  Os primeiros concentram a maior parte do uso; a linha marca onde somam 80%.
  Selecione um componente para ver o que fazer com ele.”
- Scroll: “Cruza a profundidade do componente na tela com sua relevância. A curva
  tracejada é o que se espera pela posição. Selecione um componente para ver se
  está acima ou abaixo do esperado — e por quê.”

**Notas acionáveis (rodapé dos modais / card-tips):**
- Concentração: “Concentração de atenção — 0 = distribuída, 1 = tudo num só
  elemento. Acionável: concentração alta pode ser hierarquia funcionando de
  propósito ou ruído visual escondendo o resto — valide com um teste de 5
  segundos. Baixa: atenção espalhada, revise a hierarquia.”
- Ranking: “Ranking & Pareto — componentes por % de relevância (cliques ÷ total de
  usuários); a linha marca os 80% acumulados. Acionável: invista o redesenho no
  topo. Na cauda longa, decida entre remover (se é desnecessário) ou testar
  reposicionamento (se é boa função com má comunicação).”
- Scroll: “Scroll × Relevância — profundidade do componente × relevância; a curva
  tracejada é o decaimento esperado. Acionável: anomalia positiva no rodapé →
  conteúdo forte, teste subir. Anomalia negativa no topo → clareza/comunicação,
  não posição.”

**Toasts (exemplos):** “{N} imagem(ns) adicionada(s).” · “{N} eventos carregados
de {arquivo}.” · “\"{evento}\" mapeado · {rel} relevância.” · “\"{evento}\"
removido do mapeamento.” · “{N} posições removidas desta tela.” · “Heatmap gerado
a partir de {N} componentes.” · “Imagem com heatmap baixada.” · “Página completa
gerada de {N} imagens · {N} retângulos reposicionados.” · “Evento macro —
alimenta métricas de tela inteira, fora do ranking por componente.” · “Protótipo
conectado…” · “Recarregando o protótipo…”.

**Modal export:** “Imagem com heatmap” · “Se o download não iniciar, clique com o
botão direito na imagem → ‘Salvar imagem como’.” · “Baixar PNG”.

**Modal adicionar tela:** “Adicionar tela” · abas “Upload de print” / “Link do
Figma” · “Conectar protótipo (embed)” · “Avançado — importar frames via API (nome
real + heatmap/download)” · campos “Personal Access Token”, “Proxy CORS (seu) —
obrigatório” · “Importar frames”.

---

## 14. Estados vazios, erros e edge cases

- **Sem imagem:** canvas mostra o card vazio; zoombar oculta; insights mostram
  “Adicione uma imagem para começar”.
- **Sem eventos:** lista de eventos mostra prompt; não é possível armar/mapear.
- **`canAnalyze` = false** (sem regiões ativas OU `totalUsers <= 0`): cards de
  insight mostram o motivo específico (adicione imagem / anexe planilha / mapeie
  componente / informe total de usuários). Heatmap/expandir bloqueados com toast.
- **Retângulo pequeno demais:** toast de erro, não cria.
- **Atributo `hidden`** deve vencer regras de `display` de componentes (regra
  global `[hidden]{display:none!important}`).
- **XLSX sem DecompressionStream:** erro orientando CSV.
- **Figma embed em iframe/`file://`:** pode ser bloqueado por CSP/origem →
  mensagem “publique para testar”.
- **Export tainted (SecurityError):** mensagem clara; nunca falhar em silêncio.
- **Imagem de export gigante:** cap 8000px no maior lado (senão `toBlob` retorna
  null).

---

## 15. Critérios de aceite (por feature)

- [ ] Trocar `total de usuários` recalcula ranking, concentração, scroll e
      heatmap ao vivo.
- [ ] Relevância pode passar de 100% e é exibida em pt-BR (ex.: `587,4%`).
- [ ] Linha “80% acumulado” aparece antes do 1º item que cruza 80% do uso.
- [ ] Concentração troca de rótulo/tom nos limiares 0.35 e 0.55.
- [ ] Selecionar/hover numa região destaca o mesmo item nos 3 painéis (e vice-versa).
- [ ] Cada região mostra volumetria discreta sem precisar clicar.
- [ ] Coachmark abre ao selecionar, fecha no ×, e o × nunca sobrepõe o nome.
- [ ] Regiões e Heatmap são camadas independentes (olho), não abas.
- [ ] Heatmap tem núcleo vermelho → verde/amarelo → halo azul; blobs estáveis
      entre redraws; sliders de range/opacidade funcionam.
- [ ] Download do heatmap funciona para imagens grandes (blob) e no modo Figma
      (mapa de atenção).
- [ ] Modais de insight explicam o critério e, ao selecionar cada item, dizem se
      é positivo/atenção/neutro e por quê.
- [ ] Zoom in/out + pan; retângulos permanecem alinhados.
- [ ] Reordenar e remover imagens/tabs.
- [ ] “Juntar em página completa” gera imagem contínua com regiões reposicionadas.
- [ ] Figma: embed só o protótipo; trocar de tab não recarrega; refresh + “Atualizado …”
      + loader; retângulos ancorados por frame (não vazam para outro frame).
- [ ] `prefers-reduced-motion` respeitado.

---

## 16. Roadmap de evolução (contexto de produto)

Prioridade por impacto no JTBD (autonomia do designer):
- **P0** Conector direto GA4/Looker (OAuth) — elimina dependência de export.
- **P0** Comparação antes/depois entre versões (reusar mapeamento) — prova de valor recorrente.
- **P1** “Gerar roteiro de teste” a partir das hipóteses pareadas (fecha o ciclo).
- **P1** Guardrails estatísticos (amostra mínima, intervalo de confiança).
- **P1** Segmentação (device, novo vs recorrente, origem).
- **P2** Mapeamento reutilizável + sugestão automática de match evento↔componente.
- **P2** Link compartilhável + comentários (distribui o insight).
- **P3** Figma via OAuth oficial + backend (nome de frame sem proxy).

Template de hipótese (para a feature “gerar roteiro de teste”):
```
Nós acreditamos que [ajuste de design]
Para [segmento de usuário]
Vai resultar em [resultado esperado]
Saberemos que funcionou quando [métrica de validação]
```

---

## Apêndice A — Utilitários de formatação (pt-BR)
```
fmtInt(n)  = Math.round(n).toLocaleString("pt-BR")
fmtPct(v)  = (v*100).toFixed(1).replace(".", ",") + "%"
fmtK(n)    = >=1e6 ? (n/1e6).toFixed(1 ou 0)+"M" : >=1e3 ? (n/1e3).toFixed(1 ou 0)+"k" : n   (vírgula; remove ",0")
chartColor(i) = var(--chart-(((i-1)%20)+1))
```

## Apêndice B — Dados de exemplo (“Carregar exemplo”)
Tela sintética “Explorar” (SVG) 340×720 com 7 regiões (`select_acoes`,
`select_etfs`, `select_criptoativos`, `select_tesouro`, `filtro_longo_prazo`,
`filtro_automatico`, `card_cdb_clear`) e ~15 eventos com `count`/`users`
(incl. macros `page_view`/`screen_view`/`scroll_depth`), `total_users` = 127000.
Serve para demonstrar o fluxo completo sem arquivos do usuário.
```
select_acoes 746000/118400 · select_etfs 273400/96200 · select_tesouro 270000/94800 ·
select_criptoativos 183900/71500 · filtro_automatico 178200/88300 · card_cdb_clear 176300/69100 ·
filtro_longo_prazo 160900/82700 · filtro_seguranca 124500/61200 · hero_seguranca_click 98700/54900 ·
maiores_altas 88100/47300 · favoritos_view 74300/41100 · search_open 33600/22800 ·
page_view 512000/127000 (macro) · screen_view 127000/127000 (macro) · scroll_depth 361000/103500 (macro)
```

---

*Fim da especificação. Este documento é auto-suficiente para reimplementar a
plataforma com fidelidade de regra de negócio e de UI. Em caso de conflito,
prevalecem as fórmulas e valores literais das seções 2, 7, 9 e 11.*
