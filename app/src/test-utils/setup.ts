import { vi } from "vitest"

// redirect()/revalidatePath() exigem o "static generation store" do Next.js
// em runtime real — fora desse contexto (testes puros em Node), viram
// no-op/erro previsível. Global pra não repetir em cada arquivo de teste.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
