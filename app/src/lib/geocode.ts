// Endereço → coordenada.
//
// Provedor: Geoapify quando há GEOAPIFY_API_KEY, Nominatim quando não há.
//
// Por que Geoapify e não Google: o sistema GUARDA a coordenada no banco e
// desenha num mapa Leaflet com tiles do OpenStreetMap. A licença do Google
// exige que resultado exibido em mapa apareça num mapa do Google, e restringe
// guardar. O Geoapify permite guardar pra sempre (mantida a atribuição) e não
// exige mapa dele — que é exatamente o que este sistema precisa. Detalhes e
// comparação em PLANO_DE_ENGENHARIA.md.
//
// Por que a reserva existe: a chave é criada pelo dono na Vercel. Enquanto ela
// não existir — e em qualquer deploy antigo, no ambiente local e nos testes —
// o Nominatim continua atendendo. Trocar de provedor não pode ser um degrau
// onde o sistema fica sem geocodificação nenhuma.

export type Coordenada = { latitude: number; longitude: number }

export type AddressParts = {
  street?: string | null
  number?: string | null
  city?: string | null
  state?: string | null
}

// Abreviações que o brasileiro digita naturalmente e o buscador não entende.
// "av abel francisco" devolve vazio; "avenida abel francisco" acha na hora.
// Vale pros dois provedores: ambos usam dado do OpenStreetMap.
const ABBREV: [RegExp, string][] = [
  [/\bav\.?\b/gi, "avenida"],
  [/\br\.?\b/gi, "rua"],
  [/\bpc\.?\b/gi, "praça"],
  [/\bpca\.?\b/gi, "praça"],
  [/\brod\.?\b/gi, "rodovia"],
  [/\bestr\.?\b/gi, "estrada"],
  [/\bal\.?\b/gi, "alameda"],
  [/\btv\.?\b/gi, "travessa"],
]

function expand(street: string): string {
  return ABBREV.reduce((s, [re, full]) => s.replace(re, full), street)
}

/**
 * As consultas a tentar, da mais específica pra mais genérica.
 *
 * Antes era uma tentativa só, com o endereço completo: qualquer erro de
 * digitação ou abreviação na rua ("av abel fraancisco") devolvia vazio, e o
 * cliente ficava SEM coordenada nenhuma — fora do mapa, sem nenhum aviso. Um
 * alfinete no bairro/cidade certos é muito mais útil que alfinete nenhum.
 * (Achado com OS que não aparecia no mapa, 10/08/2026.)
 *
 * Função pura e exportada porque o lote precisa da MESMA montagem de consulta
 * que a busca avulsa — duas montagens diferentes dariam pinos diferentes pro
 * mesmo endereço, dependendo de por onde ele entrou no sistema.
 */
export function consultasPara(parts: AddressParts): string[] {
  const { street, number, city, state } = parts
  if (!city && !street) return []

  return [
    // 1) rua + número + cidade, com abreviações expandidas
    street && [expand(street), number, city, state, "Brasil"].filter(Boolean).join(", "),
    // 2) sem o número (número costuma ser o que não se acha)
    street && [expand(street), city, state, "Brasil"].filter(Boolean).join(", "),
    // 3) só cidade/estado — pino aproximado, melhor que nenhum
    city && [city, state, "Brasil"].filter(Boolean).join(", "),
  ].filter((q): q is string => Boolean(q))
}

export function chaveGeoapify(): string | null {
  return process.env.GEOAPIFY_API_KEY?.trim() || null
}

/** Qual provedor está valendo agora. Usado em diagnóstico e no cron. */
export function provedor(): "geoapify" | "nominatim" {
  return chaveGeoapify() ? "geoapify" : "nominatim"
}

/** Lê lat/lon de uma resposta do Geoapify, sem confiar no formato. */
export function lerCoordenadaGeoapify(json: unknown): Coordenada | null {
  const r = (json as { results?: unknown[] })?.results?.[0] as
    | { lat?: unknown; lon?: unknown }
    | undefined
  if (!r) return null
  const latitude = Number(r.lat)
  const longitude = Number(r.lon)
  // Number(undefined) é NaN, e NaN gravado no banco vira coordenada inválida
  // que joga o pino no meio do oceano — pior que pino nenhum.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

async function buscarGeoapify(q: string, chave: string): Promise<Coordenada | null> {
  try {
    const url =
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(q)}` +
      `&filter=countrycode:br&limit=1&format=json&apiKey=${encodeURIComponent(chave)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return lerCoordenadaGeoapify(await res.json())
  } catch {
    return null
  }
}

async function buscarNominatim(q: string): Promise<Coordenada | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=br`
    const res = await fetch(url, {
      headers: { "User-Agent": "ServicOS-SaaS/1.0 (adrielwellington02@gmail.com)" },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.[0]?.lat) {
      const latitude = parseFloat(data[0].lat)
      const longitude = parseFloat(data[0].lon)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      return { latitude, longitude }
    }
  } catch {}
  return null
}

export async function geocodeAddress(parts: AddressParts): Promise<Coordenada | null> {
  const chave = chaveGeoapify()
  for (const q of consultasPara(parts)) {
    const hit = chave ? await buscarGeoapify(q, chave) : await buscarNominatim(q)
    if (hit) return hit
  }
  return null
}
