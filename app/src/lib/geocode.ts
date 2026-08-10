type AddressParts = {
  street?: string | null
  number?: string | null
  city?: string | null
  state?: string | null
}

// Abreviações que o brasileiro digita naturalmente e o Nominatim não entende.
// "av abel francisco" devolve vazio; "avenida abel francisco" acha na hora.
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

async function query(q: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=br`
    const res = await fetch(url, {
      headers: { "User-Agent": "ServicOS-SaaS/1.0 (adrielwellington02@gmail.com)" },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.[0]?.lat) {
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) }
    }
  } catch {}
  return null
}

// Antes era uma tentativa só, com o endereço completo: qualquer erro de
// digitação ou abreviação na rua ("av abel fraancisco") fazia o Nominatim
// devolver vazio, e o cliente ficava SEM coordenada nenhuma — ou seja, fora
// do mapa, sem nenhum aviso. Um alfinete no bairro/cidade certos é muito mais
// útil que alfinete nenhum, então agora tenta em cascata, do mais específico
// pro mais genérico. (Achado com OS que não aparecia no mapa, 10/08/2026.)
export async function geocodeAddress(parts: AddressParts): Promise<{ latitude: number; longitude: number } | null> {
  const { street, number, city, state } = parts
  if (!city && !street) return null

  const cityState = [city, state, "Brasil"].filter(Boolean).join(", ")
  const tentativas = [
    // 1) rua + número + cidade, com abreviações expandidas
    street && [expand(street), number, city, state, "Brasil"].filter(Boolean).join(", "),
    // 2) sem o número (número costuma ser o que o Nominatim não acha)
    street && [expand(street), city, state, "Brasil"].filter(Boolean).join(", "),
    // 3) só cidade/estado — pino aproximado, melhor que nenhum
    city && cityState,
  ].filter((q): q is string => Boolean(q))

  for (const q of tentativas) {
    const hit = await query(q)
    if (hit) return hit
  }
  return null
}
