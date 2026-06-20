import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ── Bottom nav icons ──────────────────────────────────────────────────────────
const IconHome = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)
const IconTasks = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
)
const IconTimeline = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

// ─────────────────────────────────────────────────────────────────────────────

function fmtClock(s) {
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(v => String(v).padStart(2, '0')).join(':')
}
function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EmployeeDashboard({ user, profile }) {
  const [tab, setTab] = useState('home')
  const [checkedIn, setCheckedIn] = useState(false)
  const [attendanceId, setAttendanceId] = useState(null)
  const [checkInTime, setCheckInTime] = useState(null)
  const [checkInPhoto, setCheckInPhoto] = useState(null)
  const [tasks, setTasks] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [workedSeconds, setWorkedSeconds] = useState(0)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: '' })

  // Check-in photo modal state
  const [showCheckinModal, setShowCheckinModal] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState(null)   // File object
  const [photoPreview, setPhotoPreview] = useState(null)     // data URL
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const clockRef = useRef(null)

  // ── Live clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (checkedIn && checkInTime) {
      const tick = () => setWorkedSeconds(Math.floor((Date.now() - new Date(checkInTime).getTime()) / 1000))
      tick()
      clockRef.current = setInterval(tick, 1000)
    } else {
      clearInterval(clockRef.current)
    }
    return () => clearInterval(clockRef.current)
  }, [checkedIn, checkInTime])

  // ── GPS tracking (only when checked in) ────────────────────────────────────
  useEffect(() => {
    if (!checkedIn) return
    const send = () => {
      navigator.geolocation.getCurrentPosition(async ({ coords: { latitude: lat, longitude: lng } }) => {
        const now = new Date().toISOString()
        await supabase.from('locations').upsert({ user_id: user.id, lat, lng, updated_at: now }, { onConflict: 'user_id' })
        await supabase.from('location_history').insert({ user_id: user.id, lat, lng, recorded_at: now })
      })
    }
    send()
    const iv = setInterval(send, 30000)
    return () => clearInterval(iv)
  }, [checkedIn, user.id])

  // ── Load today's attendance ─────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    supabase.from('attendance').select('*')
      .eq('user_id', user.id).eq('date', today).is('check_out', null).single()
      .then(({ data }) => {
        if (data) { setCheckedIn(true); setAttendanceId(data.id); setCheckInTime(data.check_in); setCheckInPhoto(data.check_in_photo) }
      })
  }, [user.id])

  // ── Load tasks ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('tasks').select('*').eq('assigned_to', user.id).order('created_at', { ascending: false })
      setTasks(data || [])
    }
    fetch()
    const ch = supabase.channel('emp-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${user.id}` }, fetch)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user.id])

  // ── Load today's activity ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchLogs = async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase.from('activity_logs').select('*')
        .eq('user_id', user.id).gte('created_at', `${today}T00:00:00`).order('created_at', { ascending: true })
      setActivityLogs(data || [])
    }
    fetchLogs()
    const ch = supabase.channel('emp-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `user_id=eq.${user.id}` }, fetchLogs)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user.id])

  const logActivity = (event_type, details = {}) =>
    supabase.from('activity_logs').insert({ user_id: user.id, event_type, details })

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 3500)
  }

  // ── Photo selection ─────────────────────────────────────────────────────────
  const handlePhotoSelect = (file) => {
    if (!file) return
    setCapturedPhoto(file)
    const reader = new FileReader()
    reader.onload = e => setPhotoPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  // ── Check In (with photo) ───────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!capturedPhoto) { showMsg('Please take a check-in photo first.', 'error'); return }
    setLoading(true)
    setUploadingPhoto(true)

    // Upload check-in photo
    const path = `checkin/${user.id}/${Date.now()}_checkin.jpg`
    const { error: uploadErr } = await supabase.storage.from('task-photos').upload(path, capturedPhoto)
    if (uploadErr) { showMsg('Photo upload failed.', 'error'); setLoading(false); setUploadingPhoto(false); return }
    const { data: { publicUrl } } = supabase.storage.from('task-photos').getPublicUrl(path)
    setUploadingPhoto(false)

    // Get location & create attendance
    navigator.geolocation.getCurrentPosition(async ({ coords: { latitude: lat, longitude: lng } }) => {
      const { data } = await supabase.from('attendance')
        .insert({ user_id: user.id, check_in_lat: lat, check_in_lng: lng, check_in_photo: publicUrl })
        .select().single()
      if (data) { setCheckedIn(true); setAttendanceId(data.id); setCheckInTime(data.check_in); setCheckInPhoto(publicUrl) }
      await logActivity('check_in', { lat, lng, photo: publicUrl })
      setShowCheckinModal(false)
      setCapturedPhoto(null)
      setPhotoPreview(null)
      showMsg('Checked in! Location tracking started.')
      setLoading(false)
    }, () => { showMsg('Location access denied.', 'error'); setLoading(false) })
  }

  // ── Check Out ───────────────────────────────────────────────────────────────
  const handleCheckOut = async () => {
    setLoading(true)
    navigator.geolocation.getCurrentPosition(async ({ coords: { latitude: lat, longitude: lng } }) => {
      await supabase.from('attendance').update({
        check_out: new Date().toISOString(), check_out_lat: lat, check_out_lng: lng
      }).eq('id', attendanceId)
      await logActivity('check_out', { lat, lng, worked_seconds: workedSeconds })
      await supabase.from('locations').delete().eq('user_id', user.id)
      setCheckedIn(false); setAttendanceId(null); setCheckInTime(null); setCheckInPhoto(null); setWorkedSeconds(0)
      showMsg('Checked out. Have a great day!')
      setLoading(false)
    }, () => { showMsg('Location access denied.', 'error'); setLoading(false) })
  }

  // ── Task status ─────────────────────────────────────────────────────────────
  const handleTaskStatus = async (task, newStatus) => {
    const now = new Date().toISOString()
    const updates = { status: newStatus, updated_at: now }
    if (newStatus === 'in-progress') updates.started_at = now
    if (newStatus === 'done') updates.completed_at = now
    await supabase.from('tasks').update(updates).eq('id', task.id)
    await logActivity(newStatus === 'in-progress' ? 'task_started' : 'task_completed', { task_id: task.id, task_title: task.title })
  }

  // ── Task photo ──────────────────────────────────────────────────────────────
  const handleTaskPhoto = async (task, file) => {
    const path = `${task.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('task-photos').upload(path, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('task-photos').getPublicUrl(path)
      await supabase.from('tasks').update({ photo_url: publicUrl }).eq('id', task.id)
      await logActivity('photo_uploaded', { task_id: task.id, task_title: task.title })
      showMsg('Photo uploaded!')
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const pendingTasks = tasks.filter(t => t.status === 'pending').length
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length

  const statusStyle = {
    pending: 'bg-yellow-100 text-yellow-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    done: 'bg-green-100 text-green-800',
  }

  const eventMeta = {
    check_in:       { icon: '🟢', label: 'Checked In' },
    check_out:      { icon: '🔴', label: 'Checked Out' },
    task_started:   { icon: '▶',  label: 'Task Started' },
    task_completed: { icon: '✓',  label: 'Task Completed' },
    photo_uploaded: { icon: '📷', label: 'Photo Uploaded' },
  }

  const navItems = [
    { id: 'home',     label: 'Home',     Icon: IconHome },
    { id: 'tasks',    label: 'Tasks',    Icon: IconTasks },
    { id: 'timeline', label: 'Timeline', Icon: IconTimeline },
  ]

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: '100dvh' }}>

      {/* ── Header ── */}
      <div className="bg-white border-b px-4 flex items-center justify-between flex-shrink-0 z-10"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {profile.name?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <p className="text-xs text-gray-400 leading-none">Welcome back</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{profile.name}</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()}
          className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-2 active:bg-gray-100">
          Sign out
        </button>
      </div>

      {/* ── Check-in photo modal ── */}
      {showCheckinModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl p-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-gray-900">Check-in photo</h2>
                <p className="text-xs text-gray-400 mt-0.5">Take a selfie or upload a photo to verify your attendance</p>
              </div>
              <button onClick={() => { setShowCheckinModal(false); setCapturedPhoto(null); setPhotoPreview(null) }}
                className="p-2 text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Photo preview or capture */}
            {photoPreview ? (
              <div className="relative mb-4">
                <img src={photoPreview} alt="Check-in" className="w-full h-56 object-cover rounded-2xl" />
                <button onClick={() => { setCapturedPhoto(null); setPhotoPreview(null) }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <label className="block mb-4">
                <div className="w-full h-48 border-2 border-dashed border-blue-200 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer bg-blue-50 active:bg-blue-100">
                  <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-blue-600">Take selfie / Upload photo</p>
                  <p className="text-xs text-gray-400">Tap to open camera</p>
                </div>
                <input type="file" accept="image/*" capture="user" className="hidden"
                  onChange={e => e.target.files[0] && handlePhotoSelect(e.target.files[0])} />
              </label>
            )}

            <button onClick={handleCheckIn} disabled={!capturedPhoto || loading}
              className="w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-semibold disabled:opacity-40 active:bg-blue-700">
              {loading ? (uploadingPhoto ? 'Uploading photo…' : 'Getting location…') : 'Check In Now'}
            </button>
          </div>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── HOME TAB ── */}
        {tab === 'home' && (
          <div className="px-4 pt-4 pb-6 space-y-4">

            {/* Toast */}
            {msg.text && (
              <div className={`text-sm rounded-xl px-4 py-3 font-medium ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {msg.text}
              </div>
            )}

            {/* Attendance card */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {/* Status banner */}
              <div className={`px-5 pt-5 pb-4 ${checkedIn ? 'bg-gradient-to-br from-green-50 to-emerald-50' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${checkedIn ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                    <p className={`text-sm font-semibold ${checkedIn ? 'text-green-700' : 'text-gray-500'}`}>
                      {checkedIn ? 'On Field' : 'Not checked in'}
                    </p>
                  </div>
                  {checkedIn && checkInTime && (
                    <p className="text-xs text-gray-400">Since {fmtTime(checkInTime)}</p>
                  )}
                </div>
                {checkedIn
                  ? <p className="text-4xl font-mono font-bold text-green-700 tracking-wider text-center py-2">{fmtClock(workedSeconds)}</p>
                  : <p className="text-sm text-gray-400 text-center py-4">Tap below to start your shift</p>
                }
              </div>

              {/* GPS indicator */}
              {checkedIn && (
                <div className="mx-4 my-3 flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2.5">
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  <span className="text-xs text-blue-600 font-medium">GPS tracking active · updates every 30s</span>
                </div>
              )}

              {/* Check-in photo preview */}
              {checkedIn && checkInPhoto && (
                <div className="mx-4 mb-3">
                  <p className="text-xs text-gray-400 mb-1.5">Check-in photo</p>
                  <img src={checkInPhoto} alt="Check-in" className="w-16 h-16 object-cover rounded-xl border border-gray-100" />
                </div>
              )}

              {/* Action button */}
              <div className="px-4 pb-4">
                {!checkedIn
                  ? <button onClick={() => setShowCheckinModal(true)}
                      className="w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-bold active:bg-blue-700">
                      Check In
                    </button>
                  : <button onClick={handleCheckOut} disabled={loading}
                      className="w-full bg-red-500 text-white rounded-2xl py-4 text-base font-bold active:bg-red-600 disabled:opacity-50">
                      {loading ? 'Saving…' : 'Check Out'}
                    </button>
                }
              </div>
            </div>

            {/* Today's stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Pending', value: pendingTasks, color: 'text-yellow-600', bg: 'bg-yellow-50' },
                { label: 'In Progress', value: inProgressTasks, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Done', value: doneTasks, color: 'text-green-600', bg: 'bg-green-50' },
              ].map(({ label, value, color, bg }) => (
                <button key={label} onClick={() => setTab('tasks')}
                  className={`${bg} rounded-2xl py-4 text-center active:opacity-70`}>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </button>
              ))}
            </div>

            {/* In-progress tasks quick view */}
            {inProgressTasks > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">In Progress</p>
                <div className="space-y-2">
                  {tasks.filter(t => t.status === 'in-progress').map(task => (
                    <div key={task.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
                        <p className="text-xs text-gray-400">Started {fmtTime(task.started_at)}</p>
                      </div>
                      <button onClick={() => handleTaskStatus(task, 'done')}
                        className="ml-3 flex-shrink-0 bg-green-50 text-green-600 text-xs font-medium px-3 py-2 rounded-xl active:bg-green-100">
                        Done
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent activity */}
            {activityLogs.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Today's Activity</p>
                  <button onClick={() => setTab('timeline')} className="text-xs text-blue-500 font-medium">See all</button>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                  {activityLogs.slice(-3).reverse().map(log => {
                    const meta = eventMeta[log.event_type]
                    return (
                      <div key={log.id} className="flex items-center gap-3">
                        <span className="text-base w-6 text-center">{meta?.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{meta?.label}</p>
                          {log.details?.task_title && <p className="text-xs text-gray-400 truncate">"{log.details.task_title}"</p>}
                        </div>
                        <p className="text-xs text-gray-400 whitespace-nowrap">{fmtTime(log.created_at)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TASKS TAB ── */}
        {tab === 'tasks' && (
          <div className="px-4 pt-4 pb-6">
            {/* Toast */}
            {msg.text && (
              <div className={`text-sm rounded-xl px-4 py-3 font-medium mb-4 ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {msg.text}
              </div>
            )}

            {/* Filter pills */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {[
                { label: `All (${tasks.length})`, filter: null },
                { label: `Pending (${pendingTasks})`, filter: 'pending' },
                { label: `In Progress (${inProgressTasks})`, filter: 'in-progress' },
                { label: `Done (${doneTasks})`, filter: 'done' },
              ].map(({ label, filter }) => {
                const active = (tab === 'tasks' && !window._taskFilter && filter === null) ||
                  window._taskFilter === filter
                return (
                  <button key={label}
                    onClick={() => { window._taskFilter = filter; document.dispatchEvent(new Event('taskfilter')) }}
                    className={`whitespace-nowrap text-xs px-3 py-2 rounded-full font-medium border transition-colors ${
                      filter === null
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    {label}
                  </button>
                )
              })}
            </div>

            {tasks.length === 0 && (
              <div className="bg-white rounded-2xl py-16 text-center shadow-sm">
                <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm text-gray-400">No tasks assigned yet</p>
              </div>
            )}
            <div className="space-y-3">
              {tasks.map(task => (
                <div key={task.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* Status bar */}
                  <div className={`h-1 w-full ${task.status === 'done' ? 'bg-green-400' : task.status === 'in-progress' ? 'bg-blue-400' : 'bg-yellow-300'}`} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-bold text-gray-900">{task.title}</p>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusStyle[task.status]}`}>
                        {task.status}
                      </span>
                    </div>
                    {task.description && <p className="text-sm text-gray-500 mb-3 leading-relaxed">{task.description}</p>}

                    {/* Timestamps */}
                    {(task.started_at || task.completed_at) && (
                      <div className="flex gap-4 mb-3 text-xs text-gray-400">
                        {task.started_at && <span>▶ {fmtTime(task.started_at)}</span>}
                        {task.completed_at && <span>✓ {fmtTime(task.completed_at)}</span>}
                      </div>
                    )}

                    {/* Action buttons */}
                    {task.status !== 'done' && (
                      <div className="flex gap-2 mb-3">
                        {task.status === 'pending' && (
                          <button onClick={() => handleTaskStatus(task, 'in-progress')}
                            className="flex-1 bg-blue-50 text-blue-600 text-sm font-semibold py-2.5 rounded-xl active:bg-blue-100">
                            Start Task
                          </button>
                        )}
                        <button onClick={() => handleTaskStatus(task, 'done')}
                          className="flex-1 bg-green-50 text-green-600 text-sm font-semibold py-2.5 rounded-xl active:bg-green-100">
                          Mark Done
                        </button>
                      </div>
                    )}

                    {/* Proof photo */}
                    {task.photo_url
                      ? <img src={task.photo_url} alt="proof" className="w-full h-44 object-cover rounded-xl" />
                      : (
                        <label className="flex items-center justify-center gap-2 text-sm text-blue-500 font-medium cursor-pointer border-2 border-dashed border-blue-200 rounded-xl py-3 active:bg-blue-50">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Upload proof photo
                          <input type="file" accept="image/*" capture="environment" className="hidden"
                            onChange={e => e.target.files[0] && handleTaskPhoto(task, e.target.files[0])} />
                        </label>
                      )
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TIMELINE TAB ── */}
        {tab === 'timeline' && (
          <div className="px-4 pt-4 pb-6">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">
              Today — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>

            {/* Hours worked summary */}
            {checkedIn && (
              <div className="bg-blue-600 rounded-2xl p-4 mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-200">Time on field today</p>
                  <p className="text-2xl font-mono font-bold text-white mt-1">{fmtClock(workedSeconds)}</p>
                </div>
                <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            )}

            {activityLogs.length === 0 && (
              <div className="bg-white rounded-2xl py-16 text-center shadow-sm">
                <p className="text-sm text-gray-400">No activity yet today</p>
                <p className="text-xs text-gray-300 mt-1">Check in to start tracking</p>
              </div>
            )}

            {activityLogs.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="relative pl-10">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100" />
                  <div className="space-y-5">
                    {activityLogs.map(log => {
                      const meta = eventMeta[log.event_type]
                      return (
                        <div key={log.id} className="relative">
                          <div className="absolute -left-10 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-base border border-gray-100">
                            {meta?.icon}
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{meta?.label}</p>
                              {log.details?.task_title && <p className="text-xs text-gray-500 mt-0.5">"{log.details.task_title}"</p>}
                              {log.event_type === 'check_out' && log.details?.worked_seconds && (
                                <p className="text-xs text-blue-600 font-medium mt-0.5">
                                  Total: {fmtClock(log.details.worked_seconds)}
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
            )}
          </div>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <div className="bg-white border-t flex-shrink-0 z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {navItems.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 active:opacity-60 ${tab === id ? 'text-blue-600' : 'text-gray-400'}`}>
              <Icon active={tab === id} />
              <span className={`text-xs font-medium ${tab === id ? 'text-blue-600' : 'text-gray-400'}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
