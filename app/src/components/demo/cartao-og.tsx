import { ImageResponse } from "next/og"

// O cartão que aparece quando o link da demo é colado no WhatsApp.
//
// ─── Por que isto importa mais do que parece ─────────────────────────────────
//
// A venda deste produto é por conversa: manda-se o link para o dono de uma
// desentupidora, e ele decide em meio segundo se toca. Link pelado, sem figura
// e com a descrição genérica do site ("CRM, OS, Financeiro e Dashboard"), é
// jargão que não diz nada para quem controla serviço no caderno — e some no
// meio da conversa. Um cartão com o NOME DO RAMO dele é outra coisa.
//
// ─── Restrições do desenho ───────────────────────────────────────────────────
//
// Isto não é o navegador: o `ImageResponse` desenha com o satori, que aceita um
// subconjunto de CSS. Só flexbox (`display: flex` explícito em todo elemento
// com mais de um filho), nada de grid, nada de fonte externa. Sem fonte própria
// de propósito — a padrão já cobre o português com acento, e carregar arquivo
// de fonte é a mesma classe de problema que quebrou o `sharp` na Vercel.
//
// É lido em MINIATURA, dentro de uma bolha de conversa. Por isso texto grande,
// contraste alto e três informações, não dez.

export const TAMANHO_OG = { width: 1200, height: 630 }

/** O que o sistema faz, em quatro palavras que o dono reconhece. */
const MODULOS = ["Orçamento", "Ordem de serviço", "Equipe em campo", "Financeiro"]

export function cartaoOg({
  ramo,
  chamada,
  semRamo,
}: {
  ramo: string | null
  chamada: string
  /** A manchete de quando nao ha ramo — o endereco curto /demo. */
  semRamo: string
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0B1B2E",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Marca à esquerda, endereço à direita.
            O endereço estava na fileira de baixo, disputando largura com as
            pastilhas: com `space-between` elas o empurravam para fora da tela e
            saía "servicoos.com.b", com o "r" cortado. Conferido gerando a
            imagem e olhando — nada no código acusaria isso. Aqui em cima a
            fileira tem só dois elementos e sobra espaço. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 14,
                height: 44,
                backgroundColor: "#0A66C2",
                borderRadius: 4,
                marginRight: 20,
              }}
            />
            <div style={{ color: "#FFFFFF", fontSize: 38, fontWeight: 700 }}>ServiçoOS</div>
          </div>
          <div style={{ display: "flex", color: "#5E9BD6", fontSize: 30 }}>servicoos.com.br</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {ramo && (
            <div style={{ color: "#8FB4DC", fontSize: 34, marginBottom: 10 }}>
              O sistema para
            </div>
          )}
          {/* A linha que carrega tudo. Em miniatura, é praticamente a única
              coisa legível — por isso ela é o RAMO, e não o nome do produto. */}
          <div
            style={{
              color: "#FFFFFF",
              fontSize: ramo ? 92 : 78,
              fontWeight: 700,
              lineHeight: 1.05,
            }}
          >
            {ramo ?? semRamo}
          </div>
          <div style={{ color: "#B9CBE0", fontSize: 36, marginTop: 22 }}>{chamada}</div>
        </div>

        <div style={{ display: "flex" }}>
          {MODULOS.map((m) => (
            <div
              key={m}
              style={{
                display: "flex",
                color: "#CFE0F2",
                fontSize: 26,
                border: "2px solid #24405F",
                borderRadius: 999,
                padding: "10px 24px",
                marginRight: 14,
              }}
            >
              {m}
            </div>
          ))}
        </div>
      </div>
    ),
    TAMANHO_OG
  )
}
