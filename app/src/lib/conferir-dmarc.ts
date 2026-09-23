import { promises as dns } from "node:dns"
import { avaliarDmarc, NOME_DMARC, type VeredictoDmarc } from "@/lib/dmarc"

/**
 * O lado que vai ao DNS. Separado de lib/dmarc.ts para `node:dns` não ser
 * arrastado por quem só precisa da constante do domínio (lib/resend.ts) —
 * precedente do "Can't resolve 'dns'" no build, PLANO_DE_ENGENHARIA.
 *
 * O resolvedor é injetável para o teste não ir à rede.
 */
export type ResolveTxt = (nome: string) => Promise<string[][]>

const padrao: ResolveTxt = (nome) => new dns.Resolver({ timeout: 2000, tries: 1 }).resolveTxt(nome)

export async function conferirDmarc(resolveTxt: ResolveTxt = padrao): Promise<VeredictoDmarc> {
  try {
    // Cada TXT pode vir em pedaços de 255 bytes: junta antes de avaliar.
    return avaliarDmarc((await resolveTxt(NOME_DMARC)).map((partes) => partes.join("")))
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    // Nome que não existe (NXDOMAIN) ou existe sem TXT: é o AUSENTE — o achado.
    if (code === "ENOTFOUND" || code === "ENODATA") return avaliarDmarc(null)
    // DNS que não respondeu não é regressão da política: tenta amanhã, sem
    // contar como erro — senão um soluço de rede acordaria o fundador à toa.
    return {
      estado: "indisponivel",
      precisaDeAcao: false,
      motivo: `DNS não respondeu (${code ?? String(e)})`,
    }
  }
}
