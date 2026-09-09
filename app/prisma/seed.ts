import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import "dotenv/config"

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ─── Estes textos são VITRINE de um sistema que já tem TRAVAS ────────────────
//
// `features` é o que a tela de planos mostra. Quem decide de verdade é
// `POR_PLANO`, em src/lib/plan.ts. Quando os dois discordam, o cliente compra
// uma coisa e recebe outra — foi exatamente o que aconteceu com o Starter, que
// anunciava "8 notas fiscais por mês" enquanto `recursos: []` o impedia de
// emitir uma única (corrigido em 30/08/2026).
//
// Três promessas aqui já tinham virado mentira e foram corrigidas em
// 09/09/2026, todas conferidas contra `POR_PLANO`:
//
//   - Pro dizia "OS ilimitadas". São 200 por mês.
//   - Enterprise dizia "Usuários ilimitados". São 30 desde 04/09/2026.
//   - Enterprise listava "Emissão de NFS-e" como se fosse exclusividade dele.
//     Os três planos emitem; o que muda é a cota (8 / 70 / 200).
//
// Ao mexer em `POR_PLANO`, volte aqui.
async function main() {
  const plans = [
    {
      name: "Starter",
      slug: "starter",
      priceMonthly: 97,
      priceYearly: 970,
      maxUsers: 3,
      features: [
        "Até 3 usuários",
        "50 OS por mês",
        "8 notas fiscais por mês",
        "Relatórios básicos",
        "Suporte por e-mail",
      ],
    },
    {
      name: "Pro",
      slug: "pro",
      priceMonthly: 197,
      priceYearly: 1970,
      maxUsers: 10,
      features: [
        "Até 10 usuários",
        "200 OS por mês",
        "70 notas fiscais por mês",
        "Estoque, compras e fornecedores",
        "Mapa GPS e régua de cobrança",
        "Relatórios avançados",
        "Suporte prioritário",
      ],
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      priceMonthly: 397,
      priceYearly: 3970,
      maxUsers: 30,
      features: [
        "Até 30 usuários",
        "OS ilimitadas",
        "200 notas fiscais por mês",
        "Tudo do Pro",
        "API de integração",
        "Suporte 24h",
      ],
    },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: plan,
      update: { priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly },
    })
    console.log(`✓ Plan: ${plan.name}`)
  }
}

main()
  .catch(console.error)
  .finally(() => pool.end())
