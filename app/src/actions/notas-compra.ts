"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { apagarArquivo, enviarArquivo, linkTemporario } from "@/lib/storage"
import {
  caminhoDaFoto,
  caminhoPertenceAoTenant,
  MAX_FOTOS,
  validarFoto,
} from "@/lib/foto"

// A NOTA DO FORNECEDOR, anexada à ordem de compra.
//
// O anexo já servia à OS e ao orçamento; passa a servir também à compra. O
// arquivo, a compressão, o teto por registro e a exclusão são os mesmos —
// muda só quem é o dono, que é exatamente o motivo de `Attachment` ter virado
// uma tabela com vários donos possíveis em vez de três tabelas iguais.
//
// ─── Por que uma aba própria ─────────────────────────────────────────────────
//
// A nota anexada dentro da compra resolve "onde está a nota desta compra". Não
// resolve a pergunta que o dono faz de verdade: "onde está a nota daquele
// compressor que comprei em março?". Para isso é preciso ver TODAS as notas
// num lugar só, com busca — e é o que a aba faz.
//
// É também o que o contador pede, e hoje sai de uma caixa de papel.

export type EstadoNota = { erro?: string; ok?: boolean }

async function compraDoTenant(purchaseOrderId: string, tenantId: string) {
  return prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
    select: { id: true, number: true, status: true },
  })
}

export async function enviarNota(_prev: EstadoNota, formData: FormData): Promise<EstadoNota> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "stock")
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "")
  const arquivo = formData.get("foto")
  if (!(arquivo instanceof File)) return { erro: "arquivoVazio" }

  const compra = await compraDoTenant(purchaseOrderId, tenantId)
  if (!compra) return { erro: "compraNaoEncontrada" }

  const jaTem = await prisma.attachment.count({ where: { purchaseOrderId } })
  const problema = validarFoto({ type: arquivo.type, size: arquivo.size }, jaTem)
  if (problema) return { erro: problema }

  const notaId = randomUUID()
  const caminho = caminhoDaFoto(tenantId, purchaseOrderId, notaId, arquivo.type)

  await enviarArquivo(caminho, Buffer.from(await arquivo.arrayBuffer()), arquivo.type)

  // A linha só depois do upload dar certo: linha sem arquivo vira nota
  // quebrada que ninguém consegue remover pela tela.
  await prisma.attachment.create({
    data: {
      id: notaId,
      purchaseOrderId,
      url: caminho,
      name: arquivo.name.slice(0, 120),
    },
  })

  revalidatePath(`/purchases/${purchaseOrderId}`)
  revalidatePath("/notas")
  return { ok: true }
}

export async function apagarNota(notaId: string): Promise<EstadoNota> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "stock")
  // Nota fiscal é documento contábil: quem apaga é dono ou administrador.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const nota = await prisma.attachment.findFirst({
    where: { id: notaId, purchaseOrder: { tenantId } },
    select: { id: true, url: true, purchaseOrderId: true },
  })
  if (!nota || !nota.purchaseOrderId) return { erro: "naoEncontrada" }

  // O arquivo ANTES da linha: na ordem inversa, uma falha no armazenamento
  // deixaria arquivo pago sem nada apontando para ele.
  await apagarArquivo(nota.url)
  await prisma.attachment.delete({ where: { id: notaId } })

  revalidatePath(`/purchases/${nota.purchaseOrderId}`)
  revalidatePath("/notas")
  return { ok: true }
}

export type NotaExibicao = {
  id: string
  nome: string
  link: string | null
  criadaEm: Date
}

/** As notas de UMA compra, para o bloco dentro dela. */
export async function getNotasDaCompra(purchaseOrderId: string): Promise<NotaExibicao[]> {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")

  const notas = await prisma.attachment.findMany({
    where: { purchaseOrderId, purchaseOrder: { tenantId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, url: true, name: true, createdAt: true },
    take: MAX_FOTOS,
  })

  return Promise.all(
    notas.map(async (n) => ({
      id: n.id,
      nome: n.name,
      // A checagem de caminho é a mesma das fotos: um `url` adulterado no banco
      // não pode gerar link para o arquivo de outra empresa.
      link: caminhoPertenceAoTenant(n.url, tenantId) ? await linkTemporario(n.url) : null,
      criadaEm: n.createdAt,
    }))
  )
}

export type NotaNaLista = NotaExibicao & {
  compra: { id: string; number: number; fornecedor: string | null; total: number }
}

/**
 * TODAS as notas da empresa, para a aba.
 *
 * A busca cobre nome do arquivo, fornecedor e número da compra — que são as
 * três formas de alguém procurar uma nota meses depois: pelo que escreveu no
 * arquivo, por quem vendeu, ou pelo número que está no e-mail.
 */
export async function getNotas(busca?: string): Promise<NotaNaLista[]> {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")

  const q = busca?.trim()
  // `PurchaseOrder.number` é INT4. Um texto só de dígitos pode ser a chave de
  // acesso da NF-e (44 dígitos) ou um CNPJ (14) — coisas que alguém COLA neste
  // campo, porque o rótulo convida a buscar por número. Sem o teto, o Prisma
  // lança "Unable to fit integer value into an INT4", a página inteira devolve
  // 500, e o texto fica gravado na URL — a aba continua quebrada ao recarregar.
  const comoNumero = q && /^\d+$/.test(q) ? Number(q) : NaN
  const numeroBuscado =
    Number.isSafeInteger(comoNumero) && comoNumero <= 2147483647 ? comoNumero : null

  const notas = await prisma.attachment.findMany({
    where: {
      // O escopo da empresa vale SEMPRE, e fica fora da busca: dentro do `OR`
      // ele seria só mais uma alternativa, e uma busca por texto passaria a
      // devolver nota de outra empresa.
      purchaseOrder: { tenantId },
      ...(q
        ? {
            // Um `OR` só, no nível do anexo. A primeira versão tinha dois em
            // níveis diferentes — o que os transforma em E: procurar "Polar"
            // exigiria que o nome do arquivo E o fornecedor casassem, e a
            // busca não acharia quase nada.
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              {
                purchaseOrder: {
                  supplier: { name: { contains: q, mode: "insensitive" as const } },
                },
              },
              // Número só quando o texto É um número: `Number("abc")` daria
              // NaN e a consulta falharia.
              ...(numeroBuscado !== null
                ? [{ purchaseOrder: { number: numeroBuscado } }]
                : []),
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      url: true,
      name: true,
      createdAt: true,
      purchaseOrder: {
        select: {
          id: true,
          number: true,
          total: true,
          supplier: { select: { name: true } },
        },
      },
    },
  })

  return Promise.all(
    notas.map(async (n) => ({
      id: n.id,
      nome: n.name,
      link: caminhoPertenceAoTenant(n.url, tenantId) ? await linkTemporario(n.url) : null,
      criadaEm: n.createdAt,
      compra: {
        id: n.purchaseOrder!.id,
        number: n.purchaseOrder!.number,
        fornecedor: n.purchaseOrder!.supplier?.name ?? null,
        total: Number(n.purchaseOrder!.total),
      },
    }))
  )
}
