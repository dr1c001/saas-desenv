"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { geocodeAddress } from "@/lib/geocode"
import { avancarFila } from "@/lib/geocode-fila"
import { getTranslations } from "next-intl/server"
import { translateFieldErrors } from "@/lib/validation"
import { lerPlanilha, PlanilhaInvalida } from "@/lib/planilha"
import {
  analisarPlanilha,
  chavesDeDuplicidade,
  ImportacaoInvalida,
  soDigitos,
  type Ocorrencia,
} from "@/lib/importar-clientes"
import { getCustomFields } from "@/actions/custom-fields"
import { lerValoresDoFormulario, nomeDoInput } from "@/lib/custom-fields"

const clientSchema = z.object({
  name: z.string().min(2, "nameRequired"),
  document: z.string().optional(),
  email: z.string().email("invalidEmail").optional().or(z.literal("")),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DEFAULTER"]).default("ACTIVE"),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
})

export type ClientFormState = {
  errors?: Record<string, string[]>
  message?: string
}

// Lê os campos que a própria empresa criou. Fica aqui, compartilhado entre
// criar e editar, porque divergir entre os dois significaria campo obrigatório
// cobrado no cadastro e ignorado na edição — ou o contrário.
async function lerCamposPersonalizados(
  formData: FormData
): Promise<{ valores: Record<string, string>; erro?: ClientFormState }> {
  const definicoes = await getCustomFields("CLIENT")
  if (definicoes.length === 0) return { valores: {} }

  const { valores, erros } = lerValoresDoFormulario(definicoes, (nome) => {
    const v = formData.get(nome)
    return typeof v === "string" ? v : null
  })

  if (erros.length > 0) {
    const t = await getTranslations("customFields.errors")
    return {
      valores,
      erro: {
        // Chaveado pelo nome do input, igual aos campos nativos, pra que a
        // tela possa apontar o campo exato quando for exibir por campo.
        errors: Object.fromEntries(
          erros.map((e) => [nomeDoInput(e.fieldId), [t(e.motivo as "obrigatorio", { campo: e.label })]])
        ),
        message: t(erros[0].motivo as "obrigatorio", { campo: erros[0].label }),
      },
    }
  }

  return { valores }
}

export async function createClient(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const raw = Object.fromEntries(formData.entries())
  const parsed = clientSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }
  }

  const { name, document, email, phone, whatsapp, status, ...address } = parsed.data

  const personalizados = await lerCamposPersonalizados(formData)
  if (personalizados.erro) return personalizados.erro

  const coords = await geocodeAddress(address)

  await prisma.client.create({
    data: {
      name,
      document: document || null,
      email: email || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
      status,
      customValues: personalizados.valores,
      tenantId,
      address: {
        create: {
          street: address.street || null,
          number: address.number || null,
          complement: address.complement || null,
          district: address.district || null,
          city: address.city || null,
          state: address.state || null,
          zipCode: address.zipCode || null,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
        },
      },
    },
  })

  revalidatePath("/clients")
  redirect("/clients")
}

