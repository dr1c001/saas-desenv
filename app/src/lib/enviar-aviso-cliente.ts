import { prisma } from "@/lib/prisma"
import { getTranslator } from "@/lib/i18n"
import { formatOsNumber } from "@/lib/utils"
import { sendWhatsApp } from "@/lib/whatsapp"
import { sendClientNoticeEmail } from "@/lib/resend"
import {
  canaisDoAviso,
  lerConfig,
  momentoDoStatus,
  textoDoAviso,
} from "@/lib/aviso-cliente"

/**
 * Avisa o cliente final que o serviço começou ou terminou.
 *
 * Chamado depois de a mudança de status já estar gravada. NUNCA lança: se o
 * WhatsApp cair ou o e-mail falhar, a OS continua concluída. O contrário —
 * técnico no local sem conseguir fechar a OS porque a mensagem não saiu —
 * seria muito pior que a mensagem não chegar.
 *
 * A decisão de mandar ou não mora em lib/aviso-cliente.ts, que é puro e
 * testado; aqui fica só o efeito colateral.
 */
export async function avisarClienteDaOs(
  orderId: string,
  statusAnterior: string,
  statusNovo: string
): Promise<void> {
  try {
    const momento = momentoDoStatus(statusAnterior, statusNovo)
    if (!momento) return

    const os = await prisma.serviceOrder.findUnique({
      where: { id: orderId },
      select: {
        number: true,
        title: true,
        createdAt: true,
        clientToken: true,
        client: { select: { whatsapp: true, phone: true, email: true } },
        tenant: {
          select: {
            name: true,
            locale: true,
            clientNotifications: true,
            zapiInstance: true,
            zapiToken: true,
          },
        },
      },
    })
    if (!os) return

    const config = lerConfig(os.tenant.clientNotifications)
    const numero = os.client.whatsapp || os.client.phone
    const canais = canaisDoAviso(config, momento, {
      whatsappConfigurado: Boolean(os.tenant.zapiInstance && os.tenant.zapiToken),
      temWhatsapp: Boolean(numero),
      temEmail: Boolean(os.client.email),
    })
    if (!canais.whatsapp && !canais.email) return

    const locale = os.tenant.locale === "en" ? "en" : "pt"
    const t = getTranslator(locale, "whatsapp")
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"
    const portalUrl = os.clientToken ? `${base}/p/${os.clientToken}` : null

    const texto = textoDoAviso(
      momento,
      {
        empresa: os.tenant.name,
        osNumero: formatOsNumber(os.number, os.createdAt),
        titulo: os.title,
        portalUrl,
      },
      // O getTranslator devolve a função de tradução do namespace; o módulo
      // puro só precisa da assinatura (chave, valores) => texto.
      (chave, vals) => t(chave as "avisoCliente.aCaminho", vals)
    )

    // Os dois canais em paralelo e independentes: falha de um não impede o
    // outro. allSettled porque o objetivo aqui é nunca lançar.
    await Promise.allSettled([
      canais.whatsapp && numero
        ? sendWhatsApp(os.tenant.zapiInstance!, os.tenant.zapiToken!, numero, texto)
        : Promise.resolve(),
      canais.email && os.client.email
        ? sendClientNoticeEmail(os.client.email, os.tenant.name, texto, locale)
        : Promise.resolve(),
    ])
  } catch (e) {
    // Aviso ao cliente é acessório: nunca pode derrubar a operação principal.
    console.error("Falha ao avisar cliente da OS:", e)
  }
}
