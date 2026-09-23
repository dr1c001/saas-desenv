import { prisma } from "@/lib/prisma"
import { proximaData, type Frequencia } from "@/lib/contrato-recorrente"
import { notificar } from "@/lib/notificar"

// Gerar as OS dos contratos recorrentes. Só o cron diário chama.
//
// ─── Por que isto NÃO mora mais em actions/contracts.ts ──────────────────────
//
// Esta função percorre os contratos de TODAS as empresas — não tem sessão, não
// tem tenant, e é assim de propósito. O arquivo anterior tinha `"use server"` na
// primeira linha, e o comentário dela dizia, com todas as letras, "fora das
// Server Actions de propósito: não tem sessão nem tenant". Só que estar num
// arquivo "use server" É estar nas Server Actions: toda export vira um endereço
// HTTP despachável, e os parâmetros (`hoje`, `limite`) vêm do corpo da
// requisição.
//
// Qualquer pessoa autenticada podia, portanto, chamar isto direto com um
// `limite` no futuro distante e gerar de uma vez as OS futuras de todo contrato
// ativo de toda empresa da plataforma — notificando os técnicos delas,
// avançando o `nextRunAt` de cada uma e desativando contratos vencidos.
//
// A correção não é acrescentar uma checagem de papel: não existe papel que
// devesse poder fazer isto pela tela. É TIRAR a função da superfície HTTP. Num
// módulo comum, ela continua sendo importável pelo cron e deixa de ter um
// Action ID. (Achado na auditoria de 13/09/2026.)

export async function gerarOsDosContratos(hoje: Date, limite: Date) {
  const vencidos = await prisma.serviceContract.findMany({
    where: { active: true, nextRunAt: { lte: limite } },
    include: { client: { select: { id: true } } },
  })

  let geradas = 0
  for (const c of vencidos) {
    // Contrato encerrado: desliga em vez de continuar consultando todo dia.
    if (c.endsAt && c.endsAt < hoje) {
      await prisma.serviceContract.update({ where: { id: c.id }, data: { active: false } })
      continue
    }
    if (c.startsAt > limite) continue

    const proxima = c.nextRunAt

    // Idempotência: se já existe OS deste contrato agendada pra esta data, o
    // cron já rodou hoje (ou rodou duas vezes) e não pode duplicar.
    const jaExiste = await prisma.serviceOrder.findFirst({
      where: { contractId: c.id, scheduledAt: proxima },
      select: { id: true },
    })

    if (!jaExiste) {
      const ultimo = await prisma.serviceOrder.aggregate({
        where: { tenantId: c.tenantId },
        _max: { number: true },
      })
      await prisma.serviceOrder.create({
        data: {
          number: (ultimo._max.number ?? 0) + 1,
          title: c.title,
          description: c.description,
          tenantId: c.tenantId,
          clientId: c.clientId,
          technicianId: c.technicianId,
          contractId: c.id,
          scheduledAt: proxima,
          totalAmount: c.amount,
        },
      })
      geradas++

      // Avisa quem vai executar. Sem isto, a OS do contrato nasce de
      // madrugada e o técnico só descobre abrindo o sistema — que é
      // justamente o contrário do que gerar com antecedência serve.
      await notificar({
        tenantId: c.tenantId,
        evento: "osDeContrato",
        corpo: c.title,
        url: "/service-orders",
        responsavelId: c.technicianId,
      })
    }

    await prisma.serviceContract.update({
      where: { id: c.id },
      data: {
        lastRunAt: proxima,
        nextRunAt: proximaData(proxima, c.frequency as Frequencia, c.dayOfMonth),
      },
    })
  }

  return geradas
}
