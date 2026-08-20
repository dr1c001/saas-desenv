import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  autenticarApi,
  corpoJson,
  erroApi,
  limiteDaBusca,
  pagina,
  paginacao,
} from "@/lib/api-auth"
import { clienteApi, clienteEntrada, errosDeValidacao } from "@/lib/api-formato"

// Cada campo é escolhido: `select` explícito e não `include`, para uma coluna
// nova adicionada ao modelo não vazar para o contrato público sem ninguém
// decidir.
const CAMPOS = {
  id: true, name: true, document: true, email: true, phone: true, whatsapp: true,
  status: true, createdAt: true,
  address: {
    select: {
      street: true, number: true, complement: true, district: true,
      city: true, state: true, zipCode: true,
      // latitude/longitude ficam de fora: são resultado da geocodificação e
      // não dado que a empresa informou. Publicá-las seria expor a precisão
      // do nosso provedor como se fosse cadastro do cliente.
    },
  },
} as const

export async function GET(req: Request) {
  const r = await autenticarApi(req)
  if (!r.ok) return r.resposta

  const url = new URL(req.url)
  const limite = limiteDaBusca(url)
  const q = url.searchParams.get("q")?.trim()

  const clientes = await prisma.client.findMany({
    // tenantId vem da CHAVE, nunca do request. É a única coisa separando as
    // empresas nesta rota.
    where: {
      tenantId: r.auth.tenantId,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    select: CAMPOS,
    orderBy: { id: "desc" },
    ...paginacao(url, limite),
  })

  return NextResponse.json(pagina(clientes.map(clienteApi), limite))
}

export async function POST(req: Request) {
  const r = await autenticarApi(req)
  if (!r.ok) return r.resposta

  const corpo = await corpoJson(req)
  if (corpo === null) return erroApi(400, "invalid_json", "Request body must be valid JSON.")

  const parsed = clienteEntrada.safeParse(corpo)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Some fields are invalid.",
          fields: errosDeValidacao(parsed.error),
        },
      },
      { status: 422 }
    )
  }

  const { address, ...dados } = parsed.data
  const criado = await prisma.client.create({
    data: {
      tenantId: r.auth.tenantId,
      name: dados.name,
      document: dados.document ?? null,
      email: dados.email ?? null,
      phone: dados.phone ?? null,
      whatsapp: dados.whatsapp ?? null,
      status: dados.status,
      // Só cria o endereço se veio algum. Uma linha de Address toda em branco
      // entraria na fila de geocodificação e gastaria crédito do Geoapify
      // tentando resolver o vazio.
      ...(address
        ? {
            address: {
              create: {
                street: address.street ?? null,
                number: address.number ?? null,
                complement: address.complement ?? null,
                district: address.neighborhood ?? null,
                city: address.city ?? null,
                state: address.state ?? null,
                zipCode: address.zip_code ?? null,
                // Sem latitude/longitude: geocodificar durante a chamada
                // gastaria crédito do Geoapify a cada request. O lote noturno
                // (lib/geocode-fila.ts) pega quem entrou por aqui com o resto.
              },
            },
          }
        : {}),
    },
    select: CAMPOS,
  })

  return NextResponse.json(clienteApi(criado), { status: 201 })
}
