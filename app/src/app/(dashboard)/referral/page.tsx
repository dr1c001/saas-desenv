"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Copy, Check, Gift, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getReferralInfo } from "@/actions/referral"

// Ícones ficam no código (não são texto traduzível) e casam por índice com
// billingReferral.referral.steps em messages/*.json.
const STEP_ICONS = ["🔗", "✅", "🎁"]

export default function ReferralPage() {
  const t = useTranslations("billingReferral.referral")
  const [copied, setCopied] = useState(false)
  const [info, setInfo] = useState<{ code: string; referralCount: number; converted: number; discountPercent: number } | null>(null)

  useEffect(() => {
    getReferralInfo().then(setInfo)
  }, [])

  const referralUrl = info
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"}/register?ref=${info.code}`
    : ""

  const steps = t.raw("steps") as { title: string; desc: string }[]

  function copyLink() {
    navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("subtitle")}
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <Card key={s.title}>
            <CardContent className="pt-6 text-center space-y-2">
              <span className="text-3xl">{STEP_ICONS[i]}</span>
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
            {t("linkTitle")}
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
              {copied ? t("copiedButton") : t("copyButton")}
            </Button>
          </div>

          {info && (
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="size-4" />
                {t.rich("referralsCount", {
                  count: info.referralCount,
                  converted: info.converted,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </span>
              <Badge variant="secondary">
                {t("discountAvailable", { percent: info.discountPercent })}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("footnote")}
      </p>
    </div>
  )
}
