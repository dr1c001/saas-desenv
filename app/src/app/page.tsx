import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { PublicLanguageToggle } from "@/components/layout/public-language-toggle"
import { linkWhatsappSuporte } from "@/lib/utils"
import {
  ClipboardList, MapPin, DollarSign, BarChart2, CheckCircle2,
  FileText, Users, Zap, Shield, ArrowRight, CreditCard,
  X, MessageCircle, ChevronDown, Wrench, Receipt,
} from "lucide-react"
import { BotaoTema } from "@/components/landing/botao-tema"
import { TelasDoSistema } from "@/components/landing/telas-do-sistema"
import { Adicionais } from "@/components/shared/adicionais"

// Ícones alinhados 1:1 (mesma ordem) com landing.features.items em messages/*.json
const featureIcons = [
  ClipboardList, MapPin, DollarSign, FileText, CheckCircle2,
  BarChart2, Users, Shield, Receipt, Wrench,
]

const plans = [
  { key: "starter", name: "Starter", price: 97, yearlyPrice: 970, color: "border-border" },
  { key: "pro", name: "Pro", price: 197, yearlyPrice: 1970, color: "border-primary ring-2 ring-primary", popular: true },
  { key: "enterprise", name: "Enterprise", price: 397, yearlyPrice: 3970, color: "border-border" },
]

// Emojis alinhados 1:1 com landing.painPoints.items
const painPointEmojis = ["📱", "📋", "🗂️", "🧾"]

// Valores mockados do preview do dashboard — números/moeda não são traduzíveis,
// alinhados 1:1 com landing.dashboardPreview.stats
const dashboardStats = [
  { value: "24", color: "text-blue-500" },
  { value: "R$ 18.400", color: "text-green-500" },
  { value: "6", color: "text-purple-500" },
  { value: "142", color: "text-orange-500" },
]

// Alinhados 1:1 com landing.dashboardPreview.items. "SCHEDULED" não é um dos 5
// status reais de OS (common.serviceOrderStatus) — é só ilustrativo pro mockup.
const dashboardItems: { statusKey: "IN_PROGRESS" | "DONE" | "SCHEDULED"; color: string }[] = [
  { statusKey: "IN_PROGRESS", color: "text-blue-500" },
  { statusKey: "DONE", color: "text-green-500" },
  { statusKey: "SCHEDULED", color: "text-yellow-500" },
]

