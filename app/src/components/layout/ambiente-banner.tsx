import { ambiente } from "@/lib/ambiente"

// Faixa fixa no topo quando NÃO é produção.
//
// O jeito mais caro de errar num ambiente de teste é achar que se está nele
// quando se está em produção — ou o contrário, e passar a tarde cadastrando
// dados de verdade que ninguém vai usar. A faixa some sozinha em produção, sem
// nenhuma configuração: quem decide é a própria Vercel.
export function AmbienteBanner() {
  const atual = ambiente()
  if (atual === "producao") return null

  return (
    <div className="sticky top-0 z-[60] bg-amber-500 text-amber-950 text-center text-xs font-semibold py-1 px-3">
      {atual === "teste"
        ? "AMBIENTE DE TESTE — dados fictícios. Nenhum e-mail, nota fiscal ou cobrança sai daqui."
        : "AMBIENTE LOCAL — dados da sua máquina."}
    </div>
  )
}
