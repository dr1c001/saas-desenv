"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { cifrar, cofreConfigurado, decifrar, decifrarTexto } from "@/lib/cofre"
import { nfeio } from "@/lib/nfeio"

export type EstadoDoCertificado = {
  erro?: string
  ok?: boolean
}

/** Teto do arquivo. Um A1 tem alguns KB; 200 KB já é folga larga, e o limite
 *  evita que alguém mande o backup inteiro achando que é o certificado. */
const MAX_BYTES = 200 * 1024

const EXTENSOES = [".pfx", ".p12"]

/**
 * O que a tela mostra sobre o certificado guardado.
 *
 * NUNCA devolve o arquivo nem a senha — nem cifrados. A tela não precisa
 * deles, e o que não sai daqui não vaza por aqui.
 */
export async function estadoDoCertificado(): Promise<{
  temCertificado: boolean
  nomeArquivo: string | null
  validoAte: string | null
  /** Quantos dias faltam. Calculado AQUI, e não na tela: `Date.now()` no corpo
   *  de um render é função impura, e servidor e navegador podem estar em fusos
   *  diferentes — a mesma tela mostraria contagens diferentes. */
  diasParaVencer: number | null
  enviadoEm: string | null
  cofrePronto: boolean
}> {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const c = await prisma.fiscalCertificate.findUnique({
    where: { tenantId },
    select: { nomeArquivo: true, validoAte: true, enviadoEm: true },
  })

  return {
    temCertificado: !!c,
    nomeArquivo: c?.nomeArquivo ?? null,
    validoAte: c?.validoAte?.toISOString() ?? null,
    diasParaVencer: c?.validoAte
      ? Math.ceil((c.validoAte.getTime() - Date.now()) / 86_400_000)
      : null,
    enviadoEm: c?.enviadoEm?.toISOString() ?? null,
    cofrePronto: cofreConfigurado(),
  }
}

/**
 * Recebe o certificado, guarda cifrado e manda para o emissor.
 *
 * **Só o DONO.** É a identidade jurídica da empresa; nem administrador troca.
 *
 * A ordem importa: cifra e grava ANTES de falar com o emissor. Se o envio
 * falhar, o arquivo está guardado e a pessoa tenta de novo sem reenviar — e o
 * erro do emissor aparece inteiro na tela, porque é ele quem sabe dizer o que
 * está errado no formato.
 */
export async function enviarCertificado(
  _prev: EstadoDoCertificado,
  formData: FormData
): Promise<EstadoDoCertificado> {
  const { tenantId, role, userId } = await getTenant()
  if (role !== "OWNER") return { erro: "semPermissao" }
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "nfse")

  // Sem cofre configurado o certificado seria gravado em claro. Recusar é o
  // único comportamento aceitável — o modo de falha perigoso seria "sem chave,
  // grava assim mesmo".
  if (!cofreConfigurado()) return { erro: "cofreAusente" }

  const arquivo = formData.get("certificado")
  const senha = (formData.get("senha") as string) || ""

  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "arquivoAusente" }
  if (arquivo.size > MAX_BYTES) return { erro: "arquivoGrande" }
  if (!EXTENSOES.some((e) => arquivo.name.toLowerCase().endsWith(e))) return { erro: "arquivoTipo" }
  // Certificado sem senha não é certificado que se instala em lugar nenhum;
  // aceitar vazio só adiaria a falha para o emissor.
  if (senha.trim().length === 0) return { erro: "senhaAusente" }

  const validoAteBruto = (formData.get("validoAte") as string) || ""
  const validoAte = validoAteBruto ? new Date(validoAteBruto) : null
  if (validoAte && Number.isNaN(validoAte.getTime())) return { erro: "validadeInvalida" }

  const bytes = Buffer.from(await arquivo.arrayBuffer())

  try {
    await prisma.fiscalCertificate.upsert({
      where: { tenantId },
      // Enviar de novo SUBSTITUI: é o que acontece na renovação anual, e
      // guardar vários criaria a pergunta "qual vale?" — cuja resposta errada
      // emite nota com certificado vencido.
      create: {
        tenantId,
        arquivo: cifrar(bytes),
        senha: cifrar(senha),
        nomeArquivo: arquivo.name,
        validoAte,
        enviadoPor: userId,
      },
      update: {
        arquivo: cifrar(bytes),
        senha: cifrar(senha),
        nomeArquivo: arquivo.name,
        validoAte,
        enviadoPor: userId,
        enviadoEm: new Date(),
      },
    })
  } catch (err) {
    // A senha JAMAIS entra no log. `err` do Prisma pode citar valores de
    // colunas em alguns erros, então nem ele vai inteiro.
    console.error("[certificado] falha ao guardar:", (err as Error).message)
    return { erro: "falhouGuardar" }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { nfeioCompanyId: true },
  })
  if (!tenant?.nfeioCompanyId) return { erro: "semEmpresaFiscal" }

  try {
    await nfeio.uploadCertificate(tenant.nfeioCompanyId, bytes, senha, arquivo.name)
  } catch (err) {
    // O erro do emissor sobe inteiro: é ele que diz se a senha está errada, se
    // o certificado venceu ou se o CNPJ não bate. Trocar isso por "não foi
    // possível" deixaria a pessoa sem saber o que corrigir.
    const msg = (err as Error).message
    console.error("[certificado] emissor recusou:", msg)
    return { erro: `emissor: ${msg}` }
  }

  revalidatePath("/settings/fiscal")
  return { ok: true }
}

/** Apaga o certificado guardado. O da empresa no emissor continua lá — quem
 *  remove de lá é o emissor, e prometer o contrário seria mentir. */
export async function apagarCertificado(): Promise<EstadoDoCertificado> {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER") return { erro: "semPermissao" }
  await requireActiveSubscription(tenantId)

  await prisma.fiscalCertificate.deleteMany({ where: { tenantId } })
  revalidatePath("/settings/fiscal")
  return { ok: true }
}

/**
 * Reenvia ao emissor o certificado já guardado.
 *
 * É a razão de guardar. Quando o emissor perde a configuração, ou a empresa
 * precisa ser recriada lá, dá para reenviar sem pedir o arquivo de novo à
 * cliente — que é justamente a hora em que ela não vai achar o .pfx.
 */
export async function reenviarCertificado(): Promise<EstadoDoCertificado> {
  const { tenantId, role } = await getTenant()
  if (role !== "OWNER") return { erro: "semPermissao" }
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "nfse")

  const [cert, tenant] = await Promise.all([
    prisma.fiscalCertificate.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { nfeioCompanyId: true } }),
  ])
  if (!cert) return { erro: "semCertificado" }
  if (!tenant?.nfeioCompanyId) return { erro: "semEmpresaFiscal" }

  try {
    await nfeio.uploadCertificate(
      tenant.nfeioCompanyId,
      decifrar(cert.arquivo),
      decifrarTexto(cert.senha),
      cert.nomeArquivo ?? "certificado.pfx"
    )
  } catch (err) {
    return { erro: `emissor: ${(err as Error).message}` }
  }

  return { ok: true }
}
