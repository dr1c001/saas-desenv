"use server"

import { prisma } from "@/lib/prisma"
import { reconciliarComissao } from "@/lib/comissao-db"
import { formatOsNumber } from "@/lib/utils"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireCotaDeNfse, requireRecurso } from "@/lib/plan"
import { ehRecusaCerta } from "@/lib/tempo-limite"
import { nfeio } from "@/lib/nfeio"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { quemPaga } from "@/lib/subcliente"

export async function registerFiscalCompany(formData: FormData) {
  const { tenantId, role } = await getTenant()
  // Página /settings/fiscal já é OWNER-only — a action precisa da mesma
  // checagem, senão ADMIN/TECHNICIAN chamam direto e sobrescrevem o CNPJ/
  // config fiscal usado em toda nota futura. (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER") throw new Error((await getTranslations("common"))("noPermission"))
  await requireActiveSubscription(tenantId)
  // Cadastrar a empresa no emissor fiscal já é parte do recurso de NFS-e.
  await requireRecurso(tenantId, "nfse")

  // A partir de 01/08/2026 a Receita Federal passa a emitir CNPJ alfanumérico
  // (letras nas 12 primeiras posições, ex: "12ABC345000A92") — \D removia
  // qualquer letra, corrompendo o documento antes de mandar pro nfe.io.
  // Mantém letras/dígitos, só remove pontuação (., /, -).
  // (Achado verificando o sistema de NFS-e, 2026-07-22.)
  const cnpj = (formData.get("cnpj") as string).replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const municipalTaxNumber = formData.get("municipalTaxNumber") as string
  const email = formData.get("email") as string
  const postalCode = (formData.get("postalCode") as string).replace(/\D/g, "")
  const street = formData.get("street") as string
  const number = formData.get("number") as string
  const district = formData.get("district") as string
  const cityCode = formData.get("cityCode") as string
  const cityName = formData.get("cityName") as string
  const state = formData.get("state") as string
  const issRate = parseFloat((formData.get("issRate") as string) || "5")

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new Error((await getTranslations("errors"))("tenantNotFound"))

  // ─── RESERVA antes de cadastrar no emissor ──────────────────────────────
  //
  // O certificado A1 é instalado NA empresa do emissor, pelo id (ver
  // actions/certificado.ts). Uma SEGUNDA empresa na nfe.io — clique duplo
  // antes do redirect, retry, ou chamada direta à Action, que é endereço HTTP
  // — sobrescrevia o id e orfanava o certificado: toda nota passava a sair
  // contra uma empresa sem certificado, falhando, com a tela mostrando
  // "Configurado" em verde. A tela escondia o formulário; a Action não tinha
  // guarda nenhuma.
  //
  // Mesmo molde da reserva de `emitNfse` logo abaixo: `updateMany` condicionado
  // a `nfeioCompanyId: null`. Quem decide quem chegou primeiro é o Postgres, e
  // o segundo recebe count 0. (Achado na auditoria de 13/09/2026.)
  const RESERVA = `reservando:${tenantId}`
  const reserva = await prisma.tenant.updateMany({
    where: { id: tenantId, nfeioCompanyId: null },
    data: { nfeioCompanyId: RESERVA },
  })
  if (reserva.count === 0) throw new Error((await getTranslations("errors"))("fiscalJaConfigurado"))

  let company
  try {
    company = await nfeio.createCompany({
    name: tenant.name,
    federalTaxNumber: cnpj,
    municipalTaxNumber: municipalTaxNumber || undefined,
    email,
    address: {
      country: "BRA",
      postalCode,
      street,
      number,
      district,
      city: { code: cityCode, name: cityName },
      state,
    },
    issRate,
    rpsSerialNumber: "1",
    })
  } catch (e) {
    // A mesma distinção de `emitNfse`: o emissor RESPONDEU e recusou (dado
    // inválido no formulário) devolve a reserva, para a pessoa corrigir e
    // tentar de novo. Tempo esgotado, conexão caída ou 5xx é "não sei se a
    // empresa foi criada" — e aí a reserva FICA: criar a segunda seria
    // orfanar o certificado. O suporte destrava.
    if (ehRecusaCerta(e)) {
      await prisma.tenant.updateMany({
        where: { id: tenantId, nfeioCompanyId: RESERVA },
        data: { nfeioCompanyId: null },
      })
      throw e
    }
    console.error(`[fiscal] cadastro sem resposta conclusiva no tenant ${tenantId} — reserva mantida:`, e)
    throw new Error((await getTranslations("errors"))("fiscalSemResposta"))
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      nfeioCompanyId: company.id,
      fiscalCnpj: cnpj,
      fiscalMunicipalCode: cityCode,
      fiscalCityName: cityName,
      fiscalStateCode: state,
      fiscalIssRate: issRate,
    },
  })

  revalidatePath("/settings/fiscal")
}

