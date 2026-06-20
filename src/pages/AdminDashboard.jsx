import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ── Icons ────────────────────────────────────────────────────────────────────
const IconMap = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
)
const IconCalendar = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const IconActivity = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const IconClipboard = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
)
const IconUsers = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

// ─────────────────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0] }
function calcDuration(a, b) {
  if (!a || !b) return null
  const mins = Math.floor((new Date(b) - new Date(a)) / 60000)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─────────────────────────────────────────────────────────────────────────────

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = Math.PI / 180
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*toR) * Math.cos(lat2*toR) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function detectStops(locations, thresholdM = 100) {
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
async function reverseGeocode(lat, lng) {
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

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard({ user, profile }) {
  const [tab, setTab] = useState('map')
  const [employees, setEmployees] = useState([])
  const [locations, setLocations] = useState([])
  const [attendance, setAttendance] = useState([])
  const [attendanceDate, setAttendanceDate] = useState(todayStr())
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState({ title: '', description: '', assigned_to: '' })
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [mapDate, setMapDate] = useState(todayStr())
  const [movement, setMovement] = useState(null)   // { attendance, locations[] }
  const [movementLoading, setMovementLoading] = useState(false)
  const [locationNames, setLocationNames] = useState({}) // "lat,lng" -> place name
  const [activityLogs, setActivityLogs] = useState([])
  const [activityEmployee, setActivityEmployee] = useState('')
  const [activityDate, setActivityDate] = useState(todayStr())

  // Employee management state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newEmp, setNewEmp] = useState({ name: '', email: '', password: '', phone: '' })
  const [empLoading, setEmpLoading] = useState(false)
  const [empMsg, setEmpMsg] = useState({ text: '', type: '' })
  const [editingEmp, setEditingEmp] = useState(null)  // { id, name, phone, newPassword }
  const [deleteConfirm, setDeleteConfirm] = useState(null) // employee to delete

  const mapRef = useRef(null)
  const leafletMap = useRef(null)
  const markersRef = useRef({})
  const trailLayerRef = useRef(null)

  const fetchEmployees = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'field').order('created_at', { ascending: false })
    setEmployees(data || [])
  }

  useEffect(() => { fetchEmployees() }, [])

  // Live locations
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('locations').select('*, profiles(name)')
      setLocations(data || [])
    }
    fetch()
    const ch = supabase.channel('admin-locs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetch)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Attendance
  useEffect(() => {
    if (tab !== 'attendance') return
    supabase.from('attendance').select('*, profiles(name)')
      .eq('date', attendanceDate).order('check_in', { ascending: false })
      .then(({ data }) => setAttendance(data || []))
  }, [tab, attendanceDate])

  // Tasks
  useEffect(() => {
    if (tab !== 'tasks') return
    supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTasks(data || []))
  }, [tab])

  // Activity logs
  useEffect(() => {
    if (tab !== 'activity' || !activityEmployee) return
    supabase.from('activity_logs').select('*')
      .eq('user_id', activityEmployee)
      .gte('created_at', `${activityDate}T00:00:00`)
      .lte('created_at', `${activityDate}T23:59:59`)
      .order('created_at', { ascending: true })
      .then(({ data }) => setActivityLogs(data || []))
  }, [tab, activityEmployee, activityDate])

  // Init Leaflet map
  useEffect(() => {
    if (tab !== 'map') return
    if (!window.L || !mapRef.current || leafletMap.current) return
    const map = window.L.map('admin-map', { zoomControl: false }).setView([17.3850, 78.4867], 12)
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map)
    window.L.control.zoom({ position: 'bottomright' }).addTo(map)
    leafletMap.current = map
    return () => { map.remove(); leafletMap.current = null; markersRef.current = {}; trailLayerRef.current = null }
  }, [tab])

  // Update live markers
  useEffect(() => {
    const map = leafletMap.current
    if (!map || !window.L) return
    locations.forEach(loc => {
      const popup = `<b>${loc.profiles?.name}</b><br/>Updated: ${fmtTime(loc.updated_at)}`
      if (markersRef.current[loc.user_id]) {
        markersRef.current[loc.user_id].setLatLng([loc.lat, loc.lng]).setPopupContent(popup)
      } else {
        markersRef.current[loc.user_id] = window.L.marker([loc.lat, loc.lng]).addTo(map).bindPopup(popup)
      }
    })
  }, [locations])

  // Load movement report whenever employee or date changes
  useEffect(() => {
    if (!selectedEmployee) { setMovement(null); return }
    setMovementLoading(true)

    Promise.all([
      supabase.from('attendance').select('*')
        .eq('user_id', selectedEmployee).eq('date', mapDate).single(),
      supabase.from('location_history').select('lat, lng, recorded_at')
        .eq('user_id', selectedEmployee)
        .gte('recorded_at', `${mapDate}T00:00:00`)
        .lte('recorded_at', `${mapDate}T23:59:59`)
        .order('recorded_at', { ascending: true })
    ]).then(([attRes, locRes]) => {
      const locs = locRes.data || []
      const stops = detectStops(locs)
      setMovement({ attendance: attRes.data, locations: locs, stops })
      setMovementLoading(false)

      // Geocode only unique stop locations (much fewer requests than all pings)
      setLocationNames({});
      (async () => {
        const seen = new Set()
        const toGeocode = []
        const addPt = (lat, lng) => {
          if (lat == null || lng == null) return
          const k = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`
          if (!seen.has(k)) { seen.add(k); toGeocode.push({ lat: Number(lat), lng: Number(lng) }) }
        }
        addPt(attRes.data?.check_in_lat, attRes.data?.check_in_lng)
        stops.forEach(s => addPt(s.lat, s.lng))
        addPt(attRes.data?.check_out_lat, attRes.data?.check_out_lng)
        for (const p of toGeocode) {
          const name = await reverseGeocode(p.lat, p.lng)
          setLocationNames(prev => ({ ...prev, [`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`]: name }))
          await new Promise(r => setTimeout(r, 350))
        }
      })()

      // Draw trail on map
      const map = leafletMap.current
      if (!map || !window.L) return
      if (trailLayerRef.current) { trailLayerRef.current.remove(); trailLayerRef.current = null }

      if (locs.length === 0) return

      const pts = locs.map(p => [p.lat, p.lng])

      if (pts.length >= 2) {
        const line = window.L.polyline(pts, { color: '#2563eb', weight: 4, opacity: 0.8 }).addTo(map)
        trailLayerRef.current = line
        map.fitBounds(line.getBounds(), { padding: [50, 50] })
      } else {
        map.setView(pts[0], 16)
      }

      // Check-in marker (green)
      window.L.circleMarker(pts[0], { radius: 9, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1, weight: 2 })
        .addTo(map).bindPopup(`<b>Check-in</b><br/>${fmtTime(attRes.data?.check_in || locs[0].recorded_at)}`)

      // Waypoint dots
      pts.slice(1, -1).forEach((pt, i) => {
        window.L.circleMarker(pt, { radius: 4, color: '#2563eb', fillColor: '#93c5fd', fillOpacity: 1, weight: 1 })
          .addTo(map).bindPopup(`${fmtTime(locs[i + 1].recorded_at)}`)
      })

      // Last location marker (red if still out, grey if checked out)
      const isOut = !!attRes.data?.check_out
      window.L.circleMarker(pts[pts.length - 1], {
        radius: 9,
        color: isOut ? '#991b1b' : '#1e40af',
        fillColor: isOut ? '#ef4444' : '#3b82f6',
        fillOpacity: 1, weight: 2
      }).addTo(map).bindPopup(
        isOut
          ? `<b>Check-out</b><br/>${fmtTime(attRes.data.check_out)}`
          : `<b>Last location</b><br/>${fmtTime(locs[locs.length - 1].recorded_at)}`
      )
    })
  }, [selectedEmployee, mapDate])

  const callManageUser = async (method, body) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage---user`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    })
    return res.json().then(r => ({ ok: res.ok, ...r }))
  }

  const handleCreateEmployee = async () => {
    if (!newEmp.name || !newEmp.email || !newEmp.password) {
      setEmpMsg({ text: 'Name, email and password are required.', type: 'error' })
      return
    }
    setEmpLoading(true)
    setEmpMsg({ text: '', type: '' })
    const result = await callManageUser('POST', newEmp)
    if (!result.ok || result.error) {
      setEmpMsg({ text: result.error || 'Failed to create employee.', type: 'error' })
    } else {
      setEmpMsg({ text: `Employee "${newEmp.name}" created!`, type: 'success' })
      setNewEmp({ name: '', email: '', password: '', phone: '' })
      setShowCreateForm(false)
      fetchEmployees()
    }
    setEmpLoading(false)
  }

  const handleSaveEdit = async () => {
    setEmpLoading(true)
    const result = await callManageUser('PATCH', {
      id: editingEmp.id,
      name: editingEmp.name,
      phone: editingEmp.phone,
      ...(editingEmp.newPassword ? { password: editingEmp.newPassword } : {}),
    })
    if (!result.ok || result.error) {
      setEmpMsg({ text: result.error || 'Failed to update.', type: 'error' })
    } else {
      setEmpMsg({ text: 'Employee updated successfully!', type: 'success' })
      setEditingEmp(null)
      fetchEmployees()
    }
    setEmpLoading(false)
  }

  const handleDeleteEmployee = async (emp) => {
    setEmpLoading(true)
    const result = await callManageUser('DELETE', { id: emp.id })
    if (!result.ok || result.error) {
      setEmpMsg({ text: result.error || 'Failed to delete.', type: 'error' })
    } else {
      setEmpMsg({ text: `${emp.name} has been removed.`, type: 'success' })
      setDeleteConfirm(null)
      fetchEmployees()
    }
    setEmpLoading(false)
  }

  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.assigned_to) return
    await supabase.from('tasks').insert({ ...newTask, assigned_by: user.id })
    setNewTask({ title: '', description: '', assigned_to: '' })
    const { data } = await supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(name)').order('created_at', { ascending: false })
    setTasks(data || [])
  }

  const statusStyle = {
    pending: 'bg-yellow-100 text-yellow-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
  }

  const eventMeta = {
    check_in:       { icon: '🟢', label: 'Checked In',      bg: 'bg-green-50',   text: 'text-green-700' },
    check_out:      { icon: '🔴', label: 'Checked Out',     bg: 'bg-red-50',     text: 'text-red-700' },
    task_started:   { icon: '▶',  label: 'Task Started',    bg: 'bg-blue-50',    text: 'text-blue-700' },
    task_completed: { icon: '✓',  label: 'Task Completed',  bg: 'bg-emerald-50', text: 'text-emerald-700' },
    photo_uploaded: { icon: '📷', label: 'Photo Uploaded',  bg: 'bg-purple-50',  text: 'text-purple-700' },
  }

  const navItems = [
    { id: 'map',        label: 'Map',      Icon: IconMap },
    { id: 'attendance', label: 'Attend.',  Icon: IconCalendar },
    { id: 'activity',   label: 'Activity', Icon: IconActivity },
    { id: 'tasks',      label: 'Tasks',    Icon: IconClipboard },
    { id: 'employees',  label: 'Team',     Icon: IconUsers },
  ]

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: '100dvh' }}>

      {/* Header */}
      <div className="bg-white border-b flex items-center justify-between px-4 flex-shrink-0 z-10"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}>
        <div>
          <p className="text-xs text-gray-400 leading-none">Admin panel</p>
          <h1 className="text-base font-semibold text-gray-900 mt-0.5">Field Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{employees.length} employees</span>
          <button onClick={() => supabase.auth.signOut()}
            className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 active:bg-gray-100">
            Sign out
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* ── MAP ── */}
        {tab === 'map' && (
          <div className="flex flex-col h-full">
            {/* Map */}
            <div style={{ height: '42dvh', minHeight: 200, flexShrink: 0 }}>
              <div id="admin-map" ref={mapRef} className="w-full h-full" />
            </div>

            {/* Controls + timeline */}
            <div className="flex-1 overflow-y-auto">
              {/* Date + employee row */}
              <div className="px-4 pt-3 pb-2 flex gap-2">
                <div className="flex-1 bg-white rounded-xl px-3 py-2 shadow-sm flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <input type="date" value={mapDate} max={todayStr()}
                    onChange={e => setMapDate(e.target.value)}
                    className="text-sm font-medium text-gray-800 focus:outline-none bg-transparent w-full" />
                </div>
                <div className="flex-1 bg-white rounded-xl px-3 py-2 shadow-sm">
                  <select value={selectedEmployee || ''}
                    onChange={e => setSelectedEmployee(e.target.value || null)}
                    className="w-full text-sm text-gray-800 font-medium bg-transparent focus:outline-none">
                    <option value="">Select employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Movement timeline */}
              {!selectedEmployee ? (
                <div className="px-4 py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Select an employee to view movement report</p>
                  <p className="text-xs text-gray-400 mt-1">Full route from check-in to check-out</p>
                </div>
              ) : movementLoading ? (
                <div className="px-4 py-8 text-center">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Loading movement data...</p>
                </div>
              ) : !movement || (movement.locations.length === 0 && !movement.attendance) ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">No data for {fmtDate(mapDate)}</p>
                  <p className="text-xs text-gray-400 mt-1">Employee may not have worked this day</p>
                </div>
              ) : (
                <div className="px-4 pb-6">
                  {/* Summary card */}
                  <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-800">
                        {employees.find(e => e.id === selectedEmployee)?.name}
                      </span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${movement.attendance?.check_out ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                        {movement.attendance?.check_out ? 'Checked out' : 'On field'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-gray-400">Check-in</p>
                        <p className="text-sm font-semibold text-gray-800">{fmtTime(movement.attendance?.check_in) || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Check-out</p>
                        <p className="text-sm font-semibold text-gray-800">{fmtTime(movement.attendance?.check_out) || 'Still out'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Duration</p>
                        <p className="text-sm font-semibold text-blue-600">
                          {calcDuration(movement.attendance?.check_in, movement.attendance?.check_out || new Date().toISOString()) || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      <span className="text-xs text-gray-400">
                        {movement.stops?.length || 0} stops · {movement.locations.length} pings
                      </span>
                    </div>
                  </div>

                  {/* Check-in photo */}
                  {movement.attendance?.check_in_photo && (
                    <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-3">
                      <p className="text-xs font-semibold text-gray-500 px-4 pt-3 pb-2">Check-in photo</p>
                      <img src={movement.attendance.check_in_photo} alt="Check-in selfie"
                        className="w-full object-cover" style={{ maxHeight: 160 }} />
                    </div>
                  )}

                  {/* Timeline */}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                    Stops &amp; Movement · {movement.stops?.length || 0} areas visited
                  </p>
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* Check-in */}
                    {movement.attendance?.check_in && (() => {
                      const nameKey = movement.attendance.check_in_lat
                        ? `${Number(movement.attendance.check_in_lat).toFixed(5)},${Number(movement.attendance.check_in_lng).toFixed(5)}`
                        : null
                      return (
                        <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-50">
                          <div className="flex flex-col items-center mt-0.5">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </div>
                            {(movement.stops?.length > 0) && <div className="w-0.5 bg-gray-100 flex-1 min-h-5 mt-1" />}
                          </div>
                          <div className="flex-1 pb-1">
                            <p className="text-sm font-bold text-green-700">Checked In</p>
                            <p className="text-xs text-gray-500">{fmtTime(movement.attendance.check_in)}</p>
                            {nameKey && <p className="text-xs text-gray-400 truncate mt-0.5">{locationNames[nameKey] || '...'}</p>}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Stops */}
                    {(movement.stops || []).map((stop, idx) => {
                      const isLast = idx === (movement.stops.length - 1)
                      const prevTime = idx === 0 ? movement.attendance?.check_in : movement.stops[idx-1].to
                      const travelMins = prevTime ? Math.floor((new Date(stop.from) - new Date(prevTime)) / 60000) : 0
                      const stayMins = Math.floor((new Date(stop.to) - new Date(stop.from)) / 60000)
                      const nameKey = `${Number(stop.lat).toFixed(5)},${Number(stop.lng).toFixed(5)}`
                      const placeName = locationNames[nameKey]
                      return (
                        <div key={idx}>
                          {/* Travel segment */}
                          {travelMins > 0 && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50">
                              <div className="w-8 flex justify-center flex-shrink-0">
                                <div className="w-0.5 h-full bg-blue-200 mx-auto" style={{ minHeight: 16 }} />
                              </div>
                              <p className="text-xs text-blue-400 italic">
                                {travelMins < 60 ? `${travelMins} min travel` : `${Math.floor(travelMins/60)}h ${travelMins%60}m travel`}
                              </p>
                            </div>
                          )}
                          {/* Stop card */}
                          <div className={`flex items-start gap-3 px-4 py-3 ${!isLast || movement.attendance?.check_out ? 'border-b border-gray-50' : ''}`}>
                            <div className="flex flex-col items-center mt-0.5">
                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-blue-600 text-xs font-bold">{idx + 1}</span>
                              </div>
                              {(!isLast || movement.attendance?.check_out) && <div className="w-0.5 bg-gray-100 flex-1 min-h-5 mt-1" />}
                            </div>
                            <div className="flex-1 pb-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-800 truncate flex-1">
                                  {placeName || <span className="text-gray-400 font-normal">Loading...</span>}
                                </p>
                                {stayMins > 0 && (
                                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                                    {stayMins < 60 ? `${stayMins}m` : `${Math.floor(stayMins/60)}h ${stayMins%60}m`}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {fmtTime(stop.from)}{stop.pings.length > 1 ? ` – ${fmtTime(stop.to)}` : ''}
                              </p>
                              <p className="text-xs text-gray-300">{stop.pings.length} ping{stop.pings.length > 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Check-out or still on field */}
                    {movement.attendance?.check_out ? (() => {
                      const nameKey = movement.attendance.check_out_lat
                        ? `${Number(movement.attendance.check_out_lat).toFixed(5)},${Number(movement.attendance.check_out_lng).toFixed(5)}`
                        : null
                      const lastStop = movement.stops?.[movement.stops.length - 1]
                      const travelMins = lastStop ? Math.floor((new Date(movement.attendance.check_out) - new Date(lastStop.to)) / 60000) : 0
                      return (
                        <>
                          {travelMins > 0 && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50">
                              <div className="w-8 flex justify-center flex-shrink-0"><div className="w-0.5 bg-blue-200 mx-auto" style={{ minHeight: 16 }} /></div>
                              <p className="text-xs text-blue-400 italic">
                                {travelMins < 60 ? `${travelMins} min travel` : `${Math.floor(travelMins/60)}h ${travelMins%60}m travel`}
                              </p>
                            </div>
                          )}
                          <div className="flex items-start gap-3 px-4 py-3">
                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-red-600">Checked Out</p>
                              <p className="text-xs text-gray-500">{fmtTime(movement.attendance.check_out)}</p>
                              {nameKey && <p className="text-xs text-gray-400 truncate mt-0.5">{locationNames[nameKey] || '...'}</p>}
                              <p className="text-xs text-blue-500 mt-1 font-medium">
                                Total: {calcDuration(movement.attendance.check_in, movement.attendance.check_out)}
                              </p>
                            </div>
                          </div>
                        </>
                      )
                    })() : (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
                        </div>
                        <p className="text-sm text-yellow-600 font-medium">Still on field</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {tab === 'attendance' && (
          <div className="px-4 pt-4 pb-6 space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">Viewing date</p>
                <input type="date" value={attendanceDate} max={todayStr()}
                  onChange={e => setAttendanceDate(e.target.value)}
                  className="w-full text-sm font-medium text-gray-800 focus:outline-none bg-transparent" />
              </div>
              <span className="text-xs text-gray-400">{fmtDate(attendanceDate)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total', value: attendance.length, color: 'text-gray-800' },
                { label: 'On Field', value: attendance.filter(a => !a.check_out).length, color: 'text-green-600' },
                { label: 'Left', value: attendance.filter(a => a.check_out).length, color: 'text-gray-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-2xl py-3 shadow-sm text-center">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {attendance.length === 0
              ? <div className="bg-white rounded-2xl py-12 text-center shadow-sm"><p className="text-sm text-gray-400">No records for this date</p></div>
              : <div className="space-y-2">
                  {attendance.map(rec => {
                    const dur = calcDuration(rec.check_in, rec.check_out)
                    return (
                      <div key={rec.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-900">{rec.profiles?.name}</span>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${rec.check_out ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                            {rec.check_out ? 'Checked out' : 'On field'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>In: <span className="font-medium text-gray-700">{fmtTime(rec.check_in)}</span></span>
                          <span>Out: <span className="font-medium text-gray-700">{fmtTime(rec.check_out)}</span></span>
                          {dur && <span className="text-blue-600 font-semibold">{dur}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
            }
          </div>
        )}

        {/* ── ACTIVITY ── */}
        {tab === 'activity' && (
          <div className="px-4 pt-4 pb-6 space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Employee</p>
                <select value={activityEmployee} onChange={e => setActivityEmployee(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                  <option value="">Select employee…</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Date</p>
                <input type="date" value={activityDate} max={todayStr()}
                  onChange={e => setActivityDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
              </div>
            </div>

            {!activityEmployee && (
              <div className="bg-white rounded-2xl py-12 text-center shadow-sm">
                <p className="text-sm text-gray-400">Select an employee to view activity</p>
              </div>
            )}
            {activityEmployee && activityLogs.length === 0 && (
              <div className="bg-white rounded-2xl py-12 text-center shadow-sm">
                <p className="text-sm text-gray-400">No activity on this date</p>
              </div>
            )}

            {activityEmployee && activityLogs.length > 0 && (() => {
              const checkIn = activityLogs.find(l => l.event_type === 'check_in')
              const checkOut = activityLogs.find(l => l.event_type === 'check_out')
              const tasksCompleted = activityLogs.filter(l => l.event_type === 'task_completed').length
              const dur = calcDuration(checkIn?.created_at, checkOut?.created_at)
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Hours worked', value: dur || '—', color: 'text-gray-800' },
                      { label: 'Tasks done', value: tasksCompleted, color: 'text-emerald-600' },
                      { label: 'Events', value: activityLogs.length, color: 'text-blue-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-white rounded-2xl py-3 shadow-sm text-center">
                        <p className={`text-base font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Timeline</p>
                    <div className="relative pl-10">
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100" />
                      <div className="space-y-5">
                        {activityLogs.map(log => {
                          const meta = eventMeta[log.event_type]
                          return (
                            <div key={log.id} className="relative">
                              <div className={`absolute -left-10 w-8 h-8 rounded-full flex items-center justify-center text-sm ${meta?.bg}`}>
                                <span className={meta?.text}>{meta?.icon}</span>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{meta?.label}</p>
                                  {log.details?.task_title && <p className="text-xs text-gray-500 mt-0.5">"{log.details.task_title}"</p>}
                                  {log.event_type === 'check_out' && log.details?.worked_seconds && (
                                    <p className="text-xs text-blue-600 font-medium mt-0.5">
                                      Session: {Math.floor(log.details.worked_seconds / 3600)}h {Math.floor((log.details.worked_seconds % 3600) / 60)}m
                                    </p>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400 whitespace-nowrap">{fmtTime(log.created_at)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* ── TASKS ── */}
        {tab === 'tasks' && (
          <div className="px-4 pt-4 pb-6 space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Assign new task</p>
              <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Task title" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} />
              <textarea className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50"
                placeholder="Description (optional)" rows={2} value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} />
              <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                value={newTask.assigned_to} onChange={e => setNewTask({ ...newTask, assigned_to: e.target.value })}>
                <option value="">Select employee</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
              <button onClick={handleCreateTask} className="w-full bg-blue-600 text-white rounded-2xl py-3.5 text-sm font-semibold active:bg-blue-700">
                Assign Task
              </button>
            </div>
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm">
                  <div className="flex items-start gap-2 justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{task.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{task.profiles?.name}</p>
                      {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
                        {task.started_at && <span>Started {fmtTime(task.started_at)}</span>}
                        {task.completed_at && <span>Done {fmtTime(task.completed_at)}</span>}
                        {task.started_at && task.completed_at && (
                          <span className="text-blue-600 font-medium">{calcDuration(task.started_at, task.completed_at)}</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusStyle[task.status]}`}>{task.status}</span>
                  </div>
                  {task.photo_url && <img src={task.photo_url} alt="proof" className="mt-3 w-full h-32 object-cover rounded-xl" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── EMPLOYEES ── */}
        {tab === 'employees' && (
          <div className="px-4 pt-4 pb-6 space-y-4">

            {/* Delete confirmation modal */}
            {deleteConfirm && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 text-center">Delete Employee?</h3>
                  <p className="text-sm text-gray-500 text-center mt-1 mb-5">
                    <span className="font-medium text-gray-800">{deleteConfirm.name}</span> will be permanently removed. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setDeleteConfirm(null)}
                      className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-3 text-sm font-semibold active:bg-gray-200">
                      Cancel
                    </button>
                    <button onClick={() => handleDeleteEmployee(deleteConfirm)} disabled={empLoading}
                      className="flex-1 bg-red-600 text-white rounded-xl py-3 text-sm font-semibold active:bg-red-700 disabled:opacity-50">
                      {empLoading ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Message */}
            {empMsg.text && (
              <div className={`text-sm rounded-xl px-4 py-3 font-medium ${empMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {empMsg.text}
              </div>
            )}

            {/* Add button */}
            {!showCreateForm && !editingEmp && (
              <button onClick={() => { setShowCreateForm(true); setEmpMsg({ text: '', type: '' }) }}
                className="w-full bg-blue-600 text-white rounded-2xl py-4 text-sm font-semibold flex items-center justify-center gap-2 active:bg-blue-700">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add New Employee
              </button>
            )}

            {/* Create form */}
            {showCreateForm && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800">New Employee</p>
                  <button onClick={() => { setShowCreateForm(false); setEmpMsg({ text: '', type: '' }) }} className="p-1 text-gray-400 active:text-gray-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Full name *', key: 'name', type: 'text', placeholder: 'John Smith' },
                    { label: 'Email *', key: 'email', type: 'email', placeholder: 'john@company.com' },
                    { label: 'Password *', key: 'password', type: 'password', placeholder: 'Min. 6 characters' },
                    { label: 'Phone (optional)', key: 'phone', type: 'tel', placeholder: '+91 98765 43210' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
                      <input type={type} inputMode={type === 'email' ? 'email' : type === 'tel' ? 'tel' : undefined}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        placeholder={placeholder} value={newEmp[key]}
                        onChange={e => setNewEmp({ ...newEmp, [key]: e.target.value })} />
                    </div>
                  ))}
                  <button onClick={handleCreateEmployee} disabled={empLoading}
                    className="w-full bg-blue-600 text-white rounded-2xl py-3.5 text-sm font-semibold active:bg-blue-700 disabled:opacity-50 mt-1">
                    {empLoading ? 'Creating…' : 'Create Employee'}
                  </button>
                </div>
              </div>
            )}

            {/* Edit form */}
            {editingEmp && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800">Edit Employee</p>
                  <button onClick={() => { setEditingEmp(null); setEmpMsg({ text: '', type: '' }) }} className="p-1 text-gray-400 active:text-gray-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Full name</p>
                    <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      value={editingEmp.name} onChange={e => setEditingEmp({ ...editingEmp, name: e.target.value })} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Phone</p>
                    <input type="tel" inputMode="tel" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      placeholder="+91 98765 43210" value={editingEmp.phone || ''}
                      onChange={e => setEditingEmp({ ...editingEmp, phone: e.target.value })} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">New password <span className="text-gray-400">(leave blank to keep current)</span></p>
                    <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      placeholder="Enter new password to change"
                      value={editingEmp.newPassword || ''}
                      onChange={e => setEditingEmp({ ...editingEmp, newPassword: e.target.value })} />
                  </div>
                  <button onClick={handleSaveEdit} disabled={empLoading}
                    className="w-full bg-blue-600 text-white rounded-2xl py-3.5 text-sm font-semibold active:bg-blue-700 disabled:opacity-50">
                    {empLoading ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}

            {/* Employee list */}
            {!showCreateForm && !editingEmp && (
              <>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{employees.length} field employees</p>
                {employees.length === 0 && (
                  <div className="bg-white rounded-2xl py-12 text-center shadow-sm">
                    <p className="text-sm text-gray-400">No employees yet. Add your first one above.</p>
                  </div>
                )}
                <div className="space-y-2">
                  {employees.map(emp => {
                    const loc = locations.find(l => l.user_id === emp.id)
                    return (
                      <div key={emp.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                            {emp.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{emp.name}</p>
                            {emp.phone && <p className="text-xs text-gray-400">{emp.phone}</p>}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 inline-block ${loc ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {loc ? 'On field' : 'Offline'}
                            </span>
                          </div>
                          {/* Edit & Delete buttons */}
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditingEmp({ ...emp, newPassword: '' }); setEmpMsg({ text: '', type: '' }) }}
                              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 active:bg-blue-50 active:text-blue-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => { setDeleteConfirm(emp); setEmpMsg({ text: '', type: '' }) }}
                              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 active:bg-red-50 active:text-red-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t flex-shrink-0 z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {navItems.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors active:opacity-60 ${tab === id ? 'text-blue-600' : 'text-gray-400'}`}>
              <Icon active={tab === id} />
              <span className={`text-xs font-medium ${tab === id ? 'text-blue-600' : 'text-gray-400'}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
