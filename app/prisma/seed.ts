import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import "dotenv/config"

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ─── A VITRINE NÃO MORA AQUI ────────────────────────────────────────────────
//
// `Plan.features` era uma SEGUNDA lista de vantagens, gravada no banco e lida
// por tela nenhuma: quem mostra as vantagens do plano é `planFeatures` em
// messages/pt.json e en.json, porque a tela é bilíngue e a coluna é de um
// idioma só. O `upsert` abaixo, além disso, só atualiza preço — então o que
// estava no banco de produção era o texto do dia em que cada plano foi criado.
//
// As duas listas já tinham divergido em três pontos: o seed dizia "Suporte
// 24h" onde a vitrine diz "Atendimento por WhatsApp em horário comercial"; o
// Starter do seed não listava "Orçamentos e PDF" nem "Recibos automáticos"; e
// o Pro do seed listava "Estoque, compras e fornecedores", que a vitrine não
// lista. Nada disso aparecia, porque ninguém lia — e era essa a armadilha: no
// dia em que alguma tela (ou a API) passasse a ler a coluna, publicaria a
// promessa errada.
//
// Por isso o seed parou de gravar. A coluna ainda existe no banco e sai num
// deploy próprio, depois que o código no ar deixar de selecioná-la
// (src/actions/billing.ts, getPlans).
//
// Quem guarda a concordância entre o que se vende e o que o código entrega é
// src/lib/__tests__/vitrine-x-plano.test.ts, que lê `POR_PLANO` (src/lib/plan.ts),
// a grade da landing e `planFeatures` — e quebra quando divergirem.
// (Achado na auditoria de 13/09/2026, grupo 9.)
async function main() {
  const plans = [
    {
      name: "Starter",
      slug: "starter",
      priceMonthly: 97,
      priceYearly: 970,
      maxUsers: 3,
    },
    {
      name: "Pro",
      slug: "pro",
      priceMonthly: 197,
      priceYearly: 1970,
      maxUsers: 10,
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      priceMonthly: 397,
      priceYearly: 3970,
      maxUsers: 30,
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
