import Link from "next/link"
import {
  ClipboardList, MapPin, DollarSign, BarChart2, CheckCircle2,
  FileText, Users, Zap, Shield, Clock, Star, ArrowRight,
  X, MessageCircle, ChevronDown, Wrench, Receipt,
} from "lucide-react"

const features = [
  { icon: ClipboardList, title: "Ordens de Serviço", desc: "Gerencie OS do início ao fim, com histórico completo, PDF profissional e assinatura digital do cliente." },
  { icon: MapPin, title: "Mapa GPS em Tempo Real", desc: "Acompanhe onde estão seus técnicos e suas OS ativas no mapa. Atualizações automáticas a cada 30 segundos." },
  { icon: DollarSign, title: "Financeiro Completo", desc: "Receitas, despesas, contas a receber e relatórios de lucratividade. Tudo integrado com suas OS." },
  { icon: FileText, title: "Orçamentos Digitais", desc: "Crie orçamentos profissionais em segundos, gere PDF e envie o link para aprovação online." },
  { icon: CheckCircle2, title: "Checklist de Execução", desc: "Defina etapas para cada tipo de serviço. O técnico marca o progresso diretamente pelo celular." },
  { icon: BarChart2, title: "Relatórios Inteligentes", desc: "Painéis com receita, OS por período, desempenho de técnicos e muito mais." },
  { icon: Users, title: "Gestão de Equipe", desc: "Controle permissões por cargo, veja a localização de cada técnico e gerencie a agenda." },
  { icon: Shield, title: "Emissão de NFS-e", desc: "Emita notas fiscais de serviço eletrônicas diretamente na OS, integrado ao nfe.io." },
  { icon: Receipt, title: "Recibos Automáticos", desc: "Gere recibos profissionais em PDF após cada pagamento, com assinatura e dados completos." },
  { icon: Wrench, title: "Manutenção Interna", desc: "Controle a manutenção da frota e equipamentos internos separado das OS de clientes." },
]

const plans = [
  {
    name: "Starter", price: 97, yearlyPrice: 970, color: "border-border",
    features: ["Até 3 usuários", "50 OS por mês", "Orçamentos e PDF", "Recibos automáticos", "Relatórios básicos", "Suporte por e-mail"],
  },
  {
    name: "Pro", price: 197, yearlyPrice: 1970, color: "border-primary ring-2 ring-primary", popular: true,
    features: ["Até 10 usuários", "OS ilimitadas", "Mapa GPS em tempo real", "Checklist + Assinatura digital", "Emissão de NFS-e", "Relatórios avançados", "Suporte prioritário"],
  },
  {
    name: "Enterprise", price: 397, yearlyPrice: 3970, color: "border-border",
    features: ["Usuários ilimitados", "OS ilimitadas", "Tudo do Pro", "API de integração", "Onboarding dedicado", "Suporte 24h via WhatsApp"],
  },
]

const testimonials = [
  { name: "Carlos S.", role: "Empresa de refrigeração, SP", text: "Reduzi 3 horas por dia de trabalho administrativo. O sistema é muito fácil de usar e minha equipe adorou." },
  { name: "Ana P.", role: "Assistência técnica, RJ", text: "Meus clientes adoram receber o PDF da OS com a assinatura digital. Parece muito mais profissional." },
  { name: "Marcos R.", role: "Elétrica e instalações, MG", text: "O mapa GPS mudou minha vida. Sei onde cada técnico está em tempo real, sem precisar ligar para eles." },
]

const faqs = [
  {
    q: "Preciso de cartão de crédito para testar?",
    a: "Não. Os 15 dias de teste são completamente gratuitos e sem necessidade de cadastrar cartão. Só cobramos se você decidir continuar.",
  },
  {
    q: "Posso cancelar a qualquer momento?",
    a: "Sim, sem multa e sem burocracia. Você cancela pelo próprio painel em segundos.",
  },
  {
    q: "O sistema funciona no celular?",
    a: "Sim! O ServiçoOS é um PWA (Progressive Web App) — funciona no celular como um app nativo, sem precisar instalar nada na loja.",
  },
  {
    q: "Quantos usuários posso ter?",
    a: "No Starter até 3, no Pro até 10, e no Enterprise ilimitados. Cada usuário pode ter permissões diferentes (proprietário, admin ou técnico).",
  },
  {
    q: "A emissão de NFS-e funciona para qual município?",
    a: "A integração é via nfe.io, que suporta mais de 5.000 municípios brasileiros. A configuração é feita nas configurações fiscais do sistema.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Sim. Os dados são armazenados na Supabase (infraestrutura AWS) com criptografia, backups automáticos e conformidade com a LGPD.",
  },
]

