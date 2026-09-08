// O formato que a API devolve, e o que ela aceita.
//
// Módulo separado e PURO porque este é o contrato público: o que sai daqui é
// o que os sistemas dos clientes vão ler, e mudar um nome de campo quebra a
// integração deles sem aviso. Ficando junto, dá para ver o contrato inteiro
// numa tela — e ver que ele NÃO é o modelo do banco.
//
// A separação é de propósito. Devolver a linha do Prisma direto publicaria
// cada coluna nova que alguém adicionasse, incluindo as internas (clientToken,
// que dá acesso ao portal público da OS). Aqui a lista é explícita: campo que
// não está escrito não sai.

import { z } from "zod"

const dinheiro = (v: unknown) => Number(v ?? 0)
const iso = (d: Date | null) => (d ? d.toISOString() : null)

export type ClienteApi = ReturnType<typeof clienteApi>

export function clienteApi(c: {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  status: string
  // Endereço é relação (model Address), e pode não existir.
  address: {
    street: string | null
    number: string | null
    complement: string | null
    district: string | null
    city: string | null
    state: string | null
    zipCode: string | null
  } | null
  createdAt: Date
}) {
  return {
    id: c.id,
    name: c.name,
    document: c.document,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    status: c.status,
    // `neighborhood` no contrato público, `district` no banco. O nome de fora
    // é o que o consumidor entende; renomear a coluna agora quebraria o resto
    // do sistema por causa da API.
    address: {
      street: c.address?.street ?? null,
      number: c.address?.number ?? null,
      complement: c.address?.complement ?? null,
      neighborhood: c.address?.district ?? null,
      city: c.address?.city ?? null,
      state: c.address?.state ?? null,
      zip_code: c.address?.zipCode ?? null,
    },
    created_at: c.createdAt.toISOString(),
  }
}

export function ordemApi(o: {
  id: string
  number: number
  title: string
  description: string | null
  status: string
  scheduledAt: Date | null
  totalAmount: unknown
  conclusionNote: string | null
  createdAt: Date
  client: { id: string; name: string }
  technician: { id: string; name: string } | null
  items?: { description: string; quantity: unknown; unitPrice: unknown; total: unknown }[]
}) {
  return {
    id: o.id,
    number: o.number,
    title: o.title,
    description: o.description,
    status: o.status,
    scheduled_at: iso(o.scheduledAt),
    total_amount: dinheiro(o.totalAmount),
    conclusion_note: o.conclusionNote,
    client: { id: o.client.id, name: o.client.name },
    technician: o.technician ? { id: o.technician.id, name: o.technician.name } : null,
    items: (o.items ?? []).map((i) => ({
      description: i.description,
      quantity: dinheiro(i.quantity),
      unit_price: dinheiro(i.unitPrice),
      total: dinheiro(i.total),
    })),
    created_at: o.createdAt.toISOString(),
  }
}

// ─── O que a API aceita ──────────────────────────────────────────────────────
//
// Schemas próprios, e não os do formulário: aqueles falam FormData (tudo
// string) e devolvem erro traduzido para a tela. Aqui a entrada é JSON com
// tipos de verdade, e a mensagem é em inglês porque quem lê é um programa.

const textoOpcional = z.string().trim().max(255).nullish()

export const clienteEntrada = z.object({
  name: z.string().trim().min(1, "name is required").max(255),
  document: textoOpcional,
  email: z.string().trim().email("email must be a valid address").max(255).nullish(),
  phone: textoOpcional,
  whatsapp: textoOpcional,
  status: z.enum(["ACTIVE", "INACTIVE", "DEFAULTER"]).default("ACTIVE"),
  address: z
    .object({
      street: textoOpcional,
      number: textoOpcional,
      complement: textoOpcional,
      neighborhood: textoOpcional,
      city: textoOpcional,
      state: z.string().trim().length(2, "state must be a 2-letter code").nullish(),
      zip_code: textoOpcional,
    })
    .optional(),
})

export const ordemEntrada = z.object({
  client_id: z.string().trim().min(1, "client_id is required"),
  title: z.string().trim().min(1, "title is required").max(255),
  description: z.string().trim().max(5000).nullish(),
  technician_id: z.string().trim().nullish(),
  // Status inicial limitado: quem cria uma OS pela API está abrindo trabalho.
  // Aceitar DONE ou INVOICED deixaria criar receita e nota fiscal por aqui,
  // pulando conclusão, estoque e assinatura.
  status: z.enum(["OPEN", "IN_PROGRESS"]).default("OPEN"),
  scheduled_at: z.iso.datetime({ message: "scheduled_at must be an ISO 8601 datetime" }).nullish(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "item description is required").max(255),
        quantity: z.number().positive("quantity must be greater than zero"),
        unit_price: z.number().min(0, "unit_price cannot be negative"),
      })
    )
    .max(100)
    .optional(),
})

/** Erros de validação no formato que a API devolve: uma lista, com o caminho
 *  do campo. Um programa consegue apontar qual campo corrigir; uma frase só,
 *  não. */
export function errosDeValidacao(erro: z.ZodError): { field: string; message: string }[] {
  return erro.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
}
