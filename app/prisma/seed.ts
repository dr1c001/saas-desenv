import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import "dotenv/config"

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const plans = [
    {
      name: "Starter",
      slug: "starter",
      priceMonthly: 97,
      priceYearly: 970,
      maxUsers: 3,
      features: ["Até 3 usuários", "50 OS por mês", "Relatórios básicos", "Suporte por e-mail"],
    },
    {
      name: "Pro",
      slug: "pro",
      priceMonthly: 197,
      priceYearly: 1970,
      maxUsers: 10,
      features: ["Até 10 usuários", "OS ilimitadas", "Mapa GPS", "Relatórios avançados", "Suporte prioritário"],
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      priceMonthly: 397,
      priceYearly: 3970,
      maxUsers: null,
      features: ["Usuários ilimitados", "OS ilimitadas", "Emissão de NFS-e", "API de integração", "Suporte 24h"],
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
