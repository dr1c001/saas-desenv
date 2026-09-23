# ServiçoOS — aplicação

Esta pasta é a aplicação Next.js. **A documentação do projeto está na raiz:**

- [`../README.md`](../README.md) — o que é, como rodar, mapa das pastas e as
  armadilhas que custam meio dia a quem chega
- [`../PLANO_DE_ENGENHARIA.md`](../PLANO_DE_ENGENHARIA.md) — a referência
  técnica viva: 36 seções de decisão, cada uma com o porquê

Antes de escrever código aqui, leia [`AGENTS.md`](AGENTS.md): esta versão do
Next.js tem mudanças que quebram o que a maioria das referências ensina.

## O mínimo para rodar

```bash
npm install
npm run dev          # precisa de .env.local — ver o README da raiz
npm test             # 715 testes. NUNCA `npx vitest run`, que pula o pretest
npm run deploy:prod  # git push NÃO faz deploy
```
