import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    pool: "forks",
    hookTimeout: 30_000,
    // 60s, e não 15s.
    //
    // Os testes de PDF renderizam com o react-pdf de verdade — ~1,5s cada
    // rodando sozinho, mas bem mais sob a carga da suíte completa (50 arquivos
    // em forks paralelos). Com 15s eles piscavam: falharam três vezes em dias
    // diferentes, em ARQUIVOS diferentes, sempre por tempo e sempre passando ao
    // rodar isolados.
    //
    // Teste que falha ao acaso é pior que teste que não existe: ensina a
    // reexecutar até passar, e no dia em que a falha for real ninguém olha.
    // Aqui e não em cada arquivo de PDF, que seriam três cópias da mesma linha.
    testTimeout: 60_000,
    setupFiles: ["./src/test-utils/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
