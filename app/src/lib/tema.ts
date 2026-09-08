"use client"

// Claro ou escuro, num lugar só.
//
// A classe `dark` no <html> é estado EXTERNO ao React: quem a escreve primeiro
// é o script inline em layout.tsx, antes da hidratação, para a página não
// piscar branca antes de virar escura. Por isso `useSyncExternalStore`, e não
// estado local com efeito — o React não é dono deste valor, ele o observa.
//
// Vive em lib/ porque agora tem DOIS consumidores: o item da barra lateral,
// dentro do painel, e o botão da landing, onde quem visita ainda não tem conta.
// Antes disso a lógica morava dentro do componente da barra lateral, e a
// landing simplesmente não tinha como trocar de tema.

import { useSyncExternalStore } from "react"

const ouvintes = new Set<() => void>()

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar)
  return () => ouvintes.delete(aoMudar)
}

function agora() {
  return document.documentElement.classList.contains("dark")
}

/** No servidor não há como saber: `false` e o React corrige na hidratação. */
function noServidor() {
  return false
}

export function definirTema(escuro: boolean) {
  document.documentElement.classList.toggle("dark", escuro)
  localStorage.setItem("theme", escuro ? "dark" : "light")
  ouvintes.forEach((avisar) => avisar())
}

/** Está no modo escuro? */
export function useTemaEscuro(): boolean {
  return useSyncExternalStore(assinar, agora, noServidor)
}
