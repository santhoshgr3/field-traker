import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { detectStops, reverseGeocode } from '../lib/geoUtils'

function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'
}
function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function durMins(a, b) {
  if (!a || !b) return 0
  return Math.floor((new Date(b) - new Date(a)) / 60000)
}
function fmtDur(mins) {
  if (!mins || mins <= 0) return null
  return mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`
}

const EVENT_META = {
  task_started:   { icon: '▶', color: 'text-blue-600',   label: 'Task started' },
  task_completed: { icon: '✓', color: 'text-green-600',  label: 'Task completed' },
  photo_uploaded: { icon: '📷', color: 'text-purple-600', label: 'Photo uploaded' },
}

export default function EmployeeReport({ employee, date, onClose }) {
  const [loading, setLoading] = useState(true)
  const [att, setAtt] = useState(null)
  const [stops, setStops] = useState([])
  const [locs, setLocs] = useState([])
  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState([])
  const [names, setNames] = useState({})
  const mapRef = useRef(null)
  const leafletMap = useRef(null)

  useEffect(() => {
    const d0 = `${date}T00:00:00`, d1 = `${date}T23:59:59`
    Promise.all([
      supabase.from('attendance').select('*').eq('user_id', employee.id).eq('date', date).single(),
      supabase.from('location_history').select('lat,lng,recorded_at')
        .eq('user_id', employee.id).gte('recorded_at', d0).lte('recorded_at', d1)
        .order('recorded_at', { ascending: true }),
      supabase.from('tasks').select('*').eq('assigned_to', employee.id)
        .or(`and(started_at.gte.${d0},started_at.lte.${d1}),and(created_at.gte.${d0},created_at.lte.${d1})`),
      supabase.from('activity_logs').select('*').eq('user_id', employee.id)
        .gte('created_at', d0).lte('created_at', d1)
        .not('event_type', 'in', '(check_in,check_out)')
        .order('created_at', { ascending: true }),
    ]).then(([attRes, locsRes, tasksRes, logsRes]) => {
      const locsData = locsRes.data || []
      const computedStops = detectStops(locsData)
      setAtt(attRes.data)
      setStops(computedStops)
      setLocs(locsData)
      setTasks(tasksRes.data || [])
      setLogs(logsRes.data || [])
      setLoading(false)

      // Geocode stop locations + check-in/out
      ;(async () => {
        const pts = new Map()
        const addPt = (lat, lng) => {
          if (lat == null || lng == null) return
          const k = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`
          if (!pts.has(k)) pts.set(k, { lat: Number(lat), lng: Number(lng) })
        }
        addPt(attRes.data?.check_in_lat, attRes.data?.check_in_lng)
        computedStops.forEach(s => addPt(s.lat, s.lng))
        addPt(attRes.data?.check_out_lat, attRes.data?.check_out_lng)
        for (const [, p] of pts) {
          const name = await reverseGeocode(p.lat, p.lng)
          setNames(prev => ({ ...prev, [`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`]: name }))
          await new Promise(r => setTimeout(r, 350))
        }
      })()
    })
  }, [employee.id, date])

  // Build / refresh the route map whenever data is ready
  useEffect(() => {
    if (loading || !mapRef.current || !window.L) return
    if (locs.length === 0 && !att) return

    // Init map once
    if (!leafletMap.current) {
      const map = window.L.map(mapRef.current, { zoomControl: false, attributionControl: false })
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
      window.L.control.zoom({ position: 'bottomright' }).addTo(map)
      leafletMap.current = map
    }
    const map = leafletMap.current

    // Remove previous layers
    map.eachLayer(layer => { if (layer._routeLayer) map.removeLayer(layer) })

    const addRouteLayer = layer => { layer._routeLayer = true; layer.addTo(map); return layer }

    if (locs.length === 0) {
      // Only attendance coords available
      if (att?.check_in_lat) map.setView([att.check_in_lat, att.check_in_lng], 15)
    } else {
      const pts = locs.map(p => [p.lat, p.lng])

      // Route polyline
      if (pts.length >= 2) {
        const line = window.L.polyline(pts, { color: '#2563eb', weight: 4, opacity: 0.85 })
        addRouteLayer(line)
        map.fitBounds(line.getBounds(), { padding: [40, 40] })
      } else {
        map.setView(pts[0], 16)
      }

      // Waypoint dots (small, non-intrusive)
      pts.forEach((pt, i) => {
        if (i === 0 || i === pts.length - 1) return
        addRouteLayer(window.L.circleMarker(pt, { radius: 3, color: '#2563eb', fillColor: '#bfdbfe', fillOpacity: 1, weight: 1 })
          .bindPopup(fmtTime(locs[i].recorded_at)))
      })

      // Check-in marker (green)
      addRouteLayer(window.L.circleMarker(pts[0], { radius: 10, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1, weight: 2 })
        .bindPopup(`<b>Check-in</b><br/>${fmtTime(att?.check_in || locs[0].recorded_at)}`))

      // Stop markers (numbered)
      stops.forEach((stop, idx) => {
        const stopIcon = window.L.divIcon({
          className: '',
          html: `<div style="width:28px;height:28px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${idx + 1}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14],
        })
        addRouteLayer(window.L.marker([stop.lat, stop.lng], { icon: stopIcon })
          .bindPopup(`<b>Stop ${idx + 1}</b><br/>${fmtTime(stop.from)} – ${fmtTime(stop.to)}`))
      })

      // Last point marker
      const lastPt = pts[pts.length - 1]
      const isOut = !!att?.check_out
      addRouteLayer(window.L.circleMarker(lastPt, {
        radius: 10,
        color: isOut ? '#991b1b' : '#1e40af',
        fillColor: isOut ? '#ef4444' : '#3b82f6',
        fillOpacity: 1, weight: 2,
      }).bindPopup(isOut
        ? `<b>Check-out</b><br/>${fmtTime(att.check_out)}`
        : `<b>Last location</b><br/>${fmtTime(locs[locs.length - 1].recorded_at)}`))
    }

    return () => {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const placeName = (lat, lng) => {
    if (lat == null || lng == null) return null
    return names[`${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`] || '...'
  }

  const eventsInRange = (from, to) =>
    logs.filter(l => {
      const t = new Date(l.created_at).getTime()
      return t >= new Date(from).getTime() && t <= new Date(to).getTime()
    })

  const completedTasks = tasks.filter(t => t.status === 'done').length
  const totalMins = durMins(att?.check_in, att?.check_out || new Date().toISOString())

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col" style={{ height: '100dvh' }}>

      {/* Header */}
      <div className="bg-white border-b flex items-center gap-3 px-4 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}>
        <button onClick={onClose} className="p-2 -ml-2 rounded-xl active:bg-gray-100">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-gray-900 truncate">{employee.name}</p>
          <p className="text-xs text-gray-400">{fmtDate(date)}</p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-semibold">Daily Report</span>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading full report...</p>
        </div>
      ) : !att && stops.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-1">
            <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-600">No data for this day</p>
          <p className="text-xs text-gray-400">Employee did not work on {fmtDate(date)}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">

          {/* Route map */}
          <div ref={mapRef} style={{ height: '40dvh', minHeight: 220 }} className="w-full bg-gray-100" />

          {/* Map legend */}
          <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-100 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Check-in
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> Stops
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Check-out
            </span>
            <span className="flex items-center gap-1 ml-auto">
              <svg className="w-3 h-3 text-blue-400" viewBox="0 0 10 3" fill="none">
                <line x1="0" y1="1.5" x2="10" y2="1.5" stroke="#2563eb" strokeWidth="2.5"/>
              </svg>
              Route
            </span>
          </div>

          {/* Check-in photo */}
          {att?.check_in_photo && (
            <div className="relative">
              <img src={att.check_in_photo} alt="Check-in selfie" className="w-full object-cover" style={{ maxHeight: 220 }} />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-4 py-3">
                <p className="text-xs text-white/80">Check-in photo · {fmtTime(att?.check_in)}</p>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="px-4 pt-4 pb-1">
            <div className="bg-blue-600 rounded-2xl px-4 py-4 text-white">
              <div className="grid grid-cols-3 gap-0 text-center divide-x divide-blue-500">
                <div className="pr-2">
                  <p className="text-xs text-blue-200">Work time</p>
                  <p className="text-lg font-bold mt-0.5">{fmtDur(totalMins) || '—'}</p>
                </div>
                <div className="px-2">
                  <p className="text-xs text-blue-200">Locations</p>
                  <p className="text-lg font-bold mt-0.5">{stops.length}</p>
                </div>
                <div className="pl-2">
                  <p className="text-xs text-blue-200">Tasks</p>
                  <p className="text-lg font-bold mt-0.5">{completedTasks}<span className="text-sm text-blue-300">/{tasks.length}</span></p>
                </div>
              </div>
              <div className="flex justify-between mt-3 pt-3 border-t border-blue-500 text-xs">
                <span className="text-blue-200">In: <span className="text-white font-semibold">{fmtTime(att?.check_in)}</span></span>
                <span className="text-blue-200">Out: <span className="text-white font-semibold">{att?.check_out ? fmtTime(att.check_out) : 'Still out'}</span></span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="px-4 pt-4 pb-8">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Full Day Timeline</p>

            <div className="relative pl-10">
              {/* Vertical spine */}
              <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-200 rounded-full" />

              {/* Check-in */}
              {att?.check_in && (
                <div className="relative mb-4">
                  <div className="absolute -left-6 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-green-700">Checked In</p>
                      <p className="text-xs font-semibold text-gray-400">{fmtTime(att.check_in)}</p>
                    </div>
                    {att.check_in_lat && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {placeName(att.check_in_lat, att.check_in_lng)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Stops + events */}
              {stops.map((stop, idx) => {
                const prevTime = idx === 0 ? att?.check_in : stops[idx - 1].to
                const travelMins = prevTime ? durMins(prevTime, stop.from) : 0
                const stayMins = durMins(stop.from, stop.to)
                const stopName = placeName(stop.lat, stop.lng)
                const stopEvents = eventsInRange(stop.from, stop.to)

                return (
                  <div key={idx}>
                    {/* Travel */}
                    {travelMins > 1 && (
                      <div className="relative mb-3 flex items-center gap-2 pl-2">
                        <div className="absolute -left-4 w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <p className="text-xs text-gray-400 italic ml-2">{fmtDur(travelMins)} travel</p>
                      </div>
                    )}

                    {/* Stop card */}
                    <div className="relative mb-4">
                      <div className="absolute -left-6 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shadow-sm text-white text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        {/* Stop header */}
                        <div className="px-4 py-3 border-b border-gray-50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{stopName || 'Loading...'}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {fmtTime(stop.from)}{stop.pings.length > 1 ? ` – ${fmtTime(stop.to)}` : ''}
                                <span className="mx-1">·</span>{stop.pings.length} ping{stop.pings.length > 1 ? 's' : ''}
                              </p>
                            </div>
                            {stayMins > 0 && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-bold flex-shrink-0">
                                {fmtDur(stayMins)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Events within stop */}
                        {stopEvents.length > 0 && (
                          <div className="px-4 py-2 space-y-2">
                            {stopEvents.map((ev, ei) => {
                              const meta = EVENT_META[ev.event_type] || { icon: '•', color: 'text-gray-400', label: ev.event_type }
                              return (
                                <div key={ei} className="flex items-start gap-2.5">
                                  <span className={`text-sm font-bold ${meta.color} w-5 flex-shrink-0 text-center`}>{meta.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                                    {ev.details?.task_title && (
                                      <span className="text-xs text-gray-500"> · {ev.details.task_title}</span>
                                    )}
                                    {ev.details?.description && (
                                      <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.details.description}</p>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-300 flex-shrink-0">{fmtTime(ev.created_at)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Final travel before check-out */}
              {att?.check_out && stops.length > 0 && (() => {
                const t = durMins(stops[stops.length - 1].to, att.check_out)
                return t > 1 ? (
                  <div className="relative mb-3 flex items-center gap-2 pl-2">
                    <div className="absolute -left-4 w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <p className="text-xs text-gray-400 italic ml-2">{fmtDur(t)} travel</p>
                  </div>
                ) : null
              })()}

              {/* Check-out / Still out */}
              {att?.check_out ? (
                <div className="relative">
                  <div className="absolute -left-6 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-red-600">Checked Out</p>
                      <p className="text-xs font-semibold text-gray-400">{fmtTime(att.check_out)}</p>
                    </div>
                    {att.check_out_lat && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {placeName(att.check_out_lat, att.check_out_lng)}
                      </p>
                    )}
                    <p className="text-xs text-blue-600 font-bold mt-1.5">
                      Total worked: {fmtDur(durMins(att.check_in, att.check_out))}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute -left-6 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center shadow-sm">
                    <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                  </div>
                  <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                    <p className="text-sm font-bold text-yellow-600">Still on field</p>
                    <p className="text-xs text-gray-400 mt-0.5">Not checked out yet</p>
                  </div>
                </div>
              )}
            </div>

            {/* Tasks section */}
            {tasks.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tasks this day</p>
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${task.status === 'done' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-800 truncate">{task.title}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                              task.status === 'done' ? 'bg-green-100 text-green-700' :
                              task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {task.status === 'done' ? 'Done' : task.status === 'in_progress' ? 'In progress' : 'Pending'}
                            </span>
                          </div>
                          {task.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</p>}
                          <div className="flex gap-3 mt-1 text-xs text-gray-400">
                            {task.started_at && <span>Started <span className="text-gray-600 font-medium">{fmtTime(task.started_at)}</span></span>}
                            {task.completed_at && <span>Done <span className="text-green-600 font-semibold">{fmtTime(task.completed_at)}</span></span>}
                            {task.started_at && task.completed_at && (
                              <span className="text-blue-500">{fmtDur(durMins(task.started_at, task.completed_at))}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
