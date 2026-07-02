import { PrismaClient } from "../src/generated/prisma"

const prisma = new PrismaClient()

async function main() {
  await prisma.plan.upsert({
    where: { slug: "gratuito" },
    update: {},
    create: {
      name: "Gratuito",
      slug: "gratuito",
      priceMonthly: 0,
      priceYearly: 0,
      maxUsers: 1,
      features: ["1 usuário", "3 OS por mês", "Orçamentos básicos", "Suporte por e-mail"],
      active: true,
    },
  })
  console.log("Free plan seeded ✅")
}

main().finally(() => prisma.$disconnect())
