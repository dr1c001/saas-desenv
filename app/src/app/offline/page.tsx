import { WifiOff } from "lucide-react"
import { getTranslations } from "next-intl/server"

// Destino de último recurso do service worker: o técnico abriu uma tela que
// ele nunca visitou com sinal. Fica FORA do grupo (dashboard) de propósito —
// aquele layout consulta banco (assinatura, permissões), e chamar banco é
// justamente o que não funciona aqui. Também está na lista de rotas públicas
// do proxy, senão o service worker guardaria um redirect pro /login no lugar
// desta página.
export default async function OfflinePage() {
  const t = await getTranslations("offline")

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-muted/40">
      <WifiOff className="size-12 text-muted-foreground" />
      <div className="space-y-2 max-w-sm">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ul className="text-sm text-muted-foreground space-y-1 text-left">
        <li>• {t("hints.visited")}</li>
        <li>• {t("hints.writes")}</li>
        <li>• {t("hints.retry")}</li>
      </ul>
    </div>
  )
}
