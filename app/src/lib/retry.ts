import { Prisma } from "@/generated/prisma/client"

// nextOrderNumber/nextQuoteNumber/nextOmNumber leem "o último número" e somam
// 1 sem lock — duas criações simultâneas (dois atendentes ao mesmo tempo, ou
// duplo-clique) podem calcular o mesmo próximo número. number tem
// @@unique([tenantId, number]) no schema, então isso nunca cria duplicata
// silenciosa — mas sem retry, a segunda criação simplesmente falhava com um
// erro cru do Prisma (P2002) em vez de tentar de novo com o número certo.
// (Achado em auditoria pré-venda, 2026-08-05.)
export async function retryOnUniqueConflict<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      const isConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
      if (!isConflict || i === attempts - 1) throw err
    }
  }
  throw new Error("unreachable")
}
