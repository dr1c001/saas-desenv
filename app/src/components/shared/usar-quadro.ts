"use client"

import { useEffect, type RefObject } from "react"
import type SignatureCanvas from "react-signature-canvas"

/**
 * Faz o quadro de desenho ter o tamanho da caixa em que ele aparece.
 *
 * Um `<canvas>` tem DOIS tamanhos, e confundi-los é o defeito clássico:
 *
 *   - o BUFFER de desenho — os atributos `width`/`height`, que valem 300×150
 *     quando ninguém define;
 *   - o tamanho EXIBIDO — o que o CSS diz.
 *
 * Quando só o CSS é definido, um buffer de 300×150 é esticado para preencher a
 * caixa. O traço é gravado em coordenadas da TELA e escrito no BUFFER, que tem
 * outra escala: numa caixa larga, o que a pessoa desenha à direita cai fora do
 * buffer e simplesmente não existe. `getTrimmedCanvas()` não acha pixel nenhum,
 * devolve um canvas vazio, e o `toDataURL()` disso não é um PNG — a gravação é
 * recusada e a pessoa nunca descobre por quê.
 *
 * Foi exatamente o que aconteceu com as assinaturas da equipe: seis pessoas na
 * tela de Configurações, nenhuma assinatura gravada.
 *
 * Aqui o buffer é ajustado à caixa medida, multiplicado pela densidade da tela
 * (senão o traço sai serrilhado no celular), e o contexto é escalado para que
 * as coordenadas continuem sendo as da tela.
 *
 * O quadro precisa ter LARGURA E ALTURA vindas do CSS. Se a altura viesse do
 * atributo, mexer no buffer mudaria a caixa, a caixa dispararia a medição de
 * novo, e isso não pararia — daí a guarda de "já está no tamanho certo", que
 * torna o ajuste idempotente.
 */
export function useQuadroNoTamanhoDaCaixa(
  quadro: RefObject<SignatureCanvas | null>,
  /** Redimensionar zera o desenho, então o ajuste só roda enquanto o quadro
   *  está na tela. Passe `false` quando ele estiver escondido. */
  ativo = true
) {
  useEffect(() => {
    if (!ativo) return
    const pad = quadro.current
    if (!pad) return
    const canvas = pad.getCanvas()

    function ajustar() {
      const pad = quadro.current
      if (!pad) return
      // Teto de 3: acima disso o ganho é invisível e o PNG só engorda.
      const densidade = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3)
      const caixa = canvas.getBoundingClientRect()
      const largura = Math.round(caixa.width * densidade)
      const altura = Math.round(caixa.height * densidade)
      if (!largura || !altura) return
      if (canvas.width === largura && canvas.height === altura) return

      // Mexer no buffer APAGA o desenho. Guardar e repor os traços evita que
      // girar o celular no meio da assinatura jogue fora o que já foi feito.
      const tracos = pad.toData()
      canvas.width = largura
      canvas.height = altura
      canvas.getContext("2d")?.scale(densidade, densidade)
      pad.fromData(tracos)
    }

    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)
    return () => observador.disconnect()
  }, [quadro, ativo])
}