const painPoints = [
  { emoji: "📱", before: "Controlava tudo pelo WhatsApp", after: "OS organizadas com histórico completo" },
  { emoji: "📋", before: "Planilha do Excel sem controle", after: "Financeiro em tempo real integrado" },
  { emoji: "🗂️", before: "Papel na pasta, sem busca", after: "Busca instantânea por cliente ou OS" },
  { emoji: "🧾", before: "Nota fiscal manualmente", after: "NFS-e emitida em 1 clique na OS" },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-primary">ServiçoOS</span>
          <div className="flex items-center gap-4">
            <Link href="#como-funciona" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">Como funciona</Link>
            <Link href="#planos" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">Planos</Link>
            <Link href="#faq" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">FAQ</Link>
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
          Chega de controlar OS<br />
          <span className="text-primary">pelo WhatsApp e planilha</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Sistema completo para empresas de serviço — gerencie OS, orçamentos, financeiro, técnicos no mapa e emita NFS-e. Tudo em um só lugar, no celular ou computador.
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
          <div className="px-8 pb-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { os: "OS #0024 — Ar-condicionado", status: "Em andamento", color: "text-blue-500" },
              { os: "OS #0023 — Instalação elétrica", status: "Concluída", color: "text-green-500" },
              { os: "OS #0022 — Troca de telhas", status: "Agendada", color: "text-yellow-500" },
            ].map((item) => (
              <div key={item.os} className="rounded-lg border bg-background p-3 text-sm">
                <p className="text-foreground font-medium">{item.os}</p>
                <p className={`text-xs mt-1 ${item.color}`}>{item.status}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain points → Solution */}
      <section className="bg-muted/40 py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Se você ainda faz assim, é hora de mudar</h2>
          <p className="text-center text-muted-foreground mb-12">Pequenas empresas perdem tempo e dinheiro com processos manuais que o ServiçoOS resolve em segundos.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {painPoints.map((p) => (
              <div key={p.before} className="rounded-xl border bg-card p-6 flex gap-4 items-start">
                <span className="text-2xl">{p.emoji}</span>
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
          <h2 className="text-3xl font-bold text-center mb-4">Como funciona</h2>
          <p className="text-center text-muted-foreground mb-16">Configure em minutos e comece a usar hoje mesmo.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-8 left-1/3 right-1/3 h-px bg-border" />
            {[
              { step: "1", title: "Crie sua conta", desc: "Cadastre sua empresa em menos de 2 minutos. Nenhuma configuração técnica necessária." },
              { step: "2", title: "Configure e convide", desc: "Adicione seus técnicos, clientes e personalize o sistema com o nome da sua empresa." },
              { step: "3", title: "Abra sua primeira OS", desc: "Crie ordens de serviço, acompanhe no mapa e envie o PDF ao cliente automaticamente." },
            ].map((s) => (
              <div key={s.step} className="text-center space-y-4 relative">
                <div className="size-16 rounded-full bg-primary text-primary-foreground text-2xl font-bold flex items-center justify-center mx-auto">
                  {s.step}
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
              Criar conta grátis agora
              <ArrowRight className="size-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Tudo que sua empresa precisa</h2>
          <p className="text-center text-muted-foreground mb-12">Uma plataforma completa, do orçamento à nota fiscal.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-6 space-y-3">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-bold text-center mb-2">O que dizem nossos clientes</h2>
        <p className="text-center text-muted-foreground mb-12">Empresas reais, resultados reais.</p>
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
                  className={`text-center rounded-lg py-3 font-semibold text-sm transition-colors ${plan.popular ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-muted"}`}
                >
                  Começar grátis
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-8">
            Todos os preços em BRL. Cobranças via boleto ou cartão de crédito.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-center mb-12">Perguntas frequentes</h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <details key={faq.q} className="group rounded-xl border bg-card p-6 cursor-pointer">
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
        <h2 className="text-3xl font-bold mb-4">Pronto para organizar sua empresa?</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Junte-se a dezenas de empresas que já usam o ServiçoOS.<br />
          Sem cartão de crédito. Configure em minutos.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-10 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Criar conta grátis
          <ArrowRight className="size-5" />
        </Link>
        <div className="mt-6 flex justify-center gap-8 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><Clock className="size-4" /> 15 dias grátis</span>
          <span className="flex items-center gap-1"><Shield className="size-4" /> Dados seguros (LGPD)</span>
          <span className="flex items-center gap-1"><Zap className="size-4" /> Cancele quando quiser</span>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-4">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">ServiçoOS</p>
          <div className="flex gap-6">
            <Link href="/login" className="hover:text-foreground">Entrar</Link>
            <Link href="/register" className="hover:text-foreground">Criar conta</Link>
            <Link href="#planos" className="hover:text-foreground">Planos</Link>
            <Link href="#faq" className="hover:text-foreground">FAQ</Link>
          </div>
          <p>© 2026 ServiçoOS · Todos os direitos reservados</p>
        </div>
      </footer>

      {/* WhatsApp floating button */}
      <a
        href="https://wa.me/5511999999999?text=Olá!%20Tenho%20interesse%20no%20ServiçoOS."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 size-14 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors"
        aria-label="Falar pelo WhatsApp"
      >
        <MessageCircle className="size-6" />
      </a>
    </div>
  )
}
