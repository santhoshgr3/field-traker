export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = Math.PI / 180
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*toR) * Math.cos(lat2*toR) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function detectStops(locations, thresholdM = 100) {
  if (!locations.length) return []
  const stops = []
  let group = [locations[0]]
  for (let i = 1; i < locations.length; i++) {
    const prev = group[group.length - 1]
    const curr = locations[i]
    if (haversineM(prev.lat, prev.lng, curr.lat, curr.lng) <= thresholdM) {
      group.push(curr)
    } else {
      stops.push({ pings: group, from: group[0].recorded_at, to: group[group.length-1].recorded_at, lat: group[0].lat, lng: group[0].lng })
      group = [curr]
    }
  }
  stops.push({ pings: group, from: group[0].recorded_at, to: group[group.length-1].recorded_at, lat: group[0].lat, lng: group[0].lng })
  return stops
}

const geocodeCache = {}
export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (geocodeCache[key]) return geocodeCache[key]
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    const a = data.address || {}
    const name = a.road || a.neighbourhood || a.suburb || a.village || a.town || a.city_district || a.city || data.display_name?.split(',')[0] || key
    geocodeCache[key] = name
    return name
  } catch {
    return key
  }
}
