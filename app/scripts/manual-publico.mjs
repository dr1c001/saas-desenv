// Gera o manual PUBLICO (HTML de pagina unica) a partir de src/lib/manual.ts.
//
// ─── Por que gerado, e nao escrito a mao ─────────────────────────────────────
//
// Existiam duas copias do manual: a tela de ajuda dentro do sistema e a pagina
// publica que se manda para cliente. Duas copias do mesmo conteudo divergem —
// sempre — e o resultado e exatamente o que o proprio manual avisa que nao pode
// acontecer: um dos dois passa a ensinar errado, com cara de autoridade.
//
// Agora ha uma fonte so. A tela de ajuda le MANUAL, e esta pagina tambem.
//
// ─── Como rodar ──────────────────────────────────────────────────────────────
//
//   npm run manual:publico
//
// Sai em `manual-servicoos.html`, pronto para publicar. O passo de compilacao
// existe porque lib/manual.ts e TypeScript e o projeto nao tem tsx instalado —
// o arquivo nao tem dependencia de runtime (o unico import e de TIPO, apagado
// na compilacao), entao compilar ele sozinho funciona.

import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"

const require = createRequire(import.meta.url)
// Resolvido contra o diretorio de TRABALHO, e nao contra este arquivo: o
// caminho vem da linha de comando, e quem digita pensa a partir da raiz do
// projeto, nao de scripts/.
const { MANUAL, pedacos } = require(resolve(process.cwd(), process.argv[2]))
const saida = process.argv[3] ?? "manual-servicoos.html"

/** Escapa o que vai para dentro do HTML. O conteudo e nosso, mas o dia em que
 *  vier de outro lugar isto ja esta no lugar certo. */
const esc = (t) =>
  String(t)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")

/** `*assim*` vira <strong>, usando a MESMA funcao que a tela de ajuda usa. */
const txt = (t) =>
  pedacos(t)
    .map((p) => (p.forte ? `<strong>${esc(p.texto)}</strong>` : esc(p.texto)))
    .join("")

function bloco(b) {
  switch (b.tipo) {
    case "p":
      return `<p>${txt(b.texto)}</p>`
    case "lista":
      return (
        (b.titulo ? `<h4>${esc(b.titulo)}</h4>` : "") +
        `<ul>${b.itens.map((i) => `<li>${txt(i)}</li>`).join("")}</ul>`
      )
    case "passos":
      return (
        (b.titulo ? `<h4>${esc(b.titulo)}</h4>` : "") +
        `<ol class="passos">${b.itens.map((i) => `<li><span>${txt(i)}</span></li>`).join("")}</ol>`
      )
    case "fluxo":
      return (
        `<div class="fluxo">` +
        b.etapas
          .map(
            (e, i) =>
              (i > 0 ? `<span class="seta">→</span>` : "") +
              `<span${i === b.etapas.length - 1 ? ' class="fim"' : ""}>${esc(e)}</span>`
          )
          .join("") +
        (b.morto ? `<span class="seta">·</span><span class="morto">${esc(b.morto)}</span>` : "") +
        `</div>`
      )
    case "tabela":
      return (
        `<div class="rolagem"><table><thead><tr>` +
        b.cabecalho.map((c) => `<th>${esc(c)}</th>`).join("") +
        `</tr></thead><tbody>` +
        b.linhas
          .map(
            (l) =>
              `<tr>` +
              l
                .map((c, i) => (i === 0 ? `<td class="chave">${esc(c)}</td>` : `<td>${txt(c)}</td>`))
                .join("") +
              `</tr>`
          )
          .join("") +
        `</tbody></table></div>`
      )
    case "atencao":
      return `<div class="atencao"><h4>${esc(b.titulo)}</h4><p>${txt(b.texto)}</p></div>`
    default:
      return ""
  }
}

function verbete(v) {
  return `
    <section class="aba" id="${esc(v.id)}">
      <div class="aba-topo">
        ${v.codigo ? `<span class="aba-cod">${esc(v.codigo)}</span>` : ""}
        <h3>${esc(v.titulo)}</h3>
        ${v.etiqueta ? `<span class="etiqueta">${esc(v.etiqueta)}</span>` : ""}
      </div>
      <p class="resumo">${txt(v.resumo)}</p>
      ${v.blocos.map(bloco).join("\n")}
    </section>`
}