export async function updateClient(
  id: string,
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // createClient fica sem checagem (technician cadastra cliente em campo,
  // fluxo legítimo), mas updateClient também permite marcar o cliente como
  // DEFAULTER (inadimplente) — isso precisa de OWNER/ADMIN.
  // (Achado em revisão de segurança 2026-07-19.)
  const tCommon = await getTranslations("common")
  if (role !== "OWNER" && role !== "ADMIN") return { message: tCommon("noPermission") }

  const raw = Object.fromEntries(formData.entries())
  const parsed = clientSchema.safeParse(raw)

  if (!parsed.success) {
    return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }
  }

  const { name, document, email, phone, whatsapp, status, ...address } = parsed.data

  const personalizados = await lerCamposPersonalizados(formData)
  if (personalizados.erro) return personalizados.erro

  // Só geocodifica se o endereço realmente mudou.
  //
  // Antes chamava a API em TODA edição — trocar o telefone do cliente gastava
  // uma consulta à toa. Pior: quando a consulta falhava (tempo limite, provedor
  // fora do ar, endereço não encontrado), o update gravava null e APAGAVA a
  // coordenada que já existia. O cliente saía do mapa por causa de uma edição
  // que não tinha nada a ver com o endereço, sem erro nenhum na tela.
  const atual = await prisma.address.findUnique({
    where: { clientId: id },
    select: { street: true, number: true, city: true, state: true, latitude: true, longitude: true },
  })
  // Compara só o que entra na consulta de geocodificação (ver consultasPara):
  // mudar complemento ou CEP não muda o pino, então não vale uma consulta.
  const mudouEndereco =
    !atual ||
    (atual.street ?? null) !== (address.street || null) ||
    (atual.number ?? null) !== (address.number || null) ||
    (atual.city ?? null) !== (address.city || null) ||
    (atual.state ?? null) !== (address.state || null)

  const coords = mudouEndereco
    ? await geocodeAddress(address)
    : atual.latitude !== null && atual.longitude !== null
      ? { latitude: atual.latitude, longitude: atual.longitude }
      : null

  await prisma.client.update({
    where: { id, tenantId },
    data: {
      name,
      document: document || null,
      email: email || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
      status,
      customValues: personalizados.valores,
      address: {
        upsert: {
          create: {
            street: address.street || null,
            number: address.number || null,
            complement: address.complement || null,
            district: address.district || null,
            city: address.city || null,
            state: address.state || null,
            zipCode: address.zipCode || null,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
          },
          update: {
            street: address.street || null,
            number: address.number || null,
            complement: address.complement || null,
            district: address.district || null,
            city: address.city || null,
            state: address.state || null,
            zipCode: address.zipCode || null,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            // Endereço novo devolve o cliente pra fila: corrigir a cidade
            // digitada errada tem que dar nova chance a quem já esgotou as
            // tentativas (ver MAX_TENTATIVAS em lib/geocode-fila.ts).
            ...(mudouEndereco ? { geocodeTries: 0 } : {}),
          },
        },
      },
    },
  })

  revalidatePath("/clients")
  redirect(`/clients/${id}`)
}

export async function deleteClient(id: string) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") redirect("/clients")
  await prisma.client.delete({ where: { id, tenantId } })
  revalidatePath("/clients")
  redirect("/clients")
}

