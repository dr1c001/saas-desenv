import Link from "next/link"
import {
  ClipboardList, MapPin, DollarSign, BarChart2, CheckCircle2,
  FileText, Users, Zap, Shield, Clock, Star, ArrowRight,
} from "lucide-react"

const features = [
  { icon: ClipboardList, title: "Ordens de Serviço", desc: "Gerencie OS do início ao fim, com histórico completo, PDF profissional e assinatura digital do cliente." },
  { icon: MapPin, title: "Mapa GPS em Tempo Real", desc: "Acompanhe onde estão seus técnicos e suas OS ativas no mapa. Atualizações automáticas a cada 30 segundos." },
  { icon: DollarSign, title: "Financeiro Completo", desc: "Receitas, despesas, contas a receber e relatórios de lucratividade. Tudo integrado com suas OS." },
  { icon: FileText, title: "Orçamentos Digitais", desc: "Crie orçamentos profissionais em segundos, gere PDF e controle aprovações de forma simples." },
  { icon: CheckCircle2, title: "Checklist de Execução", desc: "Defina etapas para cada tipo de serviço. O técnico marca o progresso diretamente pelo celular." },
  { icon: BarChart2, title: "Relatórios Inteligentes", desc: "Painéis com receita, OS por período, desempenho de técnicos e muito mais." },
  { icon: Users, title: "Gestão de Equipe", desc: "Controle permissões por cargo, veja a localização de cada técnico e gerencie a agenda." },
  { icon: Shield, title: "Emissão de NFS-e", desc: "Emita notas fiscais de serviço eletrônicas diretamente na OS, integrado ao nfe.io." },
]

const plans = [
  {
    name: "Starter", price: 97, yearlyPrice: 970, color: "border-border",
    features: ["Até 3 usuários", "50 OS por mês", "Orçamentos e PDF", "Relatórios básicos", "Suporte por e-mail"],
  },
  {
    name: "Pro", price: 197, yearlyPrice: 1970, color: "border-primary ring-2 ring-primary", popular: true,
    features: ["Até 10 usuários", "OS ilimitadas", "Mapa GPS em tempo real", "Checklist + Assinatura digital", "Relatórios avançados", "Suporte prioritário"],
  },
  {
    name: "Enterprise", price: 397, yearlyPrice: 3970, color: "border-border",
    features: ["Usuários ilimitados", "OS ilimitadas", "Emissão de NFS-e", "API de integração", "Suporte 24h"],
  },
]

const testimonials = [
  { name: "Carlos S.", role: "Empresa de refrigeração", text: "Reduzi 3 horas por dia de trabalho administrativo. O sistema é muito fácil de usar." },
  { name: "Ana P.", role: "Assistência técnica", text: "Meus clientes adoram receber o PDF da OS. Parece muito mais profissional." },
  { name: "Marcos R.", role: "Elétrica e instalações", text: "O mapa GPS mudou minha vida. Sei onde cada técnico está em tempo real." },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-primary">ServiçoOS</span>
          <div className="flex items-center gap-4">
            <Link href="#planos" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">Planos</Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Entrar</Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Testar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6">
          <Zap className="size-3.5" />
          15 dias grátis · Sem cartão de crédito
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
          Gestão de Ordens de Serviço<br />
          <span className="text-primary">que realmente funciona</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Sistema SaaS completo para empresas de serviço — OS, orçamentos, financeiro, mapa GPS, checklist, assinatura digital e emissão de NFS-e. Tudo em um só lugar.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Começar teste grátis
            <ArrowRight className="size-5" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border px-8 py-4 text-lg font-semibold hover:bg-muted"
          >
            Já tenho conta
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Mais de <strong>50 empresas</strong> já gerenciam seus serviços com o ServiçoOS
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
            {[
              { label: "OS Abertas", value: "24", color: "text-blue-500" },
              { label: "Faturamento/mês", value: "R$ 18.400", color: "text-green-500" },
              { label: "Técnicos ativos", value: "6", color: "text-purple-500" },
              { label: "Clientes", value: "142", color: "text-orange-500" },
            ].map((stat) => (
              <div key={stat.label} className="text-center p-4">
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
          <div className="px-8 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              "OS #0024 — Manutenção ar-condicionado · Em andamento",
              "OS #0023 — Instalação elétrica · Concluída",
              "OS #0022 — Troca de telhas · Agendada",
            ].map((os) => (
              <div key={os} className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">{os}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Tudo que sua empresa precisa</h2>
          <p className="text-center text-muted-foreground mb-12">Uma plataforma completa, do orçamento à nota fiscal.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-6 space-y-3">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-bold text-center mb-12">O que dizem nossos clientes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">&ldquo;{t.text}&rdquo;</p>
              <div>
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="bg-muted/40 py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Planos simples e transparentes</h2>
          <p className="text-center text-muted-foreground mb-12">
            Todos os planos incluem 15 dias grátis. Cancele quando quiser.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div key={plan.name} className={`relative rounded-xl border bg-card p-8 flex flex-col gap-6 ${plan.color}`}>
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-semibold">
                    Mais popular
                  </span>
                )}
                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <div className="mt-3">
                    <span className="text-4xl font-bold">R$ {plan.price}</span>
                    <span className="text-muted-foreground text-sm">/mês</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ou R$ {plan.yearlyPrice}/ano (economize 2 meses)
                  </p>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`text-center rounded-lg py-3 font-semibold text-sm ${plan.popular ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-muted"}`}
                >
                  Começar grátis
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-24 text-center mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold mb-4">Pronto para organizar sua empresa?</h2>
        <p className="text-muted-foreground mb-8">
          Junte-se a dezenas de empresas que já usam o ServiçoOS.<br />
          Sem cartão de crédito. Sem complicação.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-10 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Criar conta grátis
          <ArrowRight className="size-5" />
        </Link>
        <div className="mt-6 flex justify-center gap-8 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="size-4" /> 15 dias grátis</span>
          <span className="flex items-center gap-1"><Shield className="size-4" /> Dados seguros</span>
          <span className="flex items-center gap-1"><Zap className="size-4" /> Cancele quando quiser</span>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© 2025 ServiçoOS · Todos os direitos reservados</p>
        <div className="mt-2 flex justify-center gap-6">
          <Link href="/login" className="hover:text-foreground">Entrar</Link>
          <Link href="/register" className="hover:text-foreground">Criar conta</Link>
          <Link href="#planos" className="hover:text-foreground">Planos</Link>
        </div>
      </footer>
    </div>
  )
}