export async function emitNfse(orderId: string) {
  const { tenantId, role } = await getTenant()
  // Emite nota fiscal real e irreversível (sem cancelamento implementado no
  // produto) — não pode ficar acessível a qualquer papel.
  // (Achado em revisão de segurança 2026-07-19.)
  if (role !== "OWNER" && role !== "ADMIN") throw new Error((await getTranslations("common"))("noPermission"))
  await requireActiveSubscription(tenantId)
  // "Emissão de NFS-e" é vendida a partir do plano Pro.
  await requireRecurso(tenantId, "nfse")
  // E vendida com NÚMERO: "8 notas fiscais por mês" no Starter, 70 no Pro.
  // Até 21/08/2026 nada contava nota emitida — a promessa existia só na
  // vitrine. Barra ANTES de falar com a NFE.io: passar da cota e emitir a nota
  // mesmo assim seria irreversível (não há cancelamento no produto).
  await requireCotaDeNfse(tenantId)

  const [order, tenant] = await Promise.all([
    prisma.serviceOrder.findUnique({
      where: { id: orderId, tenantId },
      include: {
        client: { include: { address: true, parent: { include: { address: true } } } },
        payer: { include: { address: true } },
        items: true,
      },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId } }),
  ])

  const te = await getTranslations("errors")
  if (!order) throw new Error(te("orderNotFound"))
  if (!tenant?.nfeioCompanyId) throw new Error(te("configureFiscal"))
  if (order.nfseId) throw new Error(te("nfseAlreadyIssued"))

  const amount = Number(order.totalAmount)
  if (amount <= 0) throw new Error(te("orderWithoutAmount"))

  const description =
    order.items.length > 0
      ? order.items.map((i) => i.description).join("; ")
      : order.title

  // ─── O TOMADOR DA NOTA É QUEM PAGA, e nem sempre é o cliente da OS ────
  //
  // Quando o serviço é feito para o cliente final de uma contratante — uma
  // administradora que fecha contrato e o serviço acontece em cada condomínio —
  // o `clientId` da OS é o CONDOMÍNIO, que é onde o trabalho aconteceu. Mas a
  // nota tem de sair contra quem tem o contrato e paga.
  //
  // Emitir contra o CNPJ errado não é detalhe de tela: é documento fiscal
  // contra terceiro, no nome da empresa do cliente, perante a prefeitura — e
  // não existe cancelamento neste produto.
  //
  // `quemPaga` resolve: o pagador escolhido naquela OS quando é válido, senão
  // o contratante, senão o próprio cliente. Regra e testes em lib/subcliente.ts.
  const idDoPagador = quemPaga(
    { id: order.clientId, parentId: order.client.parentId },
    order.payerId
  )
  const pagador =
    idDoPagador === order.clientId
      ? order.client
      : (order.payer ?? order.client.parent ?? order.client)

  // Mesmo motivo do cnpj em registerFiscalCompany acima — o documento do
  // cliente (CNPJ, se for pessoa jurídica) pode vir com letras a partir de
  // 01/08/2026. CPF continua só numérico, então isso não afeta esse caso.
  const clientDoc = pagador.document?.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || undefined
  const addr = pagador.address

  // ─── RESERVA antes de emitir ────────────────────────────────────────────
  //
  // A emissão na nfe.io cria um documento fiscal DE VERDADE, e o produto não
  // tem cancelamento. Até aqui a marca que impede a segunda emissão (`nfseId`)
  // só era gravada DEPOIS da chamada — e entre as duas não havia nada.
  //
  // Dois caminhos reais para a nota duplicada:
  //   - a nfe.io demora mais que o limite da função; a nota É criada lá, o
  //     `update` abaixo nunca roda, o botão mostra erro e a pessoa clica de
  //     novo;
  //   - o dono e o administrador abrem a mesma OS: os dois passam pela
  //     checagem de `order.nfseId` (ainda nulo) e os dois emitem.
  //
  // `updateMany` condicionado a `nfseId: null` é a reserva: o Postgres decide
  // quem chega primeiro, e o segundo recebe `count: 0`. O valor reservado não é
  // um id de verdade — é um marcador que diz "alguém está emitindo agora" —, e
  // ele é substituído pelo id real logo abaixo.
  // (Achado na auditoria de 13/09/2026.)
  const RESERVA = `reservando:${orderId}`
  const reserva = await prisma.serviceOrder.updateMany({
    where: { id: orderId, tenantId, nfseId: null },
    data: { nfseId: RESERVA },
  })
  if (reserva.count === 0) throw new Error(te("nfseAlreadyIssued"))

  let invoice
  try {
    invoice = await nfeio.emitNfse(tenant.nfeioCompanyId, {
    borrower: {
      federalTaxNumber: clientDoc,
      name: pagador.name,
      email: pagador.email ?? undefined,
      address: addr
        ? {
            country: "BRA",
            postalCode: addr.zipCode?.replace(/\D/g, "") ?? undefined,
            street: addr.street ?? undefined,
            number: addr.number ?? undefined,
            district: addr.district ?? undefined,
            city: {
              code: tenant.fiscalMunicipalCode ?? "3550308",
              name: addr.city ?? tenant.fiscalCityName ?? "",
            },
            state: addr.state ?? tenant.fiscalStateCode ?? "",
          }
        : undefined,
    },
    services: {
      description,
      amount,
        issRate: tenant.fiscalIssRate ?? 5,
      },
    })
  } catch (e) {
    // Dois destinos, e a diferença é uma nota fiscal duplicada.
    //
    // O emissor RESPONDEU e disse não (RecusaExterna, 4xx): nada foi criado do
    // outro lado, a reserva volta e a pessoa tenta de novo.
    //
    // Qualquer outra coisa — timeout (lib/nfeio.ts tem AbortSignal.timeout
    // desde 15/09/2026), `fetch failed` com o socket caído DEPOIS do POST,
    // JSON malformado num 200, 502/504 de gateway — é "não sei se saiu". A
    // reserva FICA, a OS trava, e o suporte destrava. Travada é o lado certo:
    // o suporte destrava uma OS, mas ninguém desfaz uma nota fiscal. Até
    // 15/09/2026 este catch soltava a reserva em qualquer erro, e o próprio
    // comentário dizia que isso só era seguro porque não havia timeout.
    // (Achado na auditoria de 13/09/2026.)
    if (ehRecusaCerta(e)) {
      await prisma.serviceOrder.updateMany({
        where: { id: orderId, tenantId, nfseId: RESERVA },
        data: { nfseId: null },
      })
      throw e
    }
    console.error(`[nfse] emissão sem resposta conclusiva na OS ${orderId} — reserva mantida:`, e)
    throw new Error(te("nfseSemResposta"))
  }

  await prisma.serviceOrder.update({
    where: { id: orderId },
    data: {
      nfseId: invoice.id,
      // Carimba o momento da emissão: é por aqui que a cota do mês é contada.
      nfseIssuedAt: new Date(),
      nfseStatus: invoice.flowStatus,
      nfseNumber: invoice.number ?? null,
      // O endereço do XML, guardado desde já: sem ele um arquivamento que
      // falha perde o documento que vale juridicamente. Ver lib/arquivo-da-nota.ts.
      nfseXmlUrl: invoice.xml?.url ?? null,
      nfseUrl: invoice.pdf?.url ?? null,
      status: "INVOICED",
    },
  })

  // ─── A conta a RECEBER ─────────────────────────────────────────────────────
  //
  // Emitir a nota deixava a OS FATURADA e nao criava receita nenhuma. E os
  // outros dois caminhos de faturamento nao consertam depois: `updateOrderStatus`
  // recusa OS que ja esta INVOICED, entao a receita nunca mais nascia.
  //
  // O resultado era o pior possivel: nota fiscal emitida de verdade, documento
  // na mao do cliente, e o servico invisivel no contas a receber — logo, mudo
  // para a regua de cobranca. O servico mais real que existe era justamente o
  // unico que ninguem cobrava.
  //
  // Idempotente pelo mesmo molde dos outros dois: consulta antes de criar. Duas
  // emissoes na mesma OS nao podem virar duas cobrancas.
  if (Number(order.totalAmount) > 0) {
    const jaTem = await prisma.revenue.findFirst({ where: { orderId, tenantId } })
    if (!jaTem) {
      await prisma.revenue.create({
        data: {
          tenantId,
          orderId,
          branchId: order.branchId,
          description: `${formatOsNumber(order.number, order.createdAt)} — ${order.title}`,
          amount: order.totalAmount,
          dueDate: new Date(),
          // Competencia na CONCLUSAO: o servico foi entregue naquele mes, e o
          // resultado e dele — mesmo que a nota so saia depois.
          accrualDate: order.concludedAt ?? order.createdAt,
        },
      })
    }
  }

  // A OS acabou de virar FATURADA por um caminho que nao passa por
  // updateOrderStatus nem por completeServiceOrder. Sem esta linha, faturar
  // pelo botao de nota fiscal nunca geraria comissao — justo no unico fluxo em
  // que existe imposto para descontar.
  //
  // O desconto do ISS ainda nao acontece agora: `nfseStatus` aqui e o estado
  // do ENVIO, e a prefeitura ainda nao respondeu. Quem aplica o desconto e a
  // conciliacao diaria, quando a nota realmente e aceita.
  await reconciliarComissao(prisma, tenantId, orderId)

  revalidatePath("/service-orders")
  revalidatePath("/finance")
  return invoice
}

export async function getFiscalStatus() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      nfeioCompanyId: true,
      fiscalCnpj: true,
      fiscalCityName: true,
      fiscalStateCode: true,
    },
  })
}
