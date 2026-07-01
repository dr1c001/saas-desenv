export async function geocodeAddress(parts: {
  street?: string | null
  number?: string | null
  city?: string | null
  state?: string | null
}): Promise<{ latitude: number; longitude: number } | null> {
  const query = [parts.street, parts.number, parts.city, parts.state, "Brasil"]
    .filter(Boolean)
    .join(", ")

  if (!parts.city && !parts.street) return null

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`
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
