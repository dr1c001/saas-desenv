"use client"

import { useState, useEffect } from "react"
import { Copy, Check, Gift, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getReferralInfo } from "@/actions/referral"

export default function ReferralPage() {
  const [copied, setCopied] = useState(false)
  const [info, setInfo] = useState<{ code: string; referralCount: number; converted: number; discountPercent: number } | null>(null)

  useEffect(() => {
    getReferralInfo().then(setInfo)
  }, [])

  const referralUrl = info
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"}/register?ref=${info.code}`
    : ""

  function copyLink() {
    navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Programa de Indicação</h1>
        <p className="text-muted-foreground mt-1">
          Indique o ServiçoOS para outros empresários e ganhe desconto no seu plano.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: "🔗", title: "Compartilhe seu link", desc: "Envie o link único de indicação para outros empresários" },
          { icon: "✅", title: "Eles se cadastram", desc: "Seu indicado ganha 10% de desconto no primeiro pagamento" },
          { icon: "🎁", title: "Você ganha também", desc: "Para cada indicação que assinar, você ganha 20% de desconto" },
        ].map((s) => (
          <Card key={s.title}>
            <CardContent className="pt-6 text-center space-y-2">
              <span className="text-3xl">{s.icon}</span>
              <p className="font-semibold text-sm">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Referral link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="size-4" />
            Seu link de indicação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              readOnly
              value={referralUrl}
              className="flex-1 rounded-lg border bg-muted px-3 py-2 text-sm font-mono"
            />
            <Button onClick={copyLink} variant="outline" className="shrink-0">
              {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>

          {info && (
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="size-4" />
                <strong>{info.referralCount}</strong> indicações ({info.converted} converteram)
              </span>
              <Badge variant="secondary">
                {info.discountPercent}% de desconto disponível
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        O desconto é creditado automaticamente quando seu indicado assina um plano pago, e aplicado
        na sua próxima assinatura. Sem limite de indicações — quanto mais você indica, mais desconto acumula (até 100%).
      </p>
    </div>
  )
}
