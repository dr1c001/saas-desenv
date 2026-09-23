// O que cada card da vitrine PROMETE, em recursos.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// A grade "Tudo que sua empresa precisa" da landing traz dez cards sem nenhuma
// marca de plano. Cinco deles prometem coisa que o Starter de R$ 97 não
// entrega: o Mapa GPS e o Checklist são cards INTEIROS do Pro; e "Ordens de
// Serviço", "Relatórios Inteligentes" e "Gestão de Equipe" vendem, no meio de
// um texto verdadeiro, uma cláusula paga — a assinatura digital do cliente, o
// desempenho por técnico e a localização de cada profissional em campo.
//
// O Starter libera UM recurso (`POR_PLANO.starter.recursos === ["nfse"]`, em
// lib/plan.ts). Quem lia a grade, decidia que o sistema fazia tudo aquilo e
// assinava o plano de entrada descobria no primeiro serviço que o cliente não
// consegue assinar, que o checklist não abre e que o mapa não existe — e
// recebia "faz parte do plano Pro. Faça upgrade".
//
// ─── Por que um módulo, e não um selo escrito no JSON ────────────────────────
//
// Um selo escrito à mão no texto é uma TERCEIRA fonte de verdade, que envelhece
// como as outras duas envelheceram. Aqui se declara só o que o card promete; o
// selo é DERIVADO por `planoMinimo` (lib/plan.ts) a partir de POR_PLANO. No dia
// em que `signature` entrar no Starter, o selo some sozinho — ninguém precisa
// lembrar de editar texto.
//
// Módulo PURO, como lib/recursos.ts e pela mesma razão: a landing é Server
// Component, mas arrastar o Prisma para cá quebraria qualquer uso em cliente.
// (Achado na auditoria de 13/09/2026, grupo 9.)

import type { Recurso } from "./recursos"

export type CardDaVitrine = {
  /**
   * Trecho distintivo do título, nos dois idiomas.
   *
   * A lista é 1:1 por POSIÇÃO com `landing.features.items`, e posição é frágil:
   * inserir um card no meio do JSON deslocaria todos os selos sem que nada
   * quebrasse. A âncora prende a posição ao CONTEÚDO — o teste confere que o
   * título do item `i` contém a âncora do card `i`.
   */
  ancora: { pt: string; en: string }
  /** O card INTEIRO depende destes: leva selo no card. */
  recursos: Recurso[]
  /** Só UMA cláusula do card depende: vira a linha `pro` do JSON, com selo próprio. */
  recursosPro: Recurso[]
}

/**
 * Alinhado 1:1, na mesma ordem, com `landing.features.items` de messages/*.json
 * e com `featureIcons` de app/page.tsx.
 */
export const CARDS_DA_VITRINE: readonly CardDaVitrine[] = [
  // [0] Ordens de Serviço — a OS em si é livre; a assinatura do cliente não.
  { ancora: { pt: "Ordens de Serviço", en: "Service Orders" }, recursos: [], recursosPro: ["signature"] },
  // [1] Mapa GPS — o card inteiro.
  { ancora: { pt: "Mapa GPS", en: "GPS Map" }, recursos: ["gpsMap"], recursosPro: [] },
  // [2] Financeiro — livre.
  { ancora: { pt: "Financeiro", en: "Finances" }, recursos: [], recursosPro: [] },
  // [3] Orçamentos — livre.
  { ancora: { pt: "Orçamentos", en: "Quotes" }, recursos: [], recursosPro: [] },
  // [4] Checklist — o card inteiro.
  { ancora: { pt: "Checklist", en: "Checklist" }, recursos: ["checklist"], recursosPro: [] },
  // [5] Relatórios — os painéis básicos são livres; desempenho por técnico,
  //     ranking de clientes e período personalizado são `advancedReports`
  //     (actions/reports.ts devolve a seção VAZIA no Starter).
  { ancora: { pt: "Relatórios", en: "Reports" }, recursos: [], recursosPro: ["advancedReports"] },
  // [6] Gestão de Equipe — permissões e agenda são livres; a localização é gpsMap.
  { ancora: { pt: "Equipe", en: "Team" }, recursos: [], recursosPro: ["gpsMap"] },
  // [7] NFS-e — está no Starter desde 30/08/2026; o que separa os planos é a COTA.
  { ancora: { pt: "NFS-e", en: "E-Invoice" }, recursos: [], recursosPro: [] },
  // [8] Recibos — livre. A "assinatura" do texto é a da EMPRESA, guardada em
  //     Configurações, e não a `signature` do cliente: nenhuma trava de recurso
  //     passa por /receipts nem pela rota do PDF.
  { ancora: { pt: "Recibos", en: "Receipts" }, recursos: [], recursosPro: [] },
  // [9] Manutenção interna — livre.
  { ancora: { pt: "Manutenção", en: "Maintenance" }, recursos: [], recursosPro: [] },
]