const indice = MANUAL.map(
  (s) => `
      <div class="trilho-grupo">
        <p class="trilho-titulo">${s.numero ? `${esc(s.numero)} · ` : ""}${esc(s.titulo)}</p>
        ${s.verbetes
          .map(
            (v) =>
              `<a href="#${esc(v.id)}"><span class="cod">${v.codigo ? esc(v.codigo) : "—"}</span><span>${esc(v.titulo)}</span></a>`
          )
          .join("")}
      </div>`
).join("")

const corpo = MANUAL.map(
  (s) => `
    <div class="grupo">
      <span class="grupo-num">${s.numero ? esc(s.numero) : "—"}</span>
      <h2 class="grupo-nome">${esc(s.titulo)}</h2>
      <p class="grupo-desc">${esc(s.descricao)}</p>
    </div>
    ${s.verbetes.map(verbete).join("\n")}`
).join("\n")

const html = `<title>Manual do ServiçoOS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap">

<style>
  :root {
    --papel:#FAF9F7; --superficie:#FFFFFF; --tinta:#17191A; --cinza:#5F6467;
    --cinza-fraco:#8A8F91; --linha:#E4E1DB; --linha-forte:#CFCBC3;
    --verde:#0B6B4F; --verde-fraco:#E8F1ED; --ambar:#8A4B0A; --ambar-fraco:#FBF1E4;
    --serif:"Newsreader",Georgia,serif;
    --sans:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,Consolas,monospace;
    --leitura:68ch;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --papel:#121415; --superficie:#191C1D; --tinta:#EDEBE7; --cinza:#A2A7A8;
      --cinza-fraco:#7C8183; --linha:#2A2E2F; --linha-forte:#3C4142;
      --verde:#58C79E; --verde-fraco:#14322A; --ambar:#E2AA69; --ambar-fraco:#2E2317;
    }
  }
  :root[data-theme="dark"] {
    --papel:#121415; --superficie:#191C1D; --tinta:#EDEBE7; --cinza:#A2A7A8;
    --cinza-fraco:#7C8183; --linha:#2A2E2F; --linha-forte:#3C4142;
    --verde:#58C79E; --verde-fraco:#14322A; --ambar:#E2AA69; --ambar-fraco:#2E2317;
  }
  :root[data-theme="light"] {
    --papel:#FAF9F7; --superficie:#FFFFFF; --tinta:#17191A; --cinza:#5F6467;
    --cinza-fraco:#8A8F91; --linha:#E4E1DB; --linha-forte:#CFCBC3;
    --verde:#0B6B4F; --verde-fraco:#E8F1ED; --ambar:#8A4B0A; --ambar-fraco:#FBF1E4;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--papel); color:var(--tinta); font-family:var(--sans);
    font-size:16.5px; line-height:1.62; -webkit-font-smoothing:antialiased; }
  .pagina { display:grid; grid-template-columns:15.5rem minmax(0,1fr); gap:3.5rem;
    max-width:76rem; margin:0 auto; padding:0 2rem 6rem; align-items:start; }
  .trilho { position:sticky; top:0; max-height:100vh; overflow-y:auto;
    padding:2.5rem 0 3rem; border-right:1px solid var(--linha); font-size:.815rem; }
  .trilho-marca { font-family:var(--serif); font-weight:600; font-size:1.05rem; margin:0 0 .15rem; }
  .trilho-sub { color:var(--cinza-fraco); font-size:.72rem; letter-spacing:.06em;
    text-transform:uppercase; margin:0 0 1.75rem; }
  .trilho nav { display:flex; flex-direction:column; gap:1.4rem; }
  .trilho-grupo { display:flex; flex-direction:column; gap:.1rem; }
  .trilho-titulo { font-size:.7rem; letter-spacing:.09em; text-transform:uppercase;
    color:var(--cinza-fraco); margin:0 0 .4rem; font-weight:600; }
  .trilho a { display:grid; grid-template-columns:2.9rem minmax(0,1fr); gap:.35rem;
    align-items:baseline; padding:.22rem .5rem .22rem 0; color:var(--cinza);
    text-decoration:none; border-radius:3px; }
  .trilho a:hover { color:var(--verde); }
  .trilho a:focus-visible { outline:2px solid var(--verde); outline-offset:2px; }
  .trilho a .cod { font-family:var(--mono); font-size:.75rem;
    font-variant-numeric:tabular-nums; color:var(--cinza-fraco); }
  .trilho a:hover .cod { color:var(--verde); }
  .conteudo { padding-top:2.5rem; min-width:0; }
  .conteudo > * { max-width:var(--leitura); }
  .capa { margin-bottom:3.5rem; }
  .selo { font-family:var(--mono); font-size:.7rem; font-weight:600; letter-spacing:.11em;
    text-transform:uppercase; color:var(--verde); margin:0 0 .9rem; }
  h1 { font-family:var(--serif); font-weight:600; font-size:clamp(2.3rem,5vw,3.1rem);
    line-height:1.08; letter-spacing:-.022em; text-wrap:balance; margin:0 0 1rem; }
  .abertura { font-size:1.12rem; line-height:1.6; color:var(--cinza); margin:0 0 1.5rem; }
  h2 { font-family:var(--serif); font-weight:600; font-size:1.85rem; line-height:1.2;
    letter-spacing:-.016em; text-wrap:balance; margin:0 0 .9rem; }
  h3 { font-family:var(--serif); font-weight:600; font-size:1.24rem; line-height:1.3; margin:0 0 .5rem; }
  h4 { font-size:.76rem; font-weight:600; letter-spacing:.09em; text-transform:uppercase;
    color:var(--cinza-fraco); margin:1rem 0 .5rem; }
  p { margin:0 0 1rem; } p:last-child { margin-bottom:0; }
  a { color:var(--verde); }
  strong { font-weight:600; }
  .grupo { max-width:none; display:flex; align-items:baseline; gap:1.1rem;
    padding:3.5rem 0 1.5rem; border-bottom:2px solid var(--tinta); margin-bottom:2.5rem; }
  .grupo-num { font-family:var(--mono); font-size:2.4rem; font-weight:600; line-height:1;
    color:var(--verde); font-variant-numeric:tabular-nums; }
  .grupo-nome { font-family:var(--serif); font-size:1.85rem; font-weight:600; margin:0; }
  .grupo-desc { font-size:.9rem; color:var(--cinza); margin:0; flex:1; text-align:right;
    align-self:flex-end; }
  .aba { scroll-margin-top:1.5rem; padding-bottom:2.75rem; margin-bottom:2.75rem;
    border-bottom:1px solid var(--linha); }
  .aba:last-of-type { border-bottom:none; }
  .aba-topo { display:flex; align-items:baseline; gap:.85rem; flex-wrap:wrap; margin-bottom:.35rem; }
  .aba-cod { font-family:var(--mono); font-size:.87rem; font-weight:600;
    font-variant-numeric:tabular-nums; color:var(--verde); background:var(--verde-fraco);
    border-radius:3px; padding:.12rem .44rem; white-space:nowrap; }
  .aba-topo h3 { margin:0; }
  .etiqueta { font-family:var(--mono); font-size:.66rem; font-weight:600; letter-spacing:.07em;
    text-transform:uppercase; color:var(--cinza); border:1px solid var(--linha-forte);
    border-radius:999px; padding:.1rem .52rem; white-space:nowrap; }
  .resumo { font-size:1.02rem; color:var(--cinza); margin:0 0 1.1rem; }
  ul, ol { margin:0 0 1rem; padding-left:1.15rem; }
  li { margin-bottom:.42rem; } li:last-child { margin-bottom:0; }
  li::marker { color:var(--cinza-fraco); }
  .fluxo { display:flex; flex-wrap:wrap; align-items:center; gap:.4rem;
    font-family:var(--mono); font-size:.76rem; margin:0 0 1.1rem; }
  .fluxo span { border:1px solid var(--linha-forte); border-radius:3px; padding:.16rem .5rem;
    background:var(--superficie); }
  .fluxo .seta { border:none; background:none; color:var(--cinza-fraco); padding:0 .1rem; }
  .fluxo .fim { border-color:var(--verde); color:var(--verde); }
  .fluxo .morto { color:var(--cinza-fraco); border-style:dashed; }
  .atencao { background:var(--ambar-fraco); border-left:3px solid var(--ambar);
    padding:.85rem 1.1rem; margin:1.2rem 0 0; font-size:.94rem; }
  .atencao h4 { color:var(--ambar); margin:0 0 .3rem; }
  .rolagem { overflow-x:auto; margin:0 0 1.2rem; max-width:var(--leitura); }
  table { border-collapse:collapse; width:100%; font-size:.93rem; min-width:30rem; }
  th, td { text-align:left; padding:.52rem .9rem .52rem 0; border-bottom:1px solid var(--linha);
    vertical-align:top; }
  th { font-size:.72rem; letter-spacing:.08em; text-transform:uppercase;
    color:var(--cinza-fraco); font-weight:600; border-bottom-color:var(--linha-forte); }
  td.chave { font-family:var(--mono); font-size:.85rem; white-space:nowrap; color:var(--verde); }
  .passos { list-style:none; padding:0; counter-reset:passo; margin:0 0 1rem; }
  .passos li { counter-increment:passo; display:grid; grid-template-columns:1.9rem minmax(0,1fr);
    gap:.7rem; margin-bottom:.85rem; align-items:baseline; }
  .passos li::before { content:counter(passo); font-family:var(--mono); font-size:.78rem;
    font-weight:600; color:var(--verde); background:var(--verde-fraco); border-radius:3px;
    padding:.1rem 0; text-align:center; }
  .rodape { margin-top:4rem; padding-top:1.75rem; border-top:1px solid var(--linha);
    font-size:.88rem; color:var(--cinza-fraco); }
  @media (max-width:62rem) {
    .pagina { grid-template-columns:minmax(0,1fr); gap:0; padding:0 1.25rem 4rem; }
    .trilho { position:static; max-height:none; border-right:none;
      border-bottom:1px solid var(--linha); padding:2rem 0 1.75rem; }
    .trilho nav { display:grid; grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));
      gap:1.25rem 1.5rem; }
    .conteudo { padding-top:2rem; }
    .grupo { flex-wrap:wrap; gap:.7rem; }
    .grupo-desc { text-align:left; flex-basis:100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation:none !important; transition:none !important; scroll-behavior:auto !important; }
  }
</style>

<div class="pagina">
  <aside class="trilho">
    <p class="trilho-marca">Manual do ServiçoOS</p>
    <p class="trilho-sub">Índice por número</p>
    <nav>${indice}
    </nav>
  </aside>

  <main class="conteudo">
    <header class="capa">
      <p class="selo">Guia de uso · Todas as telas</p>
      <h1>Manual do ServiçoOS</h1>
      <p class="abertura">
        O que cada tela faz, o que dá para fazer nela, e as armadilhas que só
        aparecem depois. Escrito para ser consultado no meio do expediente —
        procure pelo número da aba e leia só o verbete que interessa.
      </p>
      <p class="abertura">
        Este manual também vive <strong>dentro do sistema</strong>: o botão
        <strong>?</strong> no topo da barra lateral abre a ajuda já no verbete da
        tela em que você está.
      </p>
    </header>
${corpo}
    <footer class="rodape">
      <p>
        Manual do ServiçoOS · Gerado a partir da mesma fonte que a ajuda dentro
        do sistema, então os dois nunca divergem. Telas e limites mudam conforme
        o plano contratado.
      </p>
    </footer>
  </main>
</div>
`

writeFileSync(saida, html, "utf8")
console.log(`ok: ${saida}`)
console.log(`  ${MANUAL.length} seções · ${MANUAL.reduce((n, s) => n + s.verbetes.length, 0)} verbetes`)
