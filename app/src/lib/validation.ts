import { getTranslations } from "next-intl/server"

// Os schemas do zod vivem no escopo do módulo (sem request context pra
// resolver idioma), então guardam CÓDIGOS estáveis — "nameRequired" — em vez
// de frases prontas. Quem traduz é a action, no idioma de quem chamou, logo
// depois do safeParse. Sem isso o formulário exibiria o código cru pro
// usuário, que é pior do que o português fixo que havia antes.
// (i18n, 07/08/2026.)
type ValidationKey = Parameters<Awaited<ReturnType<typeof getTranslations<"validation">>>>[0]

export async function translateFieldErrors(
  fieldErrors: Record<string, string[] | undefined>
): Promise<Record<string, string[]>> {
  const t = await getTranslations("validation")
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, codes]) => [
      field,
      (codes ?? []).map((code) => t(code as ValidationKey)),
    ])
  )
}