export default async function LandingPage() {
  const t = await getTranslations("landing")
  const tc = await getTranslations("common")
  // Lista de recursos por plano vem do namespace compartilhado — a mesma que
  // a tela de assinatura usa. Antes cada tela tinha a própria cópia e elas
  // divergiram: aqui o Enterprise dizia "Tudo do Pro", lá não dizia, e quem
  // abria a tela de pagamento via o plano de R$ 397 parecendo ter MENOS que o
  // de R$ 197. (Notado pelo usuário em 10/08/2026.)
  const tf = await getTranslations("planFeatures")

  const dashboardStatLabels = t.raw("dashboardPreview.stats") as string[]
  const dashboardItemLabels = t.raw("dashboardPreview.items") as string[]
  const painPointItems = t.raw("painPoints.items") as { before: string; after: string }[]
  const howItWorksSteps = t.raw("howItWorks.steps") as { title: string; desc: string }[]
  const featureItems = t.raw("features.items") as { title: string; desc: string }[]
  const segmentItems = t.raw("segments.items") as string[]
  const faqItems = t.raw("faq.items") as { q: string; a: string }[]

  // Número só sai do ambiente: antes estava fixo como 5511999999999 (exemplo),
  // então o botão flutuante levava o visitante a um número inexistente. Sem a
  // variável configurada — ou com número que não faz sentido — é melhor não
  // mostrar o botão do que mostrar quebrado.
  const suporteWhatsapp = linkWhatsappSuporte(process.env.SUPPORT_WHATSAPP, t("whatsapp.message"))

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-primary">ServiçoOS</span>
          <div className="flex items-center gap-4">
            <Link href="#como-funciona" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">{t("nav.howItWorks")}</Link>
            <Link href="#planos" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">{t("nav.plans")}</Link>
            <Link href="#faq" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">{t("nav.faq")}</Link>
            <PublicLanguageToggle />
            {/* Ao lado do idioma: as duas sao preferencia de quem VISITA, e nao
                conteudo da pagina. O tema ja funcionava aqui pelo script do
                layout raiz — faltava o controle. */}
            <BotaoTema />
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">{t("nav.login")}</Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t("nav.createAccount")}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6">
          <Zap className="size-3.5" />
          {t("hero.badge")}
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
          {t("hero.titleLine1")}<br />
          <span className="text-primary">{t("hero.titleLine2")}</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          {t("hero.subtitle")}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t("hero.ctaPrimary")}
            <ArrowRight className="size-5" />
          </Link>
          {/* A DEMO no segundo lugar do herói, e não o login.
              Quem chega pela primeira vez não quer entrar — quer ver. E o
              sistema não tem teste grátis: sem este botão, a única forma de
              conhecer o produto é assinar antes, que é o pedido mais difícil
              que existe para uma marca desconhecida. */}
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-xl border px-8 py-4 text-lg font-semibold hover:bg-muted"
          >
            {t("hero.ctaDemo")}
          </Link>
        </div>
        <p className="mt-4 text-sm">
          <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
            {t("hero.ctaSecondary")}
          </Link>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          {t.rich("hero.socialProof", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </section>

      {/* Dashboard preview mockup */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden">
          <div className="h-8 bg-muted flex items-center gap-2 px-4">
            <span className="size-3 rounded-full bg-red-500" />
            <span className="size-3 rounded-full bg-yellow-500" />
            <span className="size-3 rounded-full bg-green-500" />
            <span className="mx-auto text-xs text-muted-foreground">app.servicoos.com.br/dashboard</span>
          </div>
          <div className="grid grid-cols-4 gap-0 p-8">
            {dashboardStats.map((stat, i) => (
              <div key={i} className="text-center p-4">
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{dashboardStatLabels[i]}</p>
              </div>
            ))}
          </div>
          <div className="px-8 pb-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {dashboardItems.map((item, i) => (
              <div key={i} className="rounded-lg border bg-background p-3 text-sm">
                <p className="text-foreground font-medium">{dashboardItemLabels[i]}</p>
                <p className={`text-xs mt-1 ${item.color}`}>
                  {item.statusKey === "SCHEDULED" ? t("dashboardPreview.scheduledStatus") : tc(`serviceOrderStatus.${item.statusKey}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TelasDoSistema />

      {/* Pain points → Solution */}
      <section className="bg-muted/40 py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">{t("painPoints.title")}</h2>
          <p className="text-center text-muted-foreground mb-12">{t("painPoints.subtitle")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {painPointItems.map((p, i) => (
              <div key={i} className="rounded-xl border bg-card p-6 flex gap-4 items-start">
                <span className="text-2xl">{painPointEmojis[i]}</span>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <X className="size-4 text-red-500 shrink-0" />
                    <span className="text-muted-foreground line-through">{p.before}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                    <span className="font-medium">{p.after}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">{t("howItWorks.title")}</h2>
          <p className="text-center text-muted-foreground mb-16">{t("howItWorks.subtitle")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-8 left-1/3 right-1/3 h-px bg-border" />
            {howItWorksSteps.map((s, i) => (
              <div key={i} className="text-center space-y-4 relative">
                <div className="size-16 rounded-full bg-primary text-primary-foreground text-2xl font-bold flex items-center justify-center mx-auto">
                  {i + 1}
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t("howItWorks.cta")}
              <ArrowRight className="size-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">{t("features.title")}</h2>
          <p className="text-center text-muted-foreground mb-12">{t("features.subtitle")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {featureItems.map((f, i) => {
              const Icon = featureIcons[i]
              return (
                <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{f.title}</h3>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Segmentos atendidos — substituiu a seção de depoimentos, que trazia três
          citações inventadas ("Carlos S.", 5 estrelas) sob o título "Empresas
          reais, resultados reais", todas do mesmo nicho técnico. Além do
          problema de veracidade, isso respondia errado à pergunta que o
          visitante faz aqui — "isso serve pra mim?" — e afastava limpeza,
          jardinagem, TI, eventos e todo o resto do público-alvo real. */}
      <section className="py-20 mx-auto max-w-5xl px-4">
        <h2 className="text-3xl font-bold text-center mb-2">{t("segments.title")}</h2>
        <p className="text-center text-muted-foreground mb-12">{t("segments.subtitle")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {segmentItems.map((segmento, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm"
            >
              <CheckCircle2 className="size-4 text-green-500 shrink-0" />
              {segmento}
            </span>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-10 max-w-2xl mx-auto">
          {t("segments.footnote")}
        </p>
      </section>

      {/* Pricing */}
      <section id="planos" className="bg-muted/40 py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">{t("pricing.title")}</h2>
          <p className="text-center text-muted-foreground mb-12">
            {t("pricing.subtitle")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const planFeatures = tf.raw(plan.key) as string[]
              return (
                <div key={plan.key} className={`relative rounded-xl border bg-card p-8 flex flex-col gap-6 ${plan.color}`}>
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-semibold">
                      {t("pricing.mostPopular")}
                    </span>
                  )}
                  <div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <div className="mt-3">
                      <span className="text-4xl font-bold">R$ {plan.price}</span>
                      <span className="text-muted-foreground text-sm">{t("pricing.perMonth")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("pricing.yearlyNote", { price: plan.yearlyPrice })}
                    </p>
                  </div>
                  <ul className="space-y-2 flex-1">
                    {planFeatures.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className={`text-center rounded-lg py-3 font-semibold text-sm transition-colors ${plan.popular ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-muted"}`}
                  >
                    {t("pricing.subscribe")}
                  </Link>
                </div>
              )
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-8">
            {t("pricing.disclaimer")}
          </p>
        </div>
      </section>

      {/* FAQ */}
      {/* Adicionais na vitrine, SEM preco.
          Decisao do dono: na landing o objetivo e a pessoa saber que existe e
          conversar. Preco de adicional ao lado do preco do plano rouba a
          atencao da decisao principal, que e escolher o plano. */}
      <section className="mx-auto max-w-4xl px-4 pb-20">
        <Adicionais mostrarPreco={false} linkContato={suporteWhatsapp} />
      </section>

      <section id="faq" className="py-20 mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-center mb-12">{t("faq.title")}</h2>
        <div className="space-y-4">
          {faqItems.map((faq, i) => (
            <details key={i} className="group rounded-xl border bg-card p-6 cursor-pointer">
              <summary className="flex items-center justify-between font-semibold text-sm list-none">
                {faq.q}
                <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180 transition-transform" />
              </summary>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-primary/5 border-t py-24 text-center mx-auto px-4">
        <h2 className="text-3xl font-bold mb-4">{t("finalCta.title")}</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          {t("finalCta.line1")}<br />
          {t("finalCta.line2")}
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-10 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("finalCta.button")}
          <ArrowRight className="size-5" />
        </Link>
        <div className="mt-6 flex justify-center gap-8 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><CreditCard className="size-4" /> {t("finalCta.badges.payment")}</span>
          <span className="flex items-center gap-1"><Shield className="size-4" /> {t("finalCta.badges.secure")}</span>
          <span className="flex items-center gap-1"><Zap className="size-4" /> {t("finalCta.badges.cancelAnytime")}</span>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-4">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">ServiçoOS</p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/login" className="hover:text-foreground">{t("nav.login")}</Link>
            <Link href="/register" className="hover:text-foreground">{t("nav.createAccount")}</Link>
            <Link href="#planos" className="hover:text-foreground">{t("nav.plans")}</Link>
            <Link href="#faq" className="hover:text-foreground">{t("nav.faq")}</Link>
            <Link href="/terms" className="hover:text-foreground">{t("footer.termsOfUse")}</Link>
            <Link href="/privacy" className="hover:text-foreground">{t("footer.privacy")}</Link>
            <Link href="/status" className="hover:text-foreground">{t("footer.status")}</Link>
          </div>
          <p>{t("footer.copyright")}</p>
        </div>
      </footer>

      {/* WhatsApp floating button */}
      {suporteWhatsapp && (
        <a
          href={suporteWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 size-14 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors"
          aria-label={t("whatsapp.ariaLabel")}
        >
          <MessageCircle className="size-6" />
        </a>
      )}
    </div>
  )
}
