import { WifiOff } from "lucide-react"
import { getTranslations } from "next-intl/server"

// A página que o PAINEL mostra sem rede.
//
// ─── Por que não reaproveitar a /offline ─────────────────────────────────────
//
// Aquela é do técnico em campo e promete o que o painel não faz: "concluir e
// mudar status funcionam sem sinal". O dono lendo isso no painel ficaria
// procurando uma fila de sincronização que não existe aqui.
//
// A frase honesta é outra: o painel mostra o estado de AGORA do negócio — MRR,
// inadimplentes, assinaturas —, e por isso precisa de internet. Não guardamos
// cópia de propósito: um número de ontem ali é pior que painel nenhum.
//
// FICA FORA de app/admin/, e não é detalhe: sob aquele layout, o `fetch` da
// instalação do service worker — que roda no aparelho de TODO técnico —
// seguiria o redirect e guardaria o HTML do LOGIN sob esta chave.

export default async function OfflineDoPainelPage() {
  const t = await getTranslations("offline.painel")

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center text-slate-100">
      <WifiOff className="size-12 text-slate-400" />
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-slate-400">{t("description")}</p>
      </div>
    </div>
  )
}
