# UX Analytics — Plataforma de análise de UX por componente

Protótipo funcional de uma plataforma onde o **Product Designer** sobe uma tela
de produto + dados de uso real (export GA4/Looker) e a ferramenta gera
visualizações e hipóteses de UX **ancoradas por componente** — não por pixel.

Construído sobre o **SOMA Design System** (tokens de cor, tipografia,
espaçamento, raio e efeitos), com tema claro e escuro.

▶ **Live:** https://diegocabralr.github.io

---

A ferramenta começa **vazia**: é preciso anexar uma imagem da tela **e** a
planilha de eventos (.xlsx ou .csv) para a análise funcionar. Os eventos vêm
do arquivo — cada retângulo é ligado a um evento real da planilha.

## O que está implementado

| Área | Recurso |
|---|---|
| **Upload de imagem** | Suba uma ou várias capturas (PNG/JPG/WebP). A tela em análise é a imagem anexada. |
| **Upload de planilha** | Parser próprio, sem dependências, para `.xlsx` (ZIP + deflate via `DecompressionStream`) e `.csv`/`.tsv`. As colunas são detectadas e podem ser remapeadas (evento, contagem, total de usuários). |
| **Eventos do arquivo** | Cada retângulo é vinculado a um evento da planilha. Eventos macro (`scroll_depth`, `page_view`…) ficam fora do ranking por componente. |
| **Mapeamento por componente** | Clique num evento pendente → desenhe o retângulo sobre o elemento. Arraste para mover, alças para redimensionar, **× para remover**. |
| **Modo protótipo Figma** | **Embed** (Embed Kit): o protótipo é embutido, a navegação (nova tela × variação) é detectada por `postMessage`, e os retângulos são mapeados numa camada por cima. Funciona no site publicado (https). **Import via API** (avançado): com Personal Access Token + um **proxy CORS próprio** (a API do Figma não expõe CORS para o navegador), importa os frames renderizados como imagem com o **nome real** — aí heatmap, zoom e download também funcionam. |
| **Volumetria sempre visível** | Cada retângulo mostra, de forma discreta, o evento + cliques + total de usuários, sem precisar clicar. |
| **Detalhe na seleção** | Ao selecionar um retângulo, um popover mostra **cliques (event_count), total de usuários, relevância e freq./usuário** daquele evento. |
| **Influenciadores da concentração** | O card de concentração indica quais componentes mais puxam a nota (share de relevância). |
| **Blocos expansíveis** | Cada insight tem um ícone de expandir que abre um modal maior para leitura com calma. |
| **Reordenar** | Arraste imagens na lista lateral e as abas no topo para reordenar. |
| **Remover imagem** | × em cada item da lista e em cada aba. |
| **Juntar em página completa** | Empilha as telas (na ordem escolhida) em **uma nova imagem contínua**, reposicionando os retângulos já mapeados no espaço unificado. |
| **Ranking & Pareto** | Barras por % de relevância (`event_count / total_users`), com linha de corte de 80% acumulado. |
| **Índice de concentração** | Score 0–1 (Gini simplificado) da distribuição de atenção. |
| **Scroll × Relevância** | Dispersão profundidade × relevância com curva de decaimento de referência e marcação de anomalias. |
| **Cross-panel linking** | Hover/seleção de um retângulo destaca o mesmo elemento nos três painéis simultaneamente (e vice-versa). |
| **Camadas (exibir/ocultar)** | **Regiões** e **Heatmap** são camadas independentes, ligadas/desligadas por um botão de olho (não abas) — dá para ver as duas juntas ou só uma. |
| **Zoom & pan** | Zoom in/out (botões, `Ctrl/⌘ + scroll`) e ajustar à tela, para inspecionar e mapear elementos em imagens grandes/juntadas; os retângulos acompanham o zoom. |
| **Heatmap térmico** | Mapa de calor convencional (azul→ciano→verde→amarelo→vermelho) ponderado pela relevância, com controles de **range (raio)** e **opacidade** e **download da imagem** com o heatmap embutido (PNG). |
| **Info acionável** | Cada insight tem um ícone de info com um resumo do que o dado significa e **o que fazer** com ele para cada componente observado. |
| **Contexto da tela** | `total de usuários` (pré-preenchido pela planilha) recalcula todas as métricas ao vivo. |
| **Colar imagem** | Cole um print direto da área de transferência (`Ctrl/⌘+V` ou botão) — sem precisar salvar arquivo. |
| **Copiar heatmap** | Além de baixar, o heatmap gerado pode ser **copiado** para colar em slides/documentos. |
| **Grupos "mesma página"** | Marque imagens como a **mesma página** — por **variante/filtro** (casos de uso) ou por **scroll/posição** (scroll 1, scroll 2…). Badges por grupo na lista e nas abas. |
| **Comparar telas** | Compare volumetria e métricas de uma tela com outra (componentes, cliques, relevância, concentração, top componente e relevância por componente em comum), com denominador editável por tela. |
| **Regiões padronizadas** | Todos os retângulos usam uma **única cor de marca (amarelo)**, com contraste garantido no modo claro; a identificação é pelo número, não pela cor. |
| **Exportar análise** | Leve os blocos para slides/one-pagers: **copiar imagem**, **copiar texto**, **baixar PNG** ou **exportar PDF** (impressão). |
| **Guia (wizard)** | Assistente de 3 passos — (1) adicionar imagens, (2) subir a planilha, (3) associar as colunas — em vez de coachmarks soltos. |
| **Detectar componentes** | Detecção automática de elementos de interação **por visão computacional clássica (sem IA)** — Sobel + dilatação morfológica + connected-components no `<canvas>`, tudo no navegador. Gera retângulos-candidatos; você só clica em **“+ evento”** e escolhe o evento da planilha. (Não funciona em protótipo Figma embed, que é cross-origin.) |
| **Exportar por métrica** | Exportar **tudo** ou cada métrica isolada (Concentração / Ranking & Pareto / Scroll × Relevância), como imagem, PDF, cópia de imagem e cópia de texto. |
| **Drill-down do funil** | No lightbox de uma etapa do funil, **“Analisar componentes desta etapa”** abre aquela tela no modo Análise (reaproveitando ou criando a tela), já com o **total de usuários = volumetria da etapa** — ligando a visão macro do funil à análise por componente. |
| **Análise vinculada ao funil** | Depois de analisar uma etapa, a análise fica **salva e linkada**: ao clicar na imagem da etapa no funil, o lightbox mostra o **heatmap sobre a tela** + resumo (concentração, componentes mapeados, top componentes por relevância), e o botão vira **“Ver / editar análise”**. |
| **Recomendações por componente** | Um **veredito acionável único** por componente (Manter · Promover · Reposicionar · Aumentar alvo · Rever clareza · Revisar · Monitorar), combinando **relevância + posição + área**; problemas primeiro, com o texto do que fazer. |
| **Competição por atenção** | Sinaliza componentes **próximos e ambos relevantes** que disputam o mesmo clique (canibalização), sugerindo hierarquizar/afastar/fundir. |

Há um botão **"Carregar exemplo"** para testar o fluxo completo sem arquivos
próprios. Atalhos: `Esc` limpa seleção/desenho · `Delete` remove o retângulo
selecionado.

---

## Stack

HTML + CSS + JavaScript (ES modules) — **sem build step**, servível direto pelo
GitHub Pages.

```
index.html
assets/
  css/tokens.css   → SOMA Design System (cores, tipografia, spacing, raio, efeitos, motion)
  css/app.css      → layout e componentes da aplicação
  js/data.js       → modelo de dados (telas, eventos) + matemática dos insights
  js/app.js        → controlador: render, interação, cross-panel linking, heatmap
```

Motion segue tokens de easing/duração dedicados e respeita
`prefers-reduced-motion`.

> Os dados exibidos são um mock representativo do domínio (aba "Explorar" de um
> app de investimentos) para demonstrar a ferramenta de ponta a ponta.

Referências de construção: SOMA Design System e a spec de discovery consolidada
da plataforma de UX Analytics.