export async function getClients(filters?: { q?: string; status?: string }) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.client.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { document: { contains: filters.q, mode: "insensitive" } },
              { email: { contains: filters.q, mode: "insensitive" } },
              { phone: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { address: true, _count: { select: { serviceOrders: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getClient(id: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.client.findUnique({
    where: { id, tenantId },
    include: {
      address: true,
      serviceOrders: {
        select: { id: true, number: true, title: true, status: true, totalAmount: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  })
}

// ─── Importação por planilha ─────────────────────────────────────────────────
//
// Motivo de existir: o cliente que assina já tem a carteira dele numa planilha.
// Sem importar, ele teria que digitar centenas de cadastros à mão pra começar a
// usar — e não digita: abandona no primeiro dia. Era o buraco mais caro do
// produto, porque acontecia antes de ele ver qualquer valor.
//
// O trabalho pesado (ler o arquivo, mapear colunas, validar, achar duplicado)
// mora em lib/planilha.ts e lib/importar-clientes.ts, que são puros e testados.
// Aqui fica só o que precisa de sessão e banco.

const TAMANHO_LOTE = 200

export type ResultadoImportacao = {
  ok: boolean
  motivo?: string
  importados?: number
  jaExistiam?: number
  duplicadosNoArquivo?: number
  totalLinhas?: number
  erros?: Ocorrencia[]
  avisos?: Ocorrencia[]
}

export async function importClients(
  _prev: ResultadoImportacao,
  formData: FormData
): Promise<ResultadoImportacao> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)

  // createClient roda sem checagem de cargo de propósito (técnico cadastra
  // cliente em campo). Importar em massa é outra coisa: mexe na carteira
  // inteira de uma vez e é irreversível pela tela, então exige OWNER/ADMIN.
  //
  // `motivo` é sempre CHAVE de tradução, nunca texto pronto: a tela resolve
  // com t(`reasons.${motivo}`). Devolver a mensagem já traduzida aqui faria a
  // tela procurar uma chave chamada "Sem permissão" e quebrar.
  if (role !== "OWNER" && role !== "ADMIN") return { ok: false, motivo: "semPermissao" }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, motivo: "arquivoVazio" }
  }

  let analise
  try {
    const linhas = lerPlanilha(Buffer.from(await arquivo.arrayBuffer()), arquivo.name)
    analise = analisarPlanilha(linhas)
  } catch (e) {
    // Os dois erros carregam `motivo`, que é chave de tradução — a tela decide
    // o idioma e o texto. Qualquer outra exceção sobe pro Sentry.
    if (e instanceof PlanilhaInvalida || e instanceof ImportacaoInvalida) {
      return { ok: false, motivo: e.motivo }
    }
    throw e
  }

  // Duplicados contra o que já está no banco. Documento é comparado só por
  // dígitos porque o cadastro guarda formatado ("123.456.789-09") e a planilha
  // costuma vir sem pontuação — comparar cru deixaria passar o mesmo cliente.
  const existentes = await prisma.client.findMany({
    where: { tenantId },
    select: { document: true, email: true },
  })
  const jaNoBanco = new Set<string>()
  for (const c of existentes) {
    const doc = c.document ? soDigitos(c.document) : ""
    if (doc.length >= 11) jaNoBanco.add(`doc:${doc}`)
    if (c.email) jaNoBanco.add(`email:${c.email.toLowerCase()}`)
  }

  const novos = analise.clientes.filter(
    (c) => !chavesDeDuplicidade(c).some((k) => jaNoBanco.has(k))
  )
  const jaExistiam = analise.clientes.length - novos.length

  // Escrita aninhada em vez de createMany + createMany: createManyAndReturn não
  // garante que a ordem devolvida bate com a de entrada, e casar endereço com
  // cliente por posição erraria em silêncio — cada cliente com o endereço do
  // vizinho. O Prisma faz a ligação certa aqui.
  //
  // Sem geocodificar aqui dentro: nem mesmo em lote, porque o lote é
  // assíncrono e a importação não pode ficar esperando o job do provedor
  // enquanto o usuário olha a tela. O que se faz é DISPARAR o lote logo
  // depois de gravar (ver abaixo) — o resultado é colhido pelo cron.
  let importados = 0
  for (let i = 0; i < novos.length; i += TAMANHO_LOTE) {
    const lote = novos.slice(i, i + TAMANHO_LOTE)
    await prisma.$transaction(
      lote.map((c) =>
        prisma.client.create({
          data: {
            name: c.name,
            document: c.document,
            email: c.email,
            phone: c.phone,
            whatsapp: c.whatsapp,
            status: c.status,
            tenantId,
            // Endereço só quando há algo pra guardar: linha vazia viraria um
            // registro em branco que o backfill de coordenadas ficaria varrendo
            // todo dia sem nunca ter o que geocodificar.
            ...(c.street || c.city || c.zipCode || c.district
              ? {
                  address: {
                    create: {
                      street: c.street,
                      number: c.number,
                      complement: c.complement,
                      district: c.district,
                      city: c.city,
                      state: c.state,
                      zipCode: c.zipCode,
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
        })
      )
    )
    // Contado por lote já gravado: se a função for interrompida no meio, os
    // lotes anteriores estão commitados e reimportar o mesmo arquivo os
    // reconhece como já existentes em vez de duplicar.
    importados += lote.length
  }

  // Dispara o lote de geocodificação já, sem esperar o cron da madrugada:
  // quem acabou de importar 800 clientes quer ver o mapa hoje, não amanhã.
  // Nunca derruba a importação — os clientes já estão gravados, e o cron
  // pega a fila de qualquer jeito se isto falhar.
  try {
    await avancarFila()
  } catch (e) {
    console.error("Falha ao enfileirar geocodificação da importação:", e)
  }

  revalidatePath("/clients")

  return {
    ok: true,
    importados,
    jaExistiam,
    duplicadosNoArquivo: analise.duplicadosNoArquivo,
    totalLinhas: analise.totalLinhas,
    erros: analise.erros,
    avisos: analise.avisos,
  }
}
