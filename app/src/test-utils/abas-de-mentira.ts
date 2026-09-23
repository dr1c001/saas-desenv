import { abasPadraoDe, ehAdministrativo } from "@/lib/cargos"
import type { TabSlug } from "@/lib/abas"

/**
 * `podeAba` e `requireAba` para os testes que trocam `@/lib/auth` por um mock.
 *
 * Reproduzem a regra real para a empresa que NUNCA configurou permissões: dono
 * e administrador passam; os outros cargos passam pelo padrão de ABAS_PADRAO.
 * É puro — sem banco — porque o que esses testes provam é outra coisa (comissão,
 * parcela, DRE); a regra da aba em si tem o próprio teste, com banco, em
 * lib/__tests__/a-aba-decide-o-cargo.test.ts.
 *
 * Recebe o mock de `getTenant` porque é dele que sai o cargo em cada caso.
 */
export function abasDeMentira(getTenant: () => Promise<{ role: string }>) {
  const podeAba = async (aba: TabSlug) => {
    const { role } = await getTenant()
    return ehAdministrativo(role) || abasPadraoDe(role).includes(aba)
  }
  const requireAba = async (aba: TabSlug) => {
    if (!(await podeAba(aba))) throw new Error("noPermission")
  }
  return { podeAba, requireAba }
}
