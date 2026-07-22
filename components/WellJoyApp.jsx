'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const formatRp = n => `Rp ${Number(n).toLocaleString('id-ID')}`
const BNAME = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

// ── Kirim/update 1 baris ke Google Sheets (Absensi atau Izin) ──
// Dipakai di event clock-in, clock-out, ajukan izin, approve/tolak izin.
// `sheet`: 'absensi' | 'izin'
// `key`: kolom untuk mencocokkan baris lama (mis. {NIP, Tanggal} atau {ID})
// `row`: nilai lengkap baris (key harus pakai nama kolom yang sama persis dengan header sheet)
const logToSheet = async (sheet, key, row) => {
  try {
    const res = await fetch('/api/log-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet, key, row }),
    })
    const j = await res.json()
    console.log(`[log-sheet:${sheet}] hasil:`, j)
    return j
  } catch (e) {
    console.warn(`[log-sheet:${sheet}] gagal (diabaikan):`, e.message)
    return null
  }
}

const STATUS_COLOR = {
  HADIR:        { bg:'#E8F5E9', text:'#2E7D32', label:'Hadir' },
  TERLAMBAT:    { bg:'#FFF8E1', text:'#F57F17', label:'Terlambat' },
  WFH:          { bg:'#E3F2FD', text:'#1565C0', label:'WFH' },
  IZIN_SAKIT:   { bg:'#E0F7FA', text:'#006064', label:'Izin Sakit' },
  IZIN_LAINNYA: { bg:'#F3E5F5', text:'#6A1B9A', label:'Izin Lainnya' },
  ALPHA:        { bg:'#FFEBEE', text:'#C62828', label:'Alpha' },
  VALID:        { bg:'#E8F5E9', text:'#2E7D32', label:'Valid' },
  MENUNGGU:     { bg:'#FFF8E1', text:'#F57F17', label:'Menunggu' },
  DITOLAK:      { bg:'#FFEBEE', text:'#C62828', label:'Ditolak' },
  DISETUJUI:    { bg:'#E8F5E9', text:'#2E7D32', label:'Disetujui' },
  aktif:        { bg:'#E8F5E9', text:'#2E7D32', label:'Aktif' },
  izin:         { bg:'#E3F2FD', text:'#1565C0', label:'Izin' },
  resign:       { bg:'#F5F5F5', text:'#616161', label:'Resign' },
}

const calcPayroll = (emp, records) => {
  const valid = records.filter(a => a.status_validasi === 'VALID')
  const hadir      = valid.filter(a => ['HADIR','WFH'].includes(a.status_kehadiran)).length
  const terlambat  = valid.filter(a => a.status_kehadiran === 'TERLAMBAT').length
  const alpha      = valid.filter(a => a.status_kehadiran === 'ALPHA').length
  const totalMenit   = valid.reduce((s,a) => s + (a.menit_terlambat||0), 0)
  const totalLembur  = valid.reduce((s,a) => s + (Number(a.jam_lembur)||0), 0)
  const potTerlambat = totalMenit * (emp.potongan_terlambat_per_menit||5000)
  const potAlpha     = alpha * ((emp.gaji_pokok||0) / 22)
  const bonusLembur  = totalLembur * (emp.lembur_per_jam||45000)
  const totalPenghasilan = (emp.gaji_pokok||0)+(emp.tunjangan_jabatan||0)+(emp.tunjangan_transport||0)+(emp.tunjangan_makan||0)+bonusLembur
  const totalPotongan    = (emp.bpjs_kesehatan||0)+(emp.bpjs_ketenagakerjaan||0)+(emp.pph21||0)+potTerlambat+potAlpha
  return { hadir,terlambat,alpha,totalMenit,totalLembur,
    potTerlambat:Math.round(potTerlambat), potAlpha:Math.round(potAlpha),
    bonusLembur:Math.round(bonusLembur), totalPenghasilan:Math.round(totalPenghasilan),
    totalPotongan:Math.round(totalPotongan), takeHomePay:Math.round(totalPenghasilan-totalPotongan) }
}

const WellJoyLogo = ({ size=90 }) => {
  const [imgErr, setImgErr] = useState(false)
  if (!imgErr) return (
    <img src="/logo/welljoy-logo.png" alt="WellJoy" width={size} height={size}
      style={{ objectFit:'contain', width:size, height:size }}
      onError={()=>setImgErr(true)}/>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 30 Q25 20 40 18 L175 15 Q185 15 188 25 L185 90 Q183 100 175 102 L40 105 Q25 107 18 95 Z" fill="url(#yG)"/>
      <path d="M15 95 Q20 88 35 88 L175 85 Q188 85 190 95 Q185 125 160 130 Q120 140 100 138 Q80 140 40 130 Q15 122 10 110 Q8 102 15 95 Z" fill="url(#rG)"/>
      <text x="52" y="72" fontFamily="Georgia,serif" fontSize="36" fontWeight="900" fill="#C0392B" letterSpacing="-2">wj</text>
      <text x="100" y="120" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="20" fontWeight="800" fill="white">Powder Drink</text>
      <defs>
        <linearGradient id="yG" x1="0" y1="0" x2="200" y2="0"><stop offset="0%" stopColor="#F5C518"/><stop offset="100%" stopColor="#E8A500"/></linearGradient>
        <linearGradient id="rG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E53935"/><stop offset="100%" stopColor="#B71C1C"/></linearGradient>
      </defs>
    </svg>
  )
}

const Toast = ({ msg }) => msg
  ? <div style={{ position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:'#1a1a1a',color:'white',fontSize:13,padding:'10px 20px',borderRadius:99,boxShadow:'0 4px 20px rgba(0,0,0,0.25)',zIndex:9999,whiteSpace:'nowrap' }}>{msg}</div>
  : null

const Chip = ({ status }) => {
  const c = STATUS_COLOR[status] || STATUS_COLOR.MENUNGGU
  return <span style={{ background:c.bg, color:c.text, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99 }}>{c.label}</span>
}

const BtnGrad = ({ children, onClick, disabled=false, small=false, outline=false, color='red' }) => {
  const bg = color==='green' ? 'linear-gradient(135deg,#43A047,#66BB6A)' : 'linear-gradient(135deg,#E53935,#F5A623)'
  const borderC = color==='green'?'#43A047':'#E53935'
  if (outline) return (
    <button onClick={onClick} disabled={disabled} style={{ border:`2px solid ${borderC}`,color:borderC,background:'transparent',padding:small?'8px 16px':'14px 20px',borderRadius:14,fontWeight:700,fontSize:13,width:small?'auto':'100%',opacity:disabled?0.4:1,cursor:'pointer' }}>{children}</button>
  )
  return (
    <button onClick={onClick} disabled={disabled} style={{ background:disabled?'#ccc':bg,color:'white',padding:small?'8px 16px':'14px 20px',borderRadius:14,fontWeight:700,fontSize:13,border:'none',width:small?'auto':'100%',cursor:'pointer',boxShadow:disabled?'none':'0 4px 15px rgba(229,57,53,0.25)' }}>{children}</button>
  )
}

const Modal = ({ title, onClose, children, wide=false }) => (
  <div
    style={{ position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center',background:'rgba(0,0,0,0.55)' }}
    onClick={e=>{ if(e.target===e.currentTarget) onClose() }}
  >
    <div style={{ width:'100%',maxWidth:wide?640:460,background:'white',borderRadius:'24px 24px 0 0',padding:20,overflowY:'auto',maxHeight:'92vh' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
        <h2 style={{ fontWeight:800,fontSize:16,margin:0 }}>{title}</h2>
        <button onClick={onClose} style={{ width:32,height:32,borderRadius:'50%',background:'#f0f0f0',border:'none',cursor:'pointer',fontSize:18,fontWeight:700,color:'#666' }}>×</button>
      </div>
      {children}
    </div>
  </div>
)

const Card = ({ children, style={}, onClick }) => (
  <div onClick={onClick} style={{ background:'white',borderRadius:16,boxShadow:'0 4px 16px rgba(0,0,0,0.06)',cursor:onClick?'pointer':'default',...style }}>{children}</div>
)

// ─── AVATAR — foto profil kalau ada, fallback gradient inisial ───────────────
const Avatar = ({ fotoProfil, nama, size=40, fontSize=16, border='none' }) => {
  const [err, setErr] = useState(false)
  return (fotoProfil && !err)
    ? <img src={fotoProfil} alt={nama||''}
        style={{ width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0,border }}
        onError={()=>setErr(true)}/>
    : <div style={{ width:size,height:size,borderRadius:'50%',background:'linear-gradient(135deg,#E53935,#F5A623)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize,flexShrink:0,border }}>{(nama||'?')[0]}</div>
}

// ─── CHANGE PASSWORD MODAL ──────────────────────────────────────────────────
const inputStyle = { width:'100%',border:'1px solid #e0e0e0',borderRadius:12,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }

const ChangePasswordModal = ({ user, onClose, showToast }) => {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!oldPw || !newPw || !confirmPw) { showToast('⚠️ Semua kolom wajib diisi'); return }
    if (newPw.length < 6) { showToast('⚠️ Password baru minimal 6 karakter'); return }
    if (newPw !== confirmPw) { showToast('⚠️ Konfirmasi password tidak cocok'); return }
    setLoading(true)
    try {
      // verifikasi password lama langsung ke DB (bukan dari cache/session)
      const { data: check } = await supabase.from('users').select('nip').eq('nip', user.nip).eq('password', oldPw).maybeSingle()
      if (!check) { showToast('❌ Password lama salah'); setLoading(false); return }
      const { error } = await supabase.from('users').update({ password: newPw }).eq('nip', user.nip)
      if (error) { showToast('❌ Gagal mengubah password'); setLoading(false); return }
      await supabase.from('audit_log').insert({ user_name: user.nama, nip: user.nip, aktivitas: 'Ubah password', keterangan: '' })
      showToast('✅ Password berhasil diubah')
      onClose()
    } catch (e) {
      console.error(e)
      showToast('❌ Terjadi kesalahan')
    }
    setLoading(false)
  }

  return (
    <Modal title="Ubah Password" onClose={onClose}>
      <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
        <div>
          <p style={{ fontSize:12,fontWeight:700,margin:'0 0 6px' }}>Password Lama</p>
          <input type="password" value={oldPw} onChange={e=>setOldPw(e.target.value)} placeholder="Masukkan password lama" style={inputStyle}/>
        </div>
        <div>
          <p style={{ fontSize:12,fontWeight:700,margin:'0 0 6px' }}>Password Baru</p>
          <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Minimal 6 karakter" style={inputStyle}/>
        </div>
        <div>
          <p style={{ fontSize:12,fontWeight:700,margin:'0 0 6px' }}>Konfirmasi Password Baru</p>
          <input type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Ulangi password baru" style={inputStyle}/>
        </div>
        <BtnGrad onClick={submit} disabled={loading}>{loading?'Menyimpan...':'Simpan Password Baru'}</BtnGrad>
      </div>
    </Modal>
  )
}

const NotifBell = ({ nip, onOpen, notifications=[] }) => {
  const count = notifications.filter(n => n.nip===nip && !n.is_read).length
  return (
    <button onClick={onOpen} style={{ position:'relative',background:'none',border:'none',cursor:'pointer',padding:4 }}>
      <span style={{ fontSize:22 }}>🔔</span>
      {count>0 && <span style={{ position:'absolute',top:-2,right:-2,width:18,height:18,background:'#E53935',borderRadius:'50%',border:'2px solid white',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:10,fontWeight:700 }}>{count}</span>}
    </button>
  )
}

const NotifPanel = ({ nip, onClose, notifications=[], onMarkRead, onMarkAllRead, onOpenAnnouncement }) => {
  const notifs = notifications.filter(n => n.nip===nip)
  return (
    <div style={{ position:'fixed',inset:0,zIndex:50,background:'rgba(0,0,0,0.3)' }} onClick={onClose}>
      <div style={{ position:'absolute',right:16,top:64,width:300,background:'white',borderRadius:16,boxShadow:'0 8px 30px rgba(0,0,0,0.15)',overflow:'hidden' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid #f0f0f0' }}>
          <span style={{ fontWeight:700 }}>Notifikasi</span>
          <button onClick={()=>{ onMarkAllRead&&onMarkAllRead(); onClose(); }} style={{ background:'none',border:'none',color:'#E53935',fontWeight:700,fontSize:12,cursor:'pointer' }}>Baca semua</button>
        </div>
        {notifs.length===0 ? <p style={{ textAlign:'center',color:'#aaa',padding:24,fontSize:13 }}>Kosong</p>
        : notifs.map(n=>(
          <div key={n.id}
            onClick={()=>{ onMarkRead&&onMarkRead(n.id); if(n.type==='PENGUMUMAN'&&onOpenAnnouncement){onOpenAnnouncement();onClose();} }}
            style={{ display:'flex',alignItems:'flex-start',gap:12,padding:'12px 16px',borderBottom:'1px solid #f9f9f9',background:n.is_read?'white':'#FFF5F5',cursor:n.type==='PENGUMUMAN'?'pointer':'default' }}>
            <span style={{ fontSize:20 }}>{n.type==='IZIN'||n.type==='APPROVAL'?'📅':n.type==='GAJI'?'💰':n.type==='PENGUMUMAN'?'📢':'🕒'}</span>
            <div style={{ flex:1 }}><p style={{ fontSize:13,margin:'0 0 2px',color:'#333' }}>{n.message}</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>{new Date(n.created_at).toLocaleString('id-ID')}</p></div>
            {!n.is_read && <span style={{ width:8,height:8,borderRadius:'50%',background:'#E53935',flexShrink:0,marginTop:4 }}/>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── COMPRESS IMAGE (resize langsung di canvas, tanpa Image element) ──────────
const compressCanvas = (srcCanvas, maxWidth = 800, quality = 0.65) => {
  const w = srcCanvas.width
  const h = srcCanvas.height
  const ratio = Math.min(1, maxWidth / w)
  const newW = Math.round(w * ratio)
  const newH = Math.round(h * ratio)
  const dst = document.createElement('canvas')
  dst.width = newW
  dst.height = newH
  dst.getContext('2d').drawImage(srcCanvas, 0, 0, newW, newH)
  return dst.toDataURL('image/jpeg', quality)
}

// ─── GET LOCATION ─────────────────────────────────────────────────────────────
const getLocation = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('Geolocation tidak didukung browser ini'))
    return
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords
      const coords = `${lat.toFixed(6)},${lng.toFixed(6)}`
      let label = coords
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'Accept-Language': 'id' } }
        )
        const data = await res.json()
        const addr = data.address || {}
        const parts = [
          addr.road || addr.pedestrian || addr.footway || addr.neighbourhood,
          addr.suburb || addr.village || addr.town || addr.city,
        ].filter(Boolean)
        if (parts.length > 0) label = parts.join(', ')
      } catch { /* fallback coords */ }
      resolve({ coords, label })
    },
    (err) => {
      if (err.code === 1) reject(new Error('DENIED'))
      else reject(new Error('Gagal mendapatkan lokasi. Coba lagi.'))
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  )
})

// ─── CAMERA MODAL ─────────────────────────────────────────────────────────────
const CameraModal = ({ mode, onCapture, onClose }) => {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const locationRef = useRef(null)
  const [phase, setPhase]           = useState('loc')   // loc | cam | ready | captured | err_loc | err_cam
  const [locDisplay, setLocDisplay] = useState(null)
  const [captured, setCaptured]     = useState(null)
  const [compressing, setCompressing] = useState(false)
  const [errMsg, setErrMsg]         = useState('')

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // ── Step 1: lokasi dulu ──
  useEffect(() => {
    getLocation()
      .then(loc => {
        locationRef.current = loc
        setLocDisplay(loc)
        setPhase('cam')
      })
      .catch(err => {
        setErrMsg(err.message === 'DENIED' ? 'DENIED' : err.message)
        setPhase('err_loc')
      })
    return () => stopStream()
  }, [])

  // ── Step 2: buka kamera setelah lokasi dapat ──
  useEffect(() => {
    if (phase !== 'cam') return
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    })
    .then(stream => {
      streamRef.current = stream
      const vid = videoRef.current
      if (!vid) return
      vid.srcObject = stream
      // Tunggu video benar-benar playing DAN punya dimensi
      vid.onloadedmetadata = () => {
        vid.play().then(() => {
          // Tunggu frame pertama benar-benar ter-render
          vid.requestVideoFrameCallback
            ? vid.requestVideoFrameCallback(() => setPhase('ready'))
            : setTimeout(() => setPhase('ready'), 500)
        }).catch(() => setPhase('ready'))
      }
    })
    .catch(() => {
      setErrMsg('Izin kamera ditolak. Aktifkan di pengaturan browser lalu muat ulang.')
      setPhase('err_cam')
    })
  }, [phase === 'cam'])  // eslint-disable-line

  const capture = () => {
    const vid = videoRef.current
    const cvs = canvasRef.current
    if (!vid || !cvs) { console.error('[capture] ref null'); return }

    const w = vid.videoWidth
    const h = vid.videoHeight
    console.log('[capture] readyState:', vid.readyState, 'size:', w, 'x', h)

    if (!w || !h || vid.readyState < 2) {
      console.warn('[capture] video belum siap, retry...')
      setTimeout(() => capture(), 400)
      return
    }

    // Draw dulu SEBELUM stop stream — flip horizontal agar foto tidak mirror
    cvs.width = w
    cvs.height = h
    const ctx = cvs.getContext('2d')
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(vid, 0, 0, w, h)
    ctx.setTransform(1, 0, 0, 1, 0, 0) // reset transform

    // Stop stream SETELAH draw
    stopStream()

    setCompressing(true)
    try {
      const result = cvs.toDataURL('image/jpeg', 0.8)
      const sizeKB = Math.round(result.length * 3/4 / 1024)
      console.log('[capture] sukses, size:', sizeKB, 'KB, dims:', w, 'x', h)
      setCaptured(result)
      setPhase('captured')
    } catch(e) {
      console.error('[capture] error:', e)
    } finally {
      setCompressing(false)
    }
  }

  const handleConfirm = () => { onCapture(captured, locationRef.current); onClose() }
  const handleClose   = () => { stopStream(); onClose() }

  const handleUlang = () => {
    stopStream()
    setCaptured(null)
    locationRef.current = null
    setLocDisplay(null)
    setPhase('loc')
    getLocation()
      .then(loc => { locationRef.current = loc; setLocDisplay(loc); setPhase('cam') })
      .catch(err => { setErrMsg(err.message === 'DENIED' ? 'DENIED' : err.message); setPhase('err_loc') })
  }

  const fileSizeKB = captured ? Math.round((captured.length * 3/4) / 1024) : 0
  const isVideoPhase = phase === 'ready' || phase === 'cam' || phase === 'captured'

  return (
    <div style={{ position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'flex-end',background:'rgba(0,0,0,0.75)' }}>
      <div style={{ width:'100%',background:'white',borderRadius:'24px 24px 0 0',padding:20,maxHeight:'92vh',overflowY:'auto' }}>

        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
          <h2 style={{ fontWeight:700,margin:0,fontSize:16 }}>📷 Selfie {mode==='in'?'Clock In':'Clock Out'}</h2>
          <button onClick={handleClose} style={{ background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#aaa',lineHeight:1 }}>×</button>
        </div>

        {/* ── Video SELALU ada di DOM ── hanya visibility yang berubah */}
        <div style={{ display: isVideoPhase ? 'block' : 'none' }}>
          {locDisplay && (
            <div style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#E8F5E9',borderRadius:10,marginBottom:10,border:'1px solid #A5D6A7' }}>
              <span style={{ fontSize:15 }}>📍</span>
              <div style={{ flex:1,minWidth:0 }}>
                <p style={{ fontSize:12,color:'#2E7D32',fontWeight:700,margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{locDisplay.label}</p>
                <p style={{ fontSize:10,color:'#81C784',margin:0,fontFamily:'monospace' }}>{locDisplay.coords}</p>
              </div>
              <span style={{ fontSize:12,color:'#43A047',fontWeight:700,flexShrink:0 }}>✓</span>
            </div>
          )}

          <div style={{ borderRadius:16,overflow:'hidden',background:'#000',marginBottom:12,position:'relative',height:260 }}>
            {/* Video live — mirror hanya untuk preview, BUKAN untuk canvas */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width:'100%',height:'100%',objectFit:'cover',display: phase==='captured' ? 'none' : 'block', transform:'scaleX(-1)' }}
            />
            {/* Canvas OFF-SCREEN tapi tetap di DOM, bukan display:none agar drawImage bekerja */}
            <canvas ref={canvasRef} style={{ position:'absolute',left:'-9999px',top:0,visibility:'hidden' }}/>
            {/* Preview foto setelah capture */}
            {captured && phase==='captured' && (
              <img src={captured} alt="preview" style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover' }}/>
            )}
            {/* Loading kamera */}
            {phase==='cam' && (
              <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',color:'white',gap:10 }}>
                <div style={{ width:36,height:36,borderRadius:'50%',border:'3px solid #555',borderTop:'3px solid #F5A623',animation:'spin 0.8s linear infinite' }}/>
                <span style={{ fontSize:13 }}>Membuka kamera...</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}
            {/* Compressing overlay */}
            {compressing && (
              <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',color:'white',gap:8 }}>
                <div style={{ width:36,height:36,borderRadius:'50%',border:'3px solid #555',borderTop:'3px solid #43A047',animation:'spin 0.8s linear infinite' }}/>
                <span style={{ fontSize:13 }}>Memproses foto...</span>
              </div>
            )}
            {/* Info ukuran file */}
            {phase==='captured' && captured && !compressing && (
              <div style={{ position:'absolute',bottom:8,left:8,right:8,background:'rgba(0,0,0,0.6)',borderRadius:8,padding:'5px 10px',display:'flex',alignItems:'center',gap:8 }}>
                <span style={{ fontSize:11,color:'#69F0AE',fontWeight:700 }}>✓ OK</span>
                <span style={{ fontSize:11,color:'#aaa' }}>·</span>
                <span style={{ fontSize:11,color:'white' }}>{fileSizeKB} KB</span>
              </div>
            )}
          </div>

          {phase==='ready' && !compressing && (
            <BtnGrad onClick={capture}>📸 Ambil Foto</BtnGrad>
          )}
          {phase==='captured' && !compressing && (
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              <BtnGrad color="green" onClick={handleConfirm}>✅ Konfirmasi {mode==='in'?'Clock In':'Clock Out'}</BtnGrad>
              <button onClick={handleUlang} style={{ padding:12,background:'none',border:'none',color:'#888',fontSize:13,cursor:'pointer',fontWeight:600 }}>🔄 Ulangi Foto</button>
            </div>
          )}
        </div>

        {/* ── Loading Lokasi ── */}
        {phase==='loc' && (
          <div style={{ textAlign:'center',padding:'32px 8px' }}>
            <div style={{ fontSize:48,marginBottom:16 }}>📍</div>
            <p style={{ fontWeight:700,fontSize:15,margin:'0 0 8px' }}>Mengambil Lokasi...</p>
            <p style={{ fontSize:12,color:'#aaa',marginBottom:20 }}>Izinkan akses lokasi saat browser meminta</p>
            <div style={{ width:40,height:40,borderRadius:'50%',border:'4px solid #f0f0f0',borderTop:'4px solid #E53935',animation:'spin 0.8s linear infinite',margin:'0 auto' }}/>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* ── Error Lokasi Ditolak ── */}
        {phase==='err_loc' && errMsg==='DENIED' && (
          <div style={{ textAlign:'center',padding:'16px 8px' }}>
            <div style={{ fontSize:48,marginBottom:10 }}>📍</div>
            <h3 style={{ fontWeight:800,fontSize:15,margin:'0 0 8px',color:'#C62828' }}>Izin Lokasi Diperlukan</h3>
            <p style={{ fontSize:13,color:'#555',marginBottom:12,lineHeight:1.6 }}>Absensi <strong>wajib</strong> menyertakan lokasi.</p>
            <div style={{ background:'#FFF8E1',borderRadius:12,padding:12,marginBottom:16,textAlign:'left' }}>
              <p style={{ fontSize:12,fontWeight:700,color:'#F57F17',margin:'0 0 6px' }}>Cara mengaktifkan:</p>
              <p style={{ fontSize:12,color:'#666',margin:'2px 0' }}>Chrome: klik 🔒 di address bar → Lokasi → Izinkan</p>
              <p style={{ fontSize:12,color:'#666',margin:'2px 0' }}>Safari: Pengaturan → Privasi → Layanan Lokasi</p>
            </div>
            <BtnGrad onClick={()=>window.location.reload()}>🔄 Muat Ulang Halaman</BtnGrad>
            <button onClick={handleClose} style={{ display:'block',margin:'10px auto 0',color:'#aaa',fontSize:13,background:'none',border:'none',cursor:'pointer' }}>Tutup</button>
          </div>
        )}

        {/* ── Error Kamera / Lainnya ── */}
        {(phase==='err_cam' || (phase==='err_loc' && errMsg!=='DENIED')) && (
          <div style={{ textAlign:'center',padding:'24px 8px' }}>
            <div style={{ fontSize:48,marginBottom:10 }}>⚠️</div>
            <p style={{ color:'#E53935',fontWeight:700,marginBottom:16 }}>{errMsg}</p>
            <BtnGrad onClick={handleUlang}>Coba Lagi</BtnGrad>
            <button onClick={handleClose} style={{ display:'block',margin:'10px auto 0',color:'#aaa',fontSize:13,background:'none',border:'none',cursor:'pointer' }}>Tutup</button>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── EMPLOYEE HOME ─────────────────────────────────────────────────────────────
const EmpHome = ({ user, showToast, onLogout, dbData, refreshData }) => {
  const [now, setNow] = useState(new Date())
  const [showNotif, setShowNotif] = useState(false)
  const [showAnn, setShowAnn] = useState(false)
  const [showHandbook, setShowHandbook] = useState(false)
  const [selectedAnn, setSelectedAnn] = useState(null)
  const [camera, setCamera] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)

  useEffect(()=>{ const t=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(t); },[])

  // Paksa timezone Asia/Jakarta (WIB) — cara paling reliable
  const toWIB = (date) => new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  const wibNow  = toWIB(now)
  const jam     = `${String(wibNow.getHours()).padStart(2,'0')}:${String(wibNow.getMinutes()).padStart(2,'0')}:${String(wibNow.getSeconds()).padStart(2,'0')}`
  const today   = `${wibNow.getFullYear()}-${String(wibNow.getMonth()+1).padStart(2,'0')}-${String(wibNow.getDate()).padStart(2,'0')}`
  const todayAtt = dbData.attendance.find(a=>a.nip===user.nip&&a.tanggal===today)
  const clockedIn = !!todayAtt?.jam_masuk
  const clockedOut = !!todayAtt?.jam_keluar
  const myAtt = dbData.attendance.filter(a=>a.nip===user.nip).slice(0,3)
  const emp = dbData.karyawan.find(k=>k.nip===user.nip)||user

  // ── Cek izin aktif hari ini ──
  const todayIzin = dbData.izin?.find(iz =>
    iz.nip === user.nip &&
    iz.status === 'DISETUJUI' &&
    iz.tanggal_mulai <= today &&
    iz.tanggal_selesai >= today
  )
  const hasIzinTerlambat   = todayIzin?.jenis_izin === 'Izin Terlambat'
  const hasIzinSetengahHari = todayIzin?.jenis_izin === 'Izin Setengah Hari'
  const hasIzinLembur      = todayIzin?.jenis_izin === 'Izin Lembur'

  // Jam wajib hari ini
  const hariIdxNow = wibNow.getDay()
  const namaHariNow = ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'][hariIdxNow]
  const jamWajibMasukHari = emp[`jam_masuk_${namaHariNow}`] || emp.jam_masuk_wajib || '08:00'
  const jamWajibKeluarHari = emp[`jam_keluar_${namaHariNow}`] || emp.jam_keluar_wajib || '16:40'
  const [wkH, wkM] = jamWajibKeluarHari.split(':').map(Number)
  const nowMenit = wibNow.getHours()*60 + wibNow.getMinutes()
  const keluarMenit = wkH*60 + wkM

  // Clock Out:
  // - Sebelum jam keluar wajib (16:40) → selalu bisa (pulang cepat)
  // - Setelah jam keluar wajib → HANYA bisa kalau punya Izin Lembur yang sudah di-approve
  const clockOutTerbuka = clockedIn && !clockedOut && (nowMenit <= keluarMenit || hasIzinLembur)

  // ── Helper waktu WIB untuk handleClockIn/Out ──
  const getWIBString = (d = new Date()) => {
    const w = toWIB(d)
    const hh = String(w.getHours()).padStart(2,'0')
    const mm = String(w.getMinutes()).padStart(2,'0')
    const tgl = `${w.getFullYear()}-${String(w.getMonth()+1).padStart(2,'0')}-${String(w.getDate()).padStart(2,'0')}`
    return { jam:`${hh}:${mm}`, tanggal:tgl }
  }

  // ── Upload foto ke Supabase Storage (via REST API langsung, bypass SDK) ──
  const uploadFoto = async (base64, path) => {
    try {
      if (!base64?.startsWith('data:image')) { console.warn('[upload] base64 invalid'); return null }
      const b64data = base64.split(',')[1]
      if (!b64data || b64data.length < 200) { console.warn('[upload] base64 kosong'); return null }

      // base64 → binary Uint8Array
      const bin = atob(b64data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

      console.log('[upload] mulai upload', path, Math.round(bytes.length/1024), 'KB')

      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
      const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/foto-absensi/${path}`

      const uploadPromise = fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: bytes, // kirim binary murni, BUKAN FormData/File
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Upload timeout 8s')), 8000)
      )

      const res = await Promise.race([uploadPromise, timeoutPromise])

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error('[upload] gagal, status:', res.status, errText)
        return null
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/foto-absensi/${path}`
      console.log('[upload] berhasil:', publicUrl)
      return publicUrl
    } catch(e) {
      console.error('[upload] exception/timeout:', e.message)
      return null
    }
  }

  // ── Backup ke Google Drive (non-blocking, via API Route) ──
  // Dipanggil "fire and forget" — kalau Drive gagal/lambat, tidak mengganggu proses utama
  const uploadToDrive = (base64, kategori, fileName, extraInfo = {}) => {
    try {
      if (!base64?.startsWith('data:')) return Promise.resolve(null)
      // Convert base64 → Blob untuk dikirim sebagai FormData
      const [meta, data] = base64.split(',')
      const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg'
      const bin = atob(data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: mime })

      const fd = new FormData()
      fd.append('file', blob, fileName)
      fd.append('tanggal', extraInfo.tanggal || todayWIBGlobal())
      fd.append('nip', extraInfo.nip || '')
      fd.append('nama', extraInfo.nama || '')
      fd.append('kategori', kategori) // 'absensi' | 'izin'
      fd.append('fileName', fileName)

      return fetch('/api/upload-drive', { method:'POST', body: fd })
        .then(r => r.json())
        .then(j => { console.log('[drive] backup hasil:', j); return j?.webViewLink || null })
        .catch(e => { console.warn('[drive] backup gagal (diabaikan):', e.message); return null })
    } catch(e) {
      console.warn('[drive] backup exception (diabaikan):', e.message)
      return Promise.resolve(null)
    }
  }

  // helper kecil untuk tanggal WIB tanpa perlu komponen state
  const todayWIBGlobal = () => {
    const w = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    return `${w.getFullYear()}-${String(w.getMonth()+1).padStart(2,'0')}-${String(w.getDate()).padStart(2,'0')}`
  }

  const handleClockIn = async (foto, loc) => {
    console.log('[clockIn] mulai, foto length:', foto?.length)
    setLoading(true)
    showToast('⏳ Menyimpan absensi...')
    const { jam: jamStr, tanggal: tanggalWIB } = getWIBString()

    // Tentukan nama hari (senin/selasa/.../sabtu/minggu) dari tanggal WIB
    const hariIdx = toWIB(new Date(`${tanggalWIB}T00:00:00`)).getDay() // 0=minggu,1=senin,...6=sabtu
    const namaHari = ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'][hariIdx]

    // Ambil jam wajib sesuai hari ini, fallback ke default 08:00
    const jamWajib = emp[`jam_masuk_${namaHari}`] || emp.jam_masuk_wajib || '08:00'
    const [wajibH, wajibM] = jamWajib.split(':').map(Number)
    const [nowH, nowM] = jamStr.split(':').map(Number)
    const nowTotalMenit = nowH*60+nowM

    // ── Cek izin aktif hari ini (disetujui) ──
    const todayIzinAktif = dbData.izin?.find(iz =>
      iz.nip === user.nip && iz.status === 'DISETUJUI' &&
      iz.tanggal_mulai <= tanggalWIB && iz.tanggal_selesai >= tanggalWIB
    )

    let menit = 0
    let status = 'HADIR'

    if (todayIzinAktif?.jenis_izin === 'Izin Terlambat') {
      // Izin Terlambat disetujui → tidak ada telat, status tetap HADIR
      menit = 0; status = 'HADIR'
    } else if (todayIzinAktif?.jenis_izin === 'Izin Setengah Hari') {
      // Izin Setengah Hari → batas masuk jam 12:45, lewat itu baru hitung telat
      const batasSetengahH = 12, batasSetengahM = 45
      menit = Math.max(0, nowTotalMenit - (batasSetengahH*60+batasSetengahM))
      status = menit > 0 ? 'TERLAMBAT' : 'HADIR'
    } else {
      // Normal: hitung telat dari jam wajib masuk
      menit  = Math.max(0, nowTotalMenit - (wajibH*60+wajibM))
      status = menit > 0 ? 'TERLAMBAT' : 'HADIR'
    }
    const lokasiLabel  = loc?.label  || 'Tidak diketahui'
    const lokasiCoords = loc?.coords || null

    const path = `${tanggalWIB}/${user.nip}_masuk_${jamStr.replace(':','')}.jpg`
    console.log('[clockIn] uploading...')
    const fotoUrl = await uploadFoto(foto, path)
    console.log('[clockIn] upload selesai, fotoUrl:', fotoUrl ? 'OK (storage)' : 'fallback base64')

    // Backup ke Google Drive — ditunggu hasilnya supaya link bisa dicatat ke Sheets
    const driveLinkMasuk = await uploadToDrive(foto, 'absensi', `masuk_${jamStr.replace(':','')}.jpg`, { tanggal: tanggalWIB, nip: user.nip, nama: user.nama })

    console.log('[clockIn] insert ke database...')
    const { error } = await supabase.from('attendance').insert({
      nip:user.nip, nama:user.nama, tanggal:tanggalWIB, jam_masuk:jamStr,
      status_kehadiran:status, menit_terlambat:menit,
      lokasi_masuk:lokasiLabel, koordinat_masuk:lokasiCoords,
      foto_masuk: fotoUrl || foto,
      foto_masuk_drive_link: driveLinkMasuk || null,
      status_validasi:'MENUNGGU'
    })
    console.log('[clockIn] insert hasil, error:', error)
    if (!error) {
      await supabase.from('audit_log').insert({ user_name:user.nama, nip:user.nip, aktivitas:'Clock In', keterangan:`${jamStr} WIB · ${lokasiLabel}${menit>0?` · Telat ${menit} menit`:''}` })
      // Catat ke Google Sheets (baris baru, jam keluar masih kosong — akan di-update saat clock out)
      logToSheet('absensi', { NIP:user.nip, Tanggal:tanggalWIB }, {
        NIP:user.nip, Nama:user.nama, Tanggal:tanggalWIB, 'Jam Masuk':jamStr, 'Jam Keluar':'',
        'Telat (menit)':menit, 'Lebih(menit)':0, 'Foto Masuk':driveLinkMasuk||'', 'Foto Keluar':'',
      })
      if (menit > 0) {
        showToast(`⚠️ Clock In berhasil — Telat ${menit} menit`)
      } else {
        showToast('✅ Clock In berhasil — Tepat waktu!')
      }
      refreshData()
    } else { console.error('[clockIn] DB error:', error); showToast('❌ Gagal clock in') }
    setLoading(false)
  }

  const handleClockOut = async (foto, loc) => {
    if (!todayAtt) return
    setLoading(true)
    showToast('⏳ Mengupload foto...')
    const { jam: jamStr, tanggal: tanggalWIB } = getWIBString()
    const [mH, mM] = todayAtt.jam_masuk.split(':').map(Number)
    const [kH, kM] = jamStr.split(':').map(Number)
    const durMenit = (kH*60+kM) - (mH*60+mM)
    const lokasiLabel  = loc?.label  || 'Tidak diketahui'
    const lokasiCoords = loc?.coords || null

    // Jam keluar wajib sesuai hari
    const hariIdx = toWIB(new Date(`${tanggalWIB}T00:00:00`)).getDay()
    const namaHari = ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'][hariIdx]
    const jamKeluarWajib = emp[`jam_keluar_${namaHari}`] || emp.jam_keluar_wajib || '16:40'
    const [wkH, wkM] = jamKeluarWajib.split(':').map(Number)
    const keluarWajibMenit = wkH*60+wkM

    // Lembur = selisih clock out dari jam keluar wajib (bukan dari 9 jam durasi)
    // Hanya dihitung kalau clock out SETELAH jam keluar wajib
    const lemburMenit = Math.max(0, (kH*60+kM) - keluarWajibMenit)
    const lemburJam   = Math.round(lemburMenit / 60 * 100) / 100

    // Pulang cepat = clock out SEBELUM jam keluar wajib
    const menitPulangCepat = Math.max(0, keluarWajibMenit - (kH*60+kM))

    const path = `${tanggalWIB}/${user.nip}_keluar_${jamStr.replace(':','')}.jpg`
    const fotoUrl = await uploadFoto(foto, path)

    // Backup ke Google Drive — ditunggu hasilnya supaya link bisa dicatat ke Sheets
    const driveLinkKeluar = await uploadToDrive(foto, 'absensi', `keluar_${jamStr.replace(':','')}.jpg`, { tanggal: tanggalWIB, nip: user.nip, nama: user.nama })

    const { error } = await supabase.from('attendance').update({
      jam_keluar:jamStr,
      durasi:`${Math.floor(durMenit/60)}j ${durMenit%60}m`,
      jam_lembur:Math.round(lemburJam*100)/100,
      foto_keluar: fotoUrl || foto,
      foto_keluar_drive_link: driveLinkKeluar || null,
      lokasi_keluar:lokasiLabel, koordinat_keluar:lokasiCoords
    }).eq('id', todayAtt.id)
    if (!error) {
      await supabase.from('audit_log').insert({ user_name:user.nama, nip:user.nip, aktivitas:'Clock Out', keterangan:`${jamStr} WIB · ${lokasiLabel}` })
      // Update baris yang sama di Sheets (dicocokkan via NIP+Tanggal, dibuat saat clock in)
      logToSheet('absensi', { NIP:user.nip, Tanggal:tanggalWIB }, {
        NIP:user.nip, Nama:user.nama, Tanggal:tanggalWIB,
        'Jam Masuk':todayAtt.jam_masuk, 'Jam Keluar':jamStr,
        'Telat (menit)':todayAtt.menit_terlambat ?? 0,
        'Lebih(menit)': lemburMenit,
        'Foto Masuk':todayAtt.foto_masuk_drive_link||'', 'Foto Keluar':driveLinkKeluar||'',
      })
      if (menitPulangCepat > 0) {
        showToast(`⚠️ Clock Out berhasil — Pulang ${menitPulangCepat} menit lebih awal`)
      } else if (lemburJam > 0) {
        showToast(`✅ Clock Out berhasil — Lembur ${lemburJam.toFixed(1)} jam`)
      } else {
        showToast('✅ Clock Out berhasil!')
      }
      refreshData()
    } else { console.error(error); showToast('❌ Gagal clock out') }
    setLoading(false)
  }

  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'24px 16px 12px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <Avatar fotoProfil={emp.foto_profil} nama={user.nama} size={48} fontSize={18}/>
          <div><p style={{ fontSize:11,color:'#aaa',margin:0 }}>Halo, 👋</p><p style={{ fontWeight:800,color:'#111',margin:0 }}>{user.nama}</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>{emp.jabatan}</p></div>
        </div>
        <NotifBell nip={user.nip} onOpen={()=>setShowNotif(true)} notifications={dbData.notifications}/>
        {showNotif && <NotifPanel nip={user.nip} onClose={()=>setShowNotif(false)} notifications={dbData.notifications}
          onMarkRead={async id=>{ await supabase.from('notifications').update({is_read:true}).eq('id',id); refreshData() }}
          onMarkAllRead={async()=>{ await supabase.from('notifications').update({is_read:true}).eq('nip',user.nip); refreshData() }}
          onOpenAnnouncement={()=>setShowAnn(true)}/>}
      </div>
      <div style={{ padding:'0 16px',display:'flex',flexDirection:'column',gap:12 }}>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
          <Card style={{ padding:16 }}><p style={{ fontSize:11,color:'#aaa',margin:'0 0 4px' }}>Waktu Saat Ini</p><p style={{ fontWeight:800,fontSize:22,color:'#E53935',margin:0 }}>{jam}</p><p style={{ fontSize:11,color:'#aaa',marginTop:4 }}>{now.getDate()} {BNAME[now.getMonth()]}</p></Card>
          <Card style={{ padding:16 }}><p style={{ fontSize:11,color:'#aaa',margin:'0 0 4px' }}>Sisa Izin Lainnya</p><p style={{ fontWeight:800,fontSize:22,color:'#F5A623',margin:0 }}>{emp.sisa_izin??0}</p><p style={{ fontSize:11,color:'#aaa',marginTop:4 }}>dari {emp.sisa_izin??0} kuota</p></Card>
        </div>
        <Card style={{ padding:16 }}>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}><span style={{ fontSize:20 }}>🖐️</span><div><p style={{ fontWeight:700,margin:0 }}>Absen & Selfie</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>Rekam kehadiranmu</p></div></div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            {/* Clock In */}
            <button onClick={()=>{
              if(clockedIn){showToast('Sudah Clock In hari ini');return;}
              setCamera({mode:'in',cb:handleClockIn})
            }} style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'16px 8px',borderRadius:14,background:clockedIn?'#ccc':'#E53935',color:'white',border:'none',cursor:'pointer',fontWeight:700,position:'relative' }}>
              <span style={{ fontSize:24,marginBottom:4 }}>📷</span><span style={{ fontSize:13 }}>Clock In</span>
              {hasIzinTerlambat && !clockedIn && <span style={{ position:'absolute',top:6,right:6,fontSize:9,background:'#43A047',borderRadius:99,padding:'2px 5px',fontWeight:700 }}>Izin ✓</span>}
            </button>
            {/* Clock Out */}
            <button onClick={()=>{
              if(!clockedIn){showToast('Lakukan Clock In dulu');return;}
              if(clockedOut){showToast('Sudah Clock Out hari ini');return;}
              if(!clockOutTerbuka){showToast('Sudah lewat jam kerja. Ajukan Izin Lembur untuk lembur.');return;}
              setCamera({mode:'out',cb:handleClockOut})
            }} style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'16px 8px',borderRadius:14,background:clockedOut?'#ccc':!clockOutTerbuka?'#bbb':'#F5A623',color:'white',border:'none',cursor:'pointer',fontWeight:700,position:'relative' }}>
              <span style={{ fontSize:24,marginBottom:4 }}>📷</span>
              <span style={{ fontSize:13 }}>Clock Out</span>
              {!clockedOut && !clockOutTerbuka && nowMenit > keluarMenit && <span style={{ fontSize:9,marginTop:2,opacity:0.9 }}>Izin Lembur?</span>}
              {hasIzinLembur && clockedIn && !clockedOut && <span style={{ position:'absolute',top:6,right:6,fontSize:9,background:'#7B1FA2',borderRadius:99,padding:'2px 5px',fontWeight:700 }}>Lembur ✓</span>}
            </button>
          </div>
          {/* Info izin aktif */}
          {todayIzin && !clockedOut && (
            <div style={{ marginTop:8,background:'#E8F5E9',borderRadius:10,padding:'8px 12px',fontSize:12,color:'#2E7D32',fontWeight:600 }}>
              ✅ {todayIzin.jenis_izin} disetujui hari ini
              {hasIzinSetengahHari && ' — batas masuk 12:45'}
              {hasIzinLembur && ' — Clock Out terbuka setelah jam kerja'}
            </div>
          )}
        </Card>
        <button onClick={()=>setShowAnn(true)} style={{ display:'flex',alignItems:'center',gap:12,padding:16,background:'white',borderRadius:16,border:'none',cursor:'pointer',boxShadow:'0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ width:40,height:40,borderRadius:12,background:'#FFF3E0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20 }}>📢</div>
          <div style={{ textAlign:'left',flex:1 }}><p style={{ fontWeight:700,fontSize:13,color:'#E65100',margin:0 }}>Pengumuman HRD</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>{dbData.announcements.length} pengumuman aktif</p></div>
          <span style={{ color:'#ccc',fontSize:18 }}>›</span>
        </button>
        <button onClick={()=>setShowHandbook(true)} style={{ display:'flex',alignItems:'center',gap:12,padding:16,background:'white',borderRadius:16,border:'none',cursor:'pointer',boxShadow:'0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ width:40,height:40,borderRadius:12,background:'#E8F5E9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20 }}>📖</div>
          <div style={{ textAlign:'left',flex:1 }}><p style={{ fontWeight:700,fontSize:13,color:'#2E7D32',margin:0 }}>Handbook Perusahaan</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>{dbData.handbook.length} halaman panduan</p></div>
          <span style={{ color:'#ccc',fontSize:18 }}>›</span>
        </button>
        <Card style={{ padding:16 }}>
          <p style={{ fontWeight:800,margin:'0 0 12px' }}>Riwayat Absen</p>
          {myAtt.length===0 && <p style={{ textAlign:'center',color:'#aaa',fontSize:13,padding:12 }}>Belum ada riwayat absensi</p>}
          {myAtt.map((a,i)=>(
            <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<myAtt.length-1?'1px solid #f5f5f5':'none' }}>
              <div style={{ width:36,height:36,borderRadius:10,background:STATUS_COLOR[a.status_kehadiran]?.bg||'#f5f5f5',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <span style={{ fontSize:11,fontWeight:700,color:STATUS_COLOR[a.status_kehadiran]?.text }}>{a.tanggal?.slice(8,10)}</span>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:12,fontWeight:600,margin:0,color:'#333' }}>{a.tanggal}</p>
                <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{a.jam_masuk||'-'} → {a.jam_keluar||'-'}</p>
                {a.menit_terlambat>0 && <p style={{ fontSize:10,color:'#E53935',fontWeight:700,margin:'2px 0 0' }}>⏰ Telat {a.menit_terlambat} menit</p>}
              </div>
              <Chip status={a.status_kehadiran}/>
            </div>
          ))}
        </Card>
        <button onClick={()=>setShowChangePw(true)} style={{ padding:14,borderRadius:14,color:'#444',fontWeight:700,fontSize:14,border:'1px solid #e0e0e0',background:'white',cursor:'pointer',marginTop:4,width:'100%' }}>🔑 Ubah Password</button>
        <button onClick={onLogout} style={{ padding:14,borderRadius:14,color:'#E53935',fontWeight:700,fontSize:14,border:'2px solid #FFCDD2',background:'white',cursor:'pointer',marginTop:4,width:'100%' }}>← Keluar</button>
      </div>

      {showChangePw && <ChangePasswordModal user={user} showToast={showToast} onClose={()=>setShowChangePw(false)}/>}

      {camera && <CameraModal mode={camera.mode} onCapture={(foto, loc)=>{ camera.cb(foto, loc); setCamera(null) }} onClose={()=>setCamera(null)}/>}

      {showAnn && (
        <Modal title="Pengumuman HRD" onClose={()=>{ setShowAnn(false); setSelectedAnn(null) }}>
          {selectedAnn ? (
            <div>
              <button onClick={()=>setSelectedAnn(null)} style={{ background:'none',border:'none',color:'#E53935',fontSize:13,fontWeight:700,cursor:'pointer',marginBottom:12,padding:0 }}>← Kembali</button>
              <div style={{ background:'#FFF3E0',borderRadius:12,padding:14,marginBottom:12 }}>
                <span style={{ fontSize:11,padding:'2px 8px',borderRadius:99,background:'#FFE0B2',color:'#E65100',fontWeight:700 }}>{selectedAnn.type}</span>
                <p style={{ fontWeight:800,fontSize:15,margin:'8px 0 4px' }}>{selectedAnn.judul}</p>
                <p style={{ fontSize:11,color:'#aaa',margin:0 }}>Oleh {selectedAnn.created_by} · {selectedAnn.tanggal}</p>
              </div>
              <p style={{ fontSize:13,color:'#444',lineHeight:1.6 }}>{selectedAnn.isi}</p>
            </div>
          ) : dbData.announcements.map(a=>(
            <div key={a.id} onClick={()=>setSelectedAnn(a)} style={{ padding:14,borderRadius:14,border:'1px solid #f0f0f0',marginBottom:10,cursor:'pointer' }}>
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:6 }}>
                <span style={{ fontSize:11,padding:'2px 8px',borderRadius:99,background:a.type==='LIBUR'?'#E3F2FD':'#FFF8E1',color:a.type==='LIBUR'?'#1565C0':'#F57F17',fontWeight:700 }}>{a.type}</span>
                <span style={{ fontSize:11,color:'#aaa' }}>{a.tanggal}</span>
              </div>
              <p style={{ fontWeight:700,fontSize:13,margin:0 }}>{a.judul}</p>
              <p style={{ fontSize:12,color:'#888',margin:'4px 0 0',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{a.isi}</p>
            </div>
          ))}
        </Modal>
      )}

      {showHandbook && (
        <Modal title="Handbook Perusahaan" onClose={()=>setShowHandbook(false)}>
          {dbData.handbook.length===0 ? <p style={{ textAlign:'center',color:'#aaa',padding:24,fontSize:13 }}>Belum ada handbook.</p>
          : dbData.handbook.map(hb=>(
            <div key={hb.id} style={{ border:'1px solid #f0f0f0',borderRadius:14,padding:16,marginBottom:12 }}>
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
                <div style={{ width:32,height:32,borderRadius:10,background:'#E8F5E9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16 }}>📖</div>
                <div><p style={{ fontWeight:700,fontSize:14,margin:0 }}>{hb.judul}</p><p style={{ fontSize:10,color:'#aaa',margin:0 }}>Diperbarui: {hb.updated_at}</p></div>
              </div>
              <p style={{ fontSize:13,color:'#555',lineHeight:1.6,margin:0 }}>{hb.isi}</p>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}

// ─── EMPLOYEE IZIN ─────────────────────────────────────────────────────────────
const EmpIzin = ({ user, onAjukan, dbData, refreshData }) => {
  const [tab, setTab] = useState('Semua')
  const [showNotif, setShowNotif] = useState(false)
  const tabMap = { Semua:null, Menunggu:'MENUNGGU', Disetujui:'DISETUJUI', Ditolak:'DITOLAK' }
  const data = dbData.izin.filter(c=>c.nip===user.nip&&(tab==='Semua'||c.status===tabMap[tab]))
  const emp = dbData.karyawan.find(k=>k.nip===user.nip)||user
  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'24px 16px 12px' }}>
        <div><h1 style={{ fontWeight:800,fontSize:18,margin:0 }}>Izin</h1><p style={{ fontSize:11,color:'#aaa',margin:0 }}>Pengajuan & riwayat izin</p></div>
        <NotifBell nip={user.nip} onOpen={()=>setShowNotif(true)} notifications={dbData.notifications}/>
        {showNotif && <NotifPanel nip={user.nip} onClose={()=>setShowNotif(false)} notifications={dbData.notifications}
          onMarkRead={async id=>{ await supabase.from('notifications').update({is_read:true}).eq('id',id); refreshData() }}
          onMarkAllRead={async()=>{ await supabase.from('notifications').update({is_read:true}).eq('nip',user.nip); refreshData() }}/>}
      </div>
      <div style={{ padding:'0 16px',display:'flex',flexDirection:'column',gap:12 }}>
        <Card style={{ padding:16,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div><p style={{ fontSize:13,color:'#777',margin:0 }}>Sisa Izin Tahunan</p><p style={{ fontSize:32,fontWeight:800,color:'#F5A623',margin:'4px 0 0' }}>{emp.sisa_izin??0} Hari</p></div>
          <span style={{ fontSize:48,opacity:0.2 }}>🌴</span>
        </Card>
        <button onClick={onAjukan} style={{ display:'flex',alignItems:'center',gap:12,padding:16,background:'white',borderRadius:16,border:'none',cursor:'pointer',boxShadow:'0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ width:40,height:40,borderRadius:12,background:'#FFE4E1',display:'flex',alignItems:'center',justifyContent:'center' }}>📋</div>
          <div style={{ textAlign:'left',flex:1 }}><p style={{ fontWeight:700,fontSize:13,color:'#E53935',margin:0 }}>Ajukan Izin Baru</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>Buat pengajuan izin</p></div>
          <span style={{ color:'#ccc',fontSize:18 }}>›</span>
        </button>
        <Card>
          <div style={{ display:'flex',borderBottom:'1px solid #f0f0f0' }}>
            {['Semua','Menunggu','Disetujui','Ditolak'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{ flex:1,padding:'12px 0',fontSize:12,fontWeight:700,border:'none',borderBottom:tab===t?'2px solid #E53935':'2px solid transparent',color:tab===t?'#E53935':'#aaa',background:'transparent',cursor:'pointer' }}>{t}</button>
            ))}
          </div>
          {data.length===0 ? <p style={{ textAlign:'center',color:'#aaa',padding:24,fontSize:13 }}>Tidak ada data</p>
          : data.map((c,i)=>(
            <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:16,borderBottom:'1px solid #f9f9f9' }}>
              <div style={{ width:40,height:40,borderRadius:12,background:'#FFE4E1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>📅</div>
              <div style={{ flex:1 }}><p style={{ fontWeight:700,fontSize:13,margin:0 }}>{c.jenis_izin}</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>{c.tanggal_mulai} – {c.tanggal_selesai} · {c.jumlah_hari} hari</p></div>
              <Chip status={c.status}/>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

// ─── EMPLOYEE AJUKAN IZIN ─────────────────────────────────────────────────────
const EmpAjukanIzin = ({ user, showToast, onBack, refreshData, dbData }) => {
  // todayWIB untuk default tanggal
  const todayWIBStr = (() => {
    const w = new Date(new Date().toLocaleString('en-US', { timeZone:'Asia/Jakarta' }))
    return `${w.getFullYear()}-${String(w.getMonth()+1).padStart(2,'0')}-${String(w.getDate()).padStart(2,'0')}`
  })()

  const [form, setForm] = useState({ jenis:'', mulai:todayWIBStr, selesai:todayWIBStr, alasan:'' })
  const [lampiran, setLampiran] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState(false)
  const fileRef = useRef(null)
  const set = k=>e=>setForm(f=>({...f,[k]:e.target.value}))

  // Izin terlambat/setengah hari/lembur = selalu 1 hari (tanggal mulai = selesai)
  const IS_ONE_DAY = ['Izin Terlambat','Izin Setengah Hari','Izin Lembur'].includes(form.jenis)
  const emp = dbData.karyawan.find(k=>k.nip===user.nip)||user
  const hari = () => {
    if (IS_ONE_DAY) return 1
    if(!form.mulai||!form.selesai) return 0
    const d = Math.ceil((new Date(form.selesai)-new Date(form.mulai))/86400000)+1
    return d>0?d:0
  }
  const selesai = IS_ONE_DAY ? form.mulai : form.selesai

  // Info konteks per jenis izin
  const JENIS_INFO = {
    'Izin Terlambat': { icon:'⏰', warna:'#E65100', hint:'Jika disetujui, keterlambatan hari ini akan dihapus dari rekap.' },
    'Izin Setengah Hari': { icon:'🌓', warna:'#1565C0', hint:'Clock In maksimal 12:45. Lebih dari itu tetap dihitung terlambat.' },
    'Izin Lembur': { icon:'🌙', warna:'#4A148C', hint:'Tombol Clock Out akan terbuka kembali setelah jam 16:40 di hari yang diajukan.' },
    'Izin Sakit': { icon:'🏥', warna:'#C62828', hint:'Sertakan surat dokter sebagai lampiran.' },
    'Izin Lainnya': { icon:'📋', warna:'#555', hint:'Sertakan surat keterangan / dokumen pendukung.' },
  }
  const info = JENIS_INFO[form.jenis]

  // Upload lampiran (gambar/PDF) ke Supabase Storage via REST API langsung
  const uploadLampiran = async (file) => {
    try {
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
      const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      const ext = file.name.split('.').pop() || 'bin'
      const safeName = `${Date.now()}_${user.nip}.${ext}`
      const path = `${user.nip}/${safeName}`
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/lampiran-izin/${path}`
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      const uploadPromise = fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
        body: bytes,
      })
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      const res = await Promise.race([uploadPromise, timeoutPromise])
      if (!res.ok) { console.error('[uploadLampiran] gagal status:', res.status); return null }
      return `${SUPABASE_URL}/storage/v1/object/public/lampiran-izin/${path}`
    } catch(e) { console.error('[uploadLampiran] exception:', e.message); return null }
  }

  const backupLampiranToDrive = (file, tanggalWIB) => {
    try {
      const fd = new FormData()
      fd.append('file', file, file.name)
      fd.append('tanggal', tanggalWIB)
      fd.append('nip', user.nip)
      fd.append('nama', user.nama)
      fd.append('kategori', 'izin')
      fd.append('fileName', file.name)
      return fetch('/api/upload-drive', { method:'POST', body: fd })
        .then(r => r.json())
        .then(j => { console.log('[drive] backup lampiran:', j); return j?.webViewLink || null })
        .catch(e => { console.warn('[drive] backup lampiran gagal (diabaikan):', e.message); return null })
    } catch(e) { console.warn('[drive] backup lampiran exception:', e.message); return Promise.resolve(null) }
  }

  const submit = async()=>{
    setErr('')
    if(!form.jenis) { setErr('Pilih jenis izin terlebih dahulu'); return }
    if(!form.mulai||!form.alasan) { setErr('Semua field wajib diisi'); return }
    if(!IS_ONE_DAY && !form.selesai) { setErr('Tanggal selesai wajib diisi'); return }
    if(!lampiran) { setErr('Lampiran bukti wajib diunggah'); return }
    setLoading(true)
    showToast('⏳ Mengupload lampiran...')
    const emp = dbData.karyawan.find(k=>k.nip===user.nip)||user
    const lampiranUrl = await uploadLampiran(lampiran)
    if (!lampiranUrl) { setErr('Gagal mengupload lampiran. Coba lagi atau gunakan file yang lebih kecil.'); setLoading(false); return }

    const tanggalWIB = todayWIBStr
    const driveLinkLampiran = await backupLampiranToDrive(lampiran, tanggalWIB)

    const {data: inserted, error} = await supabase.from('izin').insert({
      nip:user.nip, nama:user.nama, jabatan:emp.jabatan||'',
      jenis_izin:form.jenis, tanggal_mulai:form.mulai, tanggal_selesai:selesai,
      jumlah_hari:hari(), keterangan:form.alasan, status:'MENUNGGU',
      diajukan_pada:tanggalWIB,
      lampiran_nama: lampiran.name,
      lampiran_url: lampiranUrl,
      lampiran_drive_link: driveLinkLampiran || null,
    }).select().single()
    if(!error){
      await supabase.from('audit_log').insert({ user_name:user.nama,nip:user.nip,aktivitas:`Pengajuan ${form.jenis}`,keterangan:`${form.mulai}${!IS_ONE_DAY&&selesai!==form.mulai?`–${selesai}`:''}, ${hari()} hari` })
      await supabase.from('notifications').insert({ nip:'20001',type:'APPROVAL',message:`${user.nama} mengajukan ${form.jenis} (${form.mulai})` })
      logToSheet('izin', { ID: inserted?.id }, {
        ID: inserted?.id, NIP:user.nip, Nama:user.nama, 'Jenis Izin':form.jenis,
        'Tanggal Mulai':form.mulai, 'Tanggal Selesai':selesai, 'Jumlah Hari':hari(),
        Status:'MENUNGGU', Lampiran: driveLinkLampiran || lampiranUrl || '',
      })
      setOk(true); refreshData()
    } else { console.error(error); setErr('Gagal mengirim. Coba lagi.') }
    setLoading(false)
  }

  if(ok) return (
    <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'#F8F8F8' }}>
      <Card style={{ padding:32,width:'100%',maxWidth:360,textAlign:'center' }}>
        <div style={{ fontSize:48,marginBottom:12 }}>✅</div>
        <h2 style={{ fontWeight:700,margin:'0 0 8px' }}>Pengajuan Terkirim!</h2>
        <p style={{ color:'#888',fontSize:13,marginBottom:24 }}>Menunggu persetujuan HRD.</p>
        <BtnGrad onClick={onBack}>Kembali</BtnGrad>
      </Card>
    </div>
  )

  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ display:'flex',alignItems:'center',gap:8,padding:'24px 16px 12px' }}>
        <button onClick={onBack} style={{ background:'none',border:'none',color:'#E53935',fontSize:20,cursor:'pointer' }}>←</button>
        <h1 style={{ fontWeight:800,fontSize:18,margin:0 }}>Ajukan Izin</h1>
      </div>
      <div style={{ padding:'0 16px',display:'flex',flexDirection:'column',gap:12 }}>
        {err && <div style={{ background:'#FFF5F5',border:'1px solid #FFCDD2',color:'#C62828',fontSize:13,padding:'10px 14px',borderRadius:12 }}>{err}</div>}
        <Card style={{ padding:20,display:'flex',flexDirection:'column',gap:14 }}>

          {/* ── Jenis Izin — 2 kolom atas + dropdown Izin Lainnya ── */}
          <div>
            <label style={{ fontSize:12,fontWeight:700,color:'#666',display:'block',marginBottom:8 }}>Jenis Izin</label>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8 }}>
              {['Izin Sakit','Izin Terlambat','Izin Setengah Hari','Izin Lembur'].map(j=>(
                <button key={j} onClick={()=>setForm(f=>({...f,jenis:j}))} style={{ padding:'12px 6px',borderRadius:12,border:`2px solid ${form.jenis===j?JENIS_INFO[j].warna:'#e0e0e0'}`,background:form.jenis===j?`${JENIS_INFO[j].warna}11`:'white',cursor:'pointer',fontWeight:700,fontSize:12,color:form.jenis===j?JENIS_INFO[j].warna:'#888',textAlign:'center',lineHeight:1.4 }}>
                  <span style={{ display:'block',fontSize:20,marginBottom:3 }}>{JENIS_INFO[j].icon}</span>{j}
                </button>
              ))}
            </div>
            {/* Izin Lainnya sebagai opsi terakhir */}
            {(() => {
              const sisaLainnya = emp?.sisa_izin ?? 0
              const habis = sisaLainnya <= 0
              return (
                <button
                  onClick={()=>!habis&&setForm(f=>({...f,jenis:'Izin Lainnya'}))}
                  style={{ width:'100%',padding:'11px 14px',borderRadius:12,border:`2px solid ${form.jenis==='Izin Lainnya'?'#555':habis?'#ffcdd2':'#e0e0e0'}`,background:habis?'#fff5f5':form.jenis==='Izin Lainnya'?'#f5f5f5':'white',cursor:habis?'not-allowed':'pointer',fontWeight:700,fontSize:12,color:habis?'#e57373':form.jenis==='Izin Lainnya'?'#333':'#888',textAlign:'left',display:'flex',alignItems:'center',gap:8,opacity:habis?0.7:1 }}>
                  <span style={{ fontSize:18 }}>📋</span>
                  <span style={{ flex:1 }}>Izin Lainnya</span>
                  <span style={{ fontSize:11,background:habis?'#FFCDD2':'#E8F5E9',color:habis?'#C62828':'#2E7D32',borderRadius:99,padding:'2px 8px',fontWeight:800 }}>
                    {habis ? 'Habis' : `${sisaLainnya} tersisa`}
                  </span>
                </button>
              )
            })()}
          </div>

          {/* Hint konteks jenis izin yang dipilih */}
          {info && (
            <div style={{ background:`${info.warna}11`,border:`1px solid ${info.warna}44`,borderRadius:10,padding:'9px 12px',display:'flex',gap:8,alignItems:'flex-start' }}>
              <span style={{ fontSize:15,flexShrink:0 }}>{info.icon}</span>
              <p style={{ fontSize:12,color:info.warna,fontWeight:600,margin:0,lineHeight:1.5 }}>{info.hint}</p>
            </div>
          )}

          {/* Tanggal — 1 hari saja untuk Terlambat/Setengah/Lembur */}
          <div>
            <label style={{ fontSize:12,fontWeight:700,color:'#666',display:'block',marginBottom:6 }}>Tanggal {IS_ONE_DAY ? '' : 'Mulai'}</label>
            <input type="date" value={form.mulai} onChange={set('mulai')} style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:12,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>
          </div>
          {!IS_ONE_DAY && (
            <div>
              <label style={{ fontSize:12,fontWeight:700,color:'#666',display:'block',marginBottom:6 }}>Tanggal Selesai</label>
              <input type="date" value={form.selesai} min={form.mulai} onChange={set('selesai')} style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:12,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>
            </div>
          )}
          <div>
            <label style={{ fontSize:12,fontWeight:700,color:'#666',display:'block',marginBottom:6 }}>Jumlah Hari</label>
            <div style={{ border:'1px solid #e0e0e0',borderRadius:12,padding:'10px 12px',background:'#fafafa',fontSize:13,fontWeight:700,color:'#555' }}>{hari()} hari</div>
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:700,color:'#666',display:'block',marginBottom:6 }}>Alasan</label>
            <textarea value={form.alasan} onChange={set('alasan')} rows={3} maxLength={200} placeholder="Tuliskan alasan izin..." style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:12,padding:'10px 12px',fontSize:13,outline:'none',resize:'none',boxSizing:'border-box' }}/>
          </div>
        </Card>

        <Card style={{ padding:16 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
            <div>
              <p style={{ fontWeight:700,margin:0 }}>📎 Lampiran Bukti</p>
              <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{form.jenis==='Izin Sakit'?'Surat dokter (wajib)':'Surat izin / dokumen pendukung'}</p>
            </div>
            <BtnGrad small onClick={()=>fileRef.current.click()}>{lampiran?'Ganti':'Upload'}</BtnGrad>
          </div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:'none' }} onChange={e=>{ const f=e.target.files[0]; if(!f) return; if(f.size>5*1024*1024){showToast('❌ Ukuran file maksimal 5MB');return}; setLampiran(f) }}/>
          {lampiran
            ? <div style={{ display:'flex',alignItems:'center',gap:10,background:'#F0FFF4',padding:'10px 14px',borderRadius:10 }}><span>📄</span><span style={{ fontSize:12,fontWeight:600,color:'#2E7D32',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{lampiran.name}</span></div>
            : <div style={{ border:'2px dashed #e0e0e0',borderRadius:12,padding:20,textAlign:'center',color:'#ccc',fontSize:13 }}>Belum ada lampiran</div>}
        </Card>
        <BtnGrad onClick={submit} disabled={loading}>{loading?'Mengupload & mengirim...':'Ajukan Izin'}</BtnGrad>
      </div>
    </div>
  )
}

// ─── EMPLOYEE SLIP GAJI ───────────────────────────────────────────────────────
const EmpSlipGaji = ({ user, dbData, refreshData }) => {
  const [bulan, setBulan] = useState(new Date().getMonth())
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [tab, setTab] = useState('Ringkasan')
  const [showNotif, setShowNotif] = useState(false)
  const [slip, setSlip] = useState(null)
  const [loadingSlip, setLoadingSlip] = useState(false)
  const [slipErr, setSlipErr] = useState('')

  // Fetch data slip dari Google Sheets setiap kali bulan/tahun berubah
  useEffect(() => {
    const fetchSlip = async () => {
      setLoadingSlip(true); setSlipErr(''); setSlip(null)
      try {
        const res = await fetch(`/api/get-slip?nip=${encodeURIComponent(user.nip.trim())}`)
        const j = await res.json()
        if (j.success) setSlip(j.slip)
        else setSlipErr(j.error || 'Data tidak ditemukan')
      } catch (e) { setSlipErr('Gagal memuat data slip') }
      setLoadingSlip(false)
    }
    fetchSlip()
  }, [user.nip, bulan, tahun])

  const records = dbData.attendance.filter(a=>{ const d=new Date(a.tanggal); return a.nip===user.nip&&d.getMonth()===bulan&&d.getFullYear()===tahun })
  const hadirCount = records.filter(a=>['HADIR','WFH','TERLAMBAT'].includes(a.status_kehadiran)).length
  const terlambatCount = records.filter(a=>a.status_kehadiran==='TERLAMBAT').length
  const lemburTotal = records.reduce((s,a)=>s+(a.jam_lembur||0),0)

  const riwayat = [4,3,2,1,0].map(m=>{
    const mn=(new Date().getMonth()-m+12)%12
    const yr=new Date().getFullYear()-(new Date().getMonth()-m<0?1:0)
    const rec=dbData.attendance.filter(a=>{ const d=new Date(a.tanggal); return a.nip===user.nip&&d.getMonth()===mn&&d.getFullYear()===yr })
    const hadir=rec.filter(a=>['HADIR','WFH','TERLAMBAT'].includes(a.status_kehadiran)).length
    return { bulan:mn, tahun:yr, hadir }
  })

  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'24px 16px 0' }}>
        <div><h1 style={{ fontWeight:800,fontSize:18,margin:0 }}>Slip Gaji</h1><p style={{ fontSize:11,color:'#aaa',margin:0 }}>Data dari rekap absensi bulan berjalan</p></div>
        <NotifBell nip={user.nip} onOpen={()=>setShowNotif(true)} notifications={dbData.notifications}/>
        {showNotif && <NotifPanel nip={user.nip} onClose={()=>setShowNotif(false)} notifications={dbData.notifications}
          onMarkRead={async id=>{ await supabase.from('notifications').update({is_read:true}).eq('id',id); refreshData() }}
          onMarkAllRead={async()=>{ await supabase.from('notifications').update({is_read:true}).eq('nip',user.nip); refreshData() }}/>}
      </div>
      <div style={{ display:'flex',borderBottom:'1px solid #e0e0e0',background:'white' }}>
        {['Ringkasan','Riwayat'].map(t=><button key={t} onClick={()=>setTab(t)} style={{ flex:1,padding:'12px 0',fontSize:13,fontWeight:700,border:'none',borderBottom:tab===t?'2px solid #E53935':'2px solid transparent',color:tab===t?'#E53935':'#aaa',background:'transparent',cursor:'pointer' }}>{t}</button>)}
      </div>
      <div style={{ padding:'12px 16px',display:'flex',flexDirection:'column',gap:12 }}>
        <div style={{ display:'flex',gap:8 }}>
          <select value={bulan} onChange={e=>setBulan(Number(e.target.value))} style={{ flex:1,background:'white',border:'1px solid #e0e0e0',borderRadius:12,padding:'10px 12px',fontSize:13,outline:'none' }}>{BNAME.map((b,i)=><option key={i} value={i}>{b}</option>)}</select>
          <select value={tahun} onChange={e=>setTahun(Number(e.target.value))} style={{ width:80,background:'white',border:'1px solid #e0e0e0',borderRadius:12,padding:'10px 12px',fontSize:13,outline:'none' }}>{[2024,2025,2026].map(y=><option key={y}>{y}</option>)}</select>
        </div>

        {tab==='Ringkasan' && <>
          {/* Loading / Error state */}
          {loadingSlip && (
            <div style={{ textAlign:'center',padding:32,color:'#aaa',fontSize:13 }}>⏳ Memuat data slip...</div>
          )}
          {slipErr && !loadingSlip && (
            <div style={{ background:'#FFF5F5',border:'1px solid #FFCDD2',borderRadius:12,padding:'12px 16px',fontSize:13,color:'#C62828' }}>⚠️ {slipErr}</div>
          )}

          {slip && !loadingSlip && <>
            {/* Take Home Pay banner */}
            <div style={{ borderRadius:16,padding:20,background:'linear-gradient(135deg,#FFF8E1,#FFF3CD)',position:'relative',overflow:'hidden' }}>
              <p style={{ fontSize:13,color:'#777',margin:0 }}>Take Home Pay</p>
              <p style={{ fontSize:28,fontWeight:800,color:'#E53935',margin:'4px 0 2px' }}>{formatRp(slip.takeHomePay)}</p>
              <p style={{ fontSize:11,color:'#888',margin:0 }}>{BNAME[bulan]} {tahun}</p>
              <p style={{ fontSize:11,color: slip.performaKedisiplinan==='Disiplin'?'#2E7D32':'#E65100',fontWeight:700,margin:'4px 0 0',background: slip.performaKedisiplinan==='Disiplin'?'#E8F5E9':'#FFF3E0',display:'inline-block',padding:'2px 8px',borderRadius:99 }}>{slip.performaKedisiplinan||'-'}</p>
              <span style={{ position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',fontSize:48,opacity:0.3 }}>💰</span>
            </div>

            {/* Statistik kehadiran lokal */}
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10 }}>
              {[['Hadir',hadirCount,'hari','#E8F5E9','#2E7D32'],['Terlambat',terlambatCount,'hari','#FFF8E1','#F57F17'],['Lembur',slip.totalLembur.toFixed(1),'jam','#E3F2FD','#1565C0']].map(([l,v,u,bg,c])=>(
                <Card key={l} style={{ padding:12,textAlign:'center',background:bg,boxShadow:'none' }}><p style={{ fontSize:11,color:'#aaa',margin:'0 0 4px' }}>{l}</p><p style={{ fontWeight:800,fontSize:18,color:c,margin:0 }}>{v}</p><p style={{ fontSize:11,color:c,margin:0 }}>{u}</p></Card>
              ))}
            </div>

            {/* Penghasilan */}
            <Card style={{ padding:16 }}>
              <p style={{ fontWeight:700,fontSize:13,color:'#43A047',margin:'0 0 12px' }}>💰 PENGHASILAN</p>
              {[
                ['Gaji Pokok',          slip.gajiPokok],
                ['Tunjangan Kedisiplinan', slip.tunjanganKedisiplinan],
                ['Bonus Penjualan',     slip.bonusPenjualan],
                ['Tunjangan Makan',     slip.tunjanganMakan],
                ['Bonus Lembur',        slip.totalBonusLembur],
              ].map(([k,v])=>(
                <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f5f5f5',fontSize:13 }}>
                  <span style={{ color:'#777' }}>{k}</span>
                  <span style={{ fontWeight:600,color:'#43A047' }}>+{formatRp(v)}</span>
                </div>
              ))}
              <div style={{ display:'flex',justifyContent:'space-between',padding:'10px 0 0',fontWeight:800,fontSize:13 }}>
                <span style={{ color:'#43A047' }}>Total Penghasilan</span>
                <span style={{ color:'#43A047' }}>{formatRp(slip.totalPenghasilan)}</span>
              </div>
            </Card>

            {/* Potongan */}
            <Card style={{ padding:16 }}>
              <p style={{ fontWeight:700,fontSize:13,color:'#E53935',margin:'0 0 12px' }}>✂️ POTONGAN</p>
              {[
                ['Potongan Terlambat', slip.totalDendaTerlambat, `${slip.totalJumlahTerlambat||0}× / ${slip.totalTerlambatMenit||0} menit`],
                ['Potongan Izin',      slip.totalDendaIzin,      `Sakit:${slip.totalIzinSakit||0} Terlambat:${slip.totalIzinTerlambat||0} Setengah:${slip.totalIzinSetengahHari||0} Lainnya:${slip.izinLainnya||0}`],
                ['Potongan Alpha',     slip.totalDendaAlpha,     `${slip.totalAlpha||0} hari`],
              ].map(([k,v,sub])=>(
                <div key={k} style={{ padding:'7px 0',borderBottom:'1px solid #f5f5f5' }}>
                  <div style={{ display:'flex',justifyContent:'space-between',fontSize:13 }}>
                    <span style={{ color:'#777' }}>{k}</span>
                    <span style={{ fontWeight:600,color:'#E53935' }}>-{formatRp(v)}</span>
                  </div>
                  {v > 0 && <p style={{ fontSize:10,color:'#aaa',margin:'2px 0 0' }}>{sub}</p>}
                </div>
              ))}
              <div style={{ display:'flex',justifyContent:'space-between',padding:'10px 0 0',fontWeight:800,fontSize:13 }}>
                <span style={{ color:'#E53935' }}>Total Potongan</span>
                <span style={{ color:'#E53935' }}>-{formatRp(slip.totalDenda)}</span>
              </div>
            </Card>

            {/* Take home pay bawah */}
            <div style={{ borderRadius:14,padding:16,background:'#FFF8E1',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <span style={{ fontWeight:800,fontSize:14,color:'#555' }}>Take Home Pay</span>
              <span style={{ fontWeight:800,fontSize:18,color:'#F5A623' }}>{formatRp(slip.takeHomePay)}</span>
            </div>
          </>}
        </>}

        {tab==='Riwayat' && (
          <Card>{riwayat.map((r,i)=>(
            <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:16,borderBottom:'1px solid #f5f5f5' }}>
              <div style={{ width:40,height:40,borderRadius:12,background:'#FFE4E1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>📅</div>
              <div style={{ flex:1 }}><p style={{ fontWeight:700,fontSize:13,margin:0 }}>{BNAME[r.bulan]} {r.tahun}</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>Hadir {r.hadir} hari</p></div>
            </div>
          ))}</Card>
        )}
      </div>
    </div>
  )
}

const EmpNav = ({ active, onChange }) => (
  <div style={{ position:'fixed',bottom:0,left:0,right:0,maxWidth:430,margin:'0 auto',background:'white',borderTop:'1px solid #f0f0f0',display:'flex',zIndex:40,boxShadow:'0 -4px 20px rgba(0,0,0,0.06)' }}>
    {[{key:'home',icon:'🏠',label:'Home'},{key:'izin',icon:'📅',label:'Izin'},{key:'slip',icon:'💳',label:'Slip Gaji'}].map(item=>(
      <button key={item.key} onClick={()=>onChange(item.key)} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'10px 0',background:'none',border:'none',cursor:'pointer' }}>
        <span style={{ fontSize:20 }}>{item.icon}</span>
        <span style={{ fontSize:11,fontWeight:700,color:active===item.key?'#E53935':'#aaa' }}>{item.label}</span>
        {active===item.key && <span style={{ width:20,height:2,borderRadius:2,background:'#E53935' }}/>}
      </button>
    ))}
  </div>
)

// ─── HRD DASHBOARD ────────────────────────────────────────────────────────────
const HRDDashboard = ({ user, showToast, onNavChange, dbData, refreshData }) => {
  const [showNotif, setShowNotif] = useState(false)
  const [showBelumAbsen, setShowBelumAbsen] = useState(false)
  const [showHadir, setShowHadir] = useState(false)
  const [showTerlambat, setShowTerlambat] = useState(false)

  const todayWIBDate = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jakarta'}))
  const today = `${todayWIBDate.getFullYear()}-${String(todayWIBDate.getMonth()+1).padStart(2,'0')}-${String(todayWIBDate.getDate()).padStart(2,'0')}`
  const todayAtt    = dbData.attendance.filter(a=>a.tanggal===today)
  const total       = dbData.karyawan.length
  const sedangIzin  = dbData.karyawan.filter(k=>k.status==='izin').length
  const hadirList      = todayAtt.filter(a=>['HADIR','WFH'].includes(a.status_kehadiran))
  const terlambatList  = todayAtt.filter(a=>a.status_kehadiran==='TERLAMBAT')
  const hadir          = hadirList.length
  const terlambat      = terlambatList.length
  const sudahAbsenNip  = new Set(todayAtt.map(a=>a.nip))
  const belumAbsenList = dbData.karyawan.filter(k=>k.role!=='hrd'&&!sudahAbsenNip.has(k.nip))
  const belumAbsen     = belumAbsenList.length
  const menungguIzin   = dbData.izin.filter(c=>c.status==='MENUNGGU').length
  // ── Persentase kehadiran per-tanggal bulan ini (scrollable) ──
  const [chartBulan, setChartBulan] = useState(todayWIBDate.getMonth())
  const [chartTahun, setChartTahun] = useState(todayWIBDate.getFullYear())

  const totalKaryawan = dbData.karyawan.filter(k=>k.role!=='hrd').length
  const daysInMonth = new Date(chartTahun, chartBulan+1, 0).getDate()
  const kehadiranBulan = Array.from({length:daysInMonth},(_,i)=>{
    const d = i+1
    const tglStr = `${chartTahun}-${String(chartBulan+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const isFuture = tglStr > today
    const dayW = new Date(tglStr).getDay()
    const isWeekend = dayW===0 // hanya Minggu yang dikecualikan, Sabtu tetap masuk
    if(isFuture||isWeekend) return { d, tglStr, v:null, isFuture, isWeekend }
    const hadirHari = dbData.attendance.filter(a=>a.tanggal===tglStr&&['HADIR','WFH','TERLAMBAT'].includes(a.status_kehadiran)).length
    const persen = totalKaryawan>0 ? Math.round(hadirHari/totalKaryawan*100) : 0
    return { d, tglStr, v:persen, isFuture:false, isWeekend:false }
  })
  const workDays = kehadiranBulan.filter(k=>!k.isWeekend&&!k.isFuture&&k.v!==null)
  const avgKehadiran = workDays.length>0 ? Math.round(workDays.reduce((s,k)=>s+k.v,0)/workDays.length) : 0

  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'24px 16px 12px' }}>
        <div>
          <p style={{ fontSize:11,color:'#aaa',margin:0 }}>Selamat datang 👋</p>
          <p style={{ fontWeight:800,fontSize:20,margin:0 }}>{user.nama}</p>
          <span style={{ fontSize:11,padding:'2px 10px',borderRadius:99,color:'white',background:'linear-gradient(135deg,#E53935,#F5A623)',fontWeight:700 }}>HRD</span>
        </div>
        <NotifBell nip={user.nip} onOpen={()=>setShowNotif(true)} notifications={dbData.notifications}/>
        {showNotif && <NotifPanel nip={user.nip} onClose={()=>setShowNotif(false)} notifications={dbData.notifications}
          onMarkRead={async id=>{ await supabase.from('notifications').update({is_read:true}).eq('id',id); refreshData() }}
          onMarkAllRead={async()=>{ await supabase.from('notifications').update({is_read:true}).eq('nip',user.nip); refreshData() }}/>}
      </div>
      <div style={{ padding:'0 16px',display:'flex',flexDirection:'column',gap:12 }}>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
          {[['👥','Total Karyawan',total,'#E53935','#FFE4E1'],['🌴','Sedang Izin',sedangIzin,'#F5A623','#FFF8E1']].map(([icon,lbl,val,c,bg])=>(
            <Card key={lbl} style={{ padding:16 }}>
              <div style={{ width:36,height:36,borderRadius:10,background:bg,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:8 }}><span style={{ fontSize:18 }}>{icon}</span></div>
              <p style={{ fontSize:24,fontWeight:800,color:c,margin:'0 0 2px' }}>{val}</p>
              <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{lbl}</p>
            </Card>
          ))}
        </div>
        {menungguIzin>0 && (
          <button onClick={()=>onNavChange('approval')} style={{ display:'flex',alignItems:'center',gap:12,padding:16,background:'white',borderRadius:16,border:'none',cursor:'pointer',boxShadow:'0 4px 16px rgba(229,57,53,0.12)',textAlign:'left',width:'100%' }}>
            <div style={{ width:44,height:44,borderRadius:12,background:'#FFE4E1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0 }}>📅</div>
            <div style={{ flex:1 }}><p style={{ fontWeight:700,fontSize:14,color:'#E53935',margin:0 }}>{menungguIzin} Pengajuan Izin Menunggu</p><p style={{ fontSize:12,color:'#aaa',margin:0 }}>Tap untuk review & setujui</p></div>
            <span style={{ background:'#E53935',color:'white',width:24,height:24,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0 }}>{menungguIzin}</span>
          </button>
        )}
        <Card style={{ padding:16 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
            <p style={{ fontWeight:800,margin:0 }}>Absensi Hari Ini</p>
            <span style={{ fontSize:11,color:'#aaa' }}>{today}</span>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10 }}>
            <button onClick={()=>setShowHadir(true)} style={{ borderRadius:12,padding:10,textAlign:'center',background:'#E8F5E9',border:'none',cursor:'pointer' }}>
              <p style={{ fontSize:20,fontWeight:800,color:'#2E7D32',margin:0 }}>{hadir}</p>
              <p style={{ fontSize:11,fontWeight:600,color:'#2E7D32',margin:0 }}>Hadir</p>
            </button>
            <button onClick={()=>setShowTerlambat(true)} style={{ borderRadius:12,padding:10,textAlign:'center',background:'#FFF8E1',border:'none',cursor:'pointer' }}>
              <p style={{ fontSize:20,fontWeight:800,color:'#F57F17',margin:0 }}>{terlambat}</p>
              <p style={{ fontSize:11,fontWeight:600,color:'#F57F17',margin:0 }}>Terlambat</p>
            </button>
            <button onClick={()=>setShowBelumAbsen(true)} style={{ borderRadius:12,padding:10,textAlign:'center',background:'#FFEBEE',border:'none',cursor:'pointer' }}>
              <p style={{ fontSize:20,fontWeight:800,color:'#C62828',margin:0 }}>{belumAbsen}</p>
              <p style={{ fontSize:11,fontWeight:600,color:'#C62828',margin:0 }}>Belum Absen</p>
            </button>
          </div>
        </Card>
        <Card style={{ padding:16 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
            <p style={{ fontWeight:800,margin:0,fontSize:13 }}>Kehadiran {BNAME[chartBulan]} {chartTahun}</p>
            <div style={{ display:'flex',gap:6 }}>
              <select value={chartBulan} onChange={e=>setChartBulan(Number(e.target.value))} style={{ fontSize:11,border:'1px solid #e0e0e0',borderRadius:8,padding:'4px 6px',outline:'none' }}>
                {BNAME.map((b,i)=><option key={i} value={i}>{b}</option>)}
              </select>
              <select value={chartTahun} onChange={e=>setChartTahun(Number(e.target.value))} style={{ fontSize:11,border:'1px solid #e0e0e0',borderRadius:8,padding:'4px 6px',outline:'none' }}>
                {[2024,2025,2026].map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {/* Scrollable chart — bar per tanggal */}
          <div style={{ overflowX:'auto',paddingBottom:4 }}>
            <div style={{ display:'flex',alignItems:'flex-end',gap:4,height:72,minWidth:`${daysInMonth*22}px` }}>
              {kehadiranBulan.map(k=>{
                const isToday = k.tglStr===today
                const barH = k.isWeekend||k.isFuture ? 0 : Math.max(3, (k.v||0)*0.6)
                const barBg = k.isWeekend ? '#f0f0f0' : k.isFuture ? '#f5f5f5' : isToday ? '#E53935' : 'linear-gradient(180deg,#E53935,#F5A623)'
                return (
                  <div key={k.d} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:2,flex:'0 0 18px' }}>
                    <span style={{ fontSize:8,color:k.isWeekend||k.isFuture?'#ddd':isToday?'#E53935':'#aaa',fontWeight:isToday?800:400 }}>
                      {k.isWeekend||k.isFuture?'':k.v+'%'}
                    </span>
                    <div style={{ width:10,borderRadius:'3px 3px 0 0',background:barBg,height:`${barH}px`,transition:'height 0.2s' }}/>
                    <span style={{ fontSize:8,color:isToday?'#E53935':k.isWeekend?'#ddd':'#bbb',fontWeight:isToday?800:400 }}>{k.d}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <p style={{ fontSize:11,color:'#aaa',margin:'6px 0 0',textAlign:'center' }}>
            Rata-rata: <b style={{ color:'#E53935' }}>{workDays.length>0?`${avgKehadiran}%`:'-'}</b> · {workDays.length} hari kerja
          </p>
        </Card>
      </div>

      {showHadir && (
        <Modal title={`Hadir — ${today}`} onClose={()=>setShowHadir(false)} wide>
          {hadirList.length===0
            ? <p style={{ textAlign:'center',color:'#aaa',fontSize:13,padding:16 }}>Belum ada yang hadir hari ini</p>
            : <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                <p style={{ fontSize:12,color:'#aaa',margin:'0 0 4px' }}>{hadirList.length} karyawan hadir:</p>
                {hadirList.map((a,i)=>{ const k=dbData.karyawan.find(x=>x.nip===a.nip); return (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#F0FFF4',borderRadius:12,border:'1px solid #C8E6C9' }}>
                    <Avatar fotoProfil={k?.foto_profil} nama={a.nama} size={36} fontSize={15}/>
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700,fontSize:13,margin:0,color:'#2E7D32' }}>{a.nama}</p>
                      <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{a.nip} · {k?.jabatan||'-'}</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:12,fontWeight:700,color:'#2E7D32',margin:0 }}>🟢 {a.jam_masuk}</p>
                      {a.jam_keluar && <p style={{ fontSize:11,color:'#aaa',margin:0 }}>out {a.jam_keluar}</p>}
                    </div>
                  </div>
                )})}
              </div>
          }
        </Modal>
      )}

      {showTerlambat && (
        <Modal title={`Terlambat — ${today}`} onClose={()=>setShowTerlambat(false)} wide>
          {terlambatList.length===0
            ? <p style={{ textAlign:'center',color:'#aaa',fontSize:13,padding:16 }}>Tidak ada yang terlambat hari ini 🎉</p>
            : <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                <p style={{ fontSize:12,color:'#aaa',margin:'0 0 4px' }}>{terlambatList.length} karyawan terlambat:</p>
                {terlambatList.map((a,i)=>{ const k=dbData.karyawan.find(x=>x.nip===a.nip); return (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#FFF8E1',borderRadius:12,border:'1px solid #FFE082' }}>
                    <Avatar fotoProfil={k?.foto_profil} nama={a.nama} size={36} fontSize={15}/>
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700,fontSize:13,margin:0,color:'#E65100' }}>{a.nama}</p>
                      <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{a.nip} · {k?.jabatan||'-'}</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:12,fontWeight:700,color:'#E65100',margin:0 }}>⏰ {a.jam_masuk}</p>
                      <p style={{ fontSize:11,color:'#aaa',margin:0 }}>+{a.menit_terlambat} menit</p>
                    </div>
                  </div>
                )})}
              </div>
          }
        </Modal>
      )}

      {showBelumAbsen && (
        <Modal title={`Belum Absen — ${today}`} onClose={()=>setShowBelumAbsen(false)} wide>
          {belumAbsenList.length===0
            ? <p style={{ textAlign:'center',color:'#aaa',fontSize:13,padding:16 }}>Semua karyawan sudah absen ✅</p>
            : <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                <p style={{ fontSize:12,color:'#aaa',margin:'0 0 4px' }}>{belumAbsenList.length} karyawan belum absen:</p>
                {belumAbsenList.map((k,i)=>(
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#FFF5F5',borderRadius:12,border:'1px solid #FFCDD2' }}>
                    <Avatar fotoProfil={k?.foto_profil} nama={k.nama} size={36} fontSize={15}/>
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700,fontSize:13,margin:0,color:'#C62828' }}>{k.nama}</p>
                      <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{k.nip} · {k.jabatan||'-'}</p>
                    </div>
                    <span style={{ fontSize:18 }}>❌</span>
                  </div>
                ))}
              </div>
          }
        </Modal>
      )}
    </div>
  )
}

const HRDKaryawan = ({ user, showToast, dbData, refreshData }) => {
  const [search, setSearch] = useState('')
  const [filterDiv, setFilterDiv] = useState('Semua')
  const [selectedNIP, setSelectedNIP] = useState(null)
  const [detailTab, setDetailTab] = useState('Info')
  const [attBulan, setAttBulan] = useState(new Date().getMonth())
  const [attTahun, setAttTahun] = useState(new Date().getFullYear())
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ NIP:'',Nama:'',Jabatan:'',Divisi:'',Email:'',NoHP:'' })
  const [confirmDel, setConfirmDel] = useState(false)
  const [loadingSave, setLoadingSave] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const fotoProfRef = useRef(null)

  const uploadFotoProfil = async(file) => {
    if(!selectedNIP||!file) return
    if(file.size>3*1024*1024){ showToast('❌ Ukuran foto maksimal 3MB'); return }
    setUploadingFoto(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `profil/${selectedNIP}.${ext}`

      // Konversi File → base64 → Uint8Array (sama persis dengan uploadFoto absensi)
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result)
        reader.onerror = () => rej(new Error('Gagal baca file'))
        reader.readAsDataURL(file)
      })
      const b64data = base64.split(',')[1]
      const bin = atob(b64data)
      const bytes = new Uint8Array(bin.length)
      for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i)

      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
      const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/foto-profil/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: bytes,
      })

      if(!res.ok){
        const errText = await res.text().catch(()=>'')
        console.error('[foto-profil] upload error:', res.status, errText)
        showToast('❌ Gagal upload: '+res.status)
        setUploadingFoto(false); return
      }

      // Simpan URL bersih tanpa timestamp ke DB
      const fotoUrl = `${SUPABASE_URL}/storage/v1/object/public/foto-profil/${path}`
      await supabase.from('master_karyawan').update({ foto_profil: fotoUrl }).eq('nip', selectedNIP)
      showToast('✅ Foto profil diperbarui!')
      refreshData()
    } catch(e){ console.error('[foto-profil]', e); showToast('❌ Error: '+e.message) }
    setUploadingFoto(false)
  }

  const divisiList = ['Semua',...new Set(dbData.karyawan.map(k=>k.divisi).filter(Boolean))]
  const filtered = dbData.karyawan.filter(k=>(filterDiv==='Semua'||k.divisi===filterDiv)&&(!search||k.nama?.toLowerCase().includes(search.toLowerCase())||k.nip?.includes(search)))
  const emp = selectedNIP ? dbData.karyawan.find(k=>k.nip===selectedNIP) : null
  const empAtt = emp ? dbData.attendance.filter(a=>{ const d=new Date(a.tanggal); return a.nip===emp.nip&&d.getMonth()===attBulan&&d.getFullYear()===attTahun }) : []
  const empPayroll = emp ? calcPayroll(emp,empAtt) : null
  const empIzin = emp ? dbData.izin.filter(c=>c.nip===emp.nip) : []

  const saveEdit = async()=>{
    setLoadingSave(true)
    const hariList = ['senin','selasa','rabu','kamis','jumat','sabtu']
    const jadwalUpdate = {}
    hariList.forEach(h=>{
      jadwalUpdate[`jam_masuk_${h}`]  = editForm[`jam_masuk_${h}`]  || emp.jam_masuk_wajib  || '08:00'
      jadwalUpdate[`jam_keluar_${h}`] = editForm[`jam_keluar_${h}`] || emp.jam_keluar_wajib || '16:40'
    })
    const {error} = await supabase.from('master_karyawan').update({
      nama:editForm.nama, email:editForm.email, no_hp:editForm.no_hp,
      jabatan:editForm.jabatan, divisi:editForm.divisi, status:editForm.status,
      sisa_izin:Number(editForm.sisa_izin)||0, nik:editForm.nik, alamat:editForm.alamat, atasan:editForm.atasan,
      jam_masuk_wajib: jadwalUpdate.jam_masuk_senin,    // backward-compat default
      jam_keluar_wajib: jadwalUpdate.jam_keluar_senin,
      ...jadwalUpdate,
      gaji_pokok:Number(editForm.gaji_pokok)||0, tunjangan_jabatan:Number(editForm.tunjangan_jabatan)||0,
      tunjangan_transport:Number(editForm.tunjangan_transport)||0, tunjangan_makan:Number(editForm.tunjangan_makan)||0,
      bpjs_kesehatan:Number(editForm.bpjs_kesehatan)||0, bpjs_ketenagakerjaan:Number(editForm.bpjs_ketenagakerjaan)||0, pph21:Number(editForm.pph21)||0,
    }).eq('nip',selectedNIP)
    if(!error){ await supabase.from('audit_log').insert({ user_name:user.nama,nip:user.nip,aktivitas:`Edit data ${emp?.nama}`,keterangan:'' }); showToast('✅ Data disimpan!'); setEditMode(false); refreshData() }
    else { console.error(error); showToast('❌ Gagal menyimpan') }
    setLoadingSave(false)
  }

  const deleteKaryawan = async()=>{
    await supabase.from('master_karyawan').delete().eq('nip',selectedNIP)
    await supabase.from('users').delete().eq('nip',selectedNIP)
    await supabase.from('audit_log').insert({ user_name:user.nama,nip:user.nip,aktivitas:`Hapus karyawan ${emp?.nama}`,keterangan:'' })
    showToast('✅ Dihapus!'); setSelectedNIP(null); setConfirmDel(false); refreshData()
  }

  const [addRole, setAddRole] = useState('EMPLOYEE')

  const handleAdd = async()=>{
    if(!addForm.NIP||!addForm.Nama){showToast('NIP dan Nama wajib');return}
    const {error:e1} = await supabase.from('users').insert({ nip:addForm.NIP,nama:addForm.Nama,email:addForm.Email,no_hp:addForm.NoHP,password:'password123',role:addRole,status:'aktif' })
    if(e1){showToast('❌ NIP sudah terdaftar');return}
    if (addRole === 'EMPLOYEE') {
      await supabase.from('master_karyawan').insert({
        nip:addForm.NIP,nama:addForm.Nama,jabatan:addForm.Jabatan,divisi:addForm.Divisi,email:addForm.Email,no_hp:addForm.NoHP,status:'aktif',
        sisa_izin:2, gaji_pokok:5000000,tunjangan_jabatan:1000000,tunjangan_transport:500000,tunjangan_makan:750000,
        bpjs_kesehatan:150000,bpjs_ketenagakerjaan:200000,pph21:1050000,tanggal_masuk:new Date().toISOString().split('T')[0],
        atasan:user.nama,lembur_per_jam:45000,potongan_terlambat_per_menit:5000,
        jam_masuk_wajib:'08:00',jam_keluar_wajib:'16:40',
        jam_masuk_senin:'08:00',jam_keluar_senin:'16:40',
        jam_masuk_selasa:'08:00',jam_keluar_selasa:'16:40',
        jam_masuk_rabu:'08:00',jam_keluar_rabu:'16:40',
        jam_masuk_kamis:'08:00',jam_keluar_kamis:'16:40',
        jam_masuk_jumat:'08:00',jam_keluar_jumat:'16:40',
        jam_masuk_sabtu:'08:00',jam_keluar_sabtu:'16:40',
      })
    }
    await supabase.from('audit_log').insert({ user_name:user.nama,nip:user.nip,aktivitas:`Tambah akun ${addRole==='HRD'?'HRD':'karyawan'}: ${addForm.Nama}`,keterangan:`NIP ${addForm.NIP}` })
    showToast(`✅ Akun ${addRole==='HRD'?'HRD':'karyawan'} ditambahkan!`)
    setShowAdd(false)
    setAddForm({ NIP:'',Nama:'',Jabatan:'',Divisi:'',Email:'',NoHP:'' })
    setAddRole('EMPLOYEE')
    refreshData()
  }

  const efv = k => <input value={editForm[k]??''} onChange={e=>setEditForm({...editForm,[k]:e.target.value})} style={{ flex:1,border:'1px solid #F5A623',borderRadius:8,padding:'4px 8px',fontSize:13,outline:'none',textAlign:'right' }}/>

  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'24px 16px 12px' }}>
        <div><h1 style={{ fontWeight:800,fontSize:18,margin:0 }}>Karyawan</h1><p style={{ fontSize:11,color:'#aaa',margin:0 }}>Manajemen data karyawan</p></div>
        <button onClick={()=>setShowAdd(true)} style={{ background:'linear-gradient(135deg,#E53935,#F5A623)',color:'white',border:'none',borderRadius:10,padding:'8px 14px',fontWeight:700,fontSize:13,cursor:'pointer' }}>+ Tambah</button>
      </div>
      <div style={{ padding:'0 16px',display:'flex',flexDirection:'column',gap:10 }}>
        <div style={{ display:'flex',alignItems:'center',background:'white',border:'1px solid #e0e0e0',borderRadius:14,padding:'10px 14px',gap:8 }}>
          <span style={{ color:'#aaa' }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama atau NIP..." style={{ flex:1,outline:'none',fontSize:13,border:'none',background:'transparent' }}/>
        </div>
        <div style={{ display:'flex',gap:8,overflowX:'auto',paddingBottom:4 }}>
          {divisiList.map(d=>(
            <button key={d} onClick={()=>setFilterDiv(d)} style={{ padding:'6px 14px',borderRadius:99,fontSize:12,fontWeight:700,border:'none',cursor:'pointer',whiteSpace:'nowrap',background:filterDiv===d?'linear-gradient(135deg,#E53935,#F5A623)':'white',color:filterDiv===d?'white':'#888' }}>{d}</button>
          ))}
        </div>
        {filtered.map(k=>(
          <Card key={k.nip} style={{ padding:16,display:'flex',alignItems:'center',gap:12,cursor:'pointer' }} onClick={()=>{ setSelectedNIP(k.nip); setDetailTab('Info'); setEditMode(false); setConfirmDel(false) }}>
            {k.foto_profil
              ? <img src={k.foto_profil} alt={k.nama} style={{ width:48,height:48,borderRadius:'50%',objectFit:'cover',flexShrink:0,border:'2px solid #f0f0f0' }} onError={e=>{ e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
              : null}
            <div style={{ width:48,height:48,borderRadius:'50%',background:'linear-gradient(135deg,#E53935,#F5A623)',display:k.foto_profil?'none':'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:18,flexShrink:0 }}>{k.nama?.[0]}</div>
            <div style={{ flex:1 }}>
              <p style={{ fontWeight:800,fontSize:14,margin:0 }}>{k.nama}</p>
              <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{k.nip} · {k.jabatan}</p>
              <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{k.divisi}</p>
            </div>
            <Chip status={k.status}/>
          </Card>
        ))}
        {filtered.length===0 && <p style={{ textAlign:'center',color:'#aaa',padding:32,fontSize:13 }}>Tidak ada karyawan</p>}
      </div>

      {emp && !confirmDel && (
        <Modal title="Detail Karyawan" onClose={()=>{ setSelectedNIP(null); setEditMode(false) }} wide>
          <div style={{ display:'flex',alignItems:'center',gap:16,marginBottom:16,padding:16,borderRadius:16,background:'linear-gradient(135deg,#FFF5F5,#FFF8E1)' }}>
            {/* Foto Profil — klik untuk ganti */}
            <div style={{ position:'relative',flexShrink:0 }}>
              {emp.foto_profil
                ? <img src={`${emp.foto_profil}?t=${Date.now()}`} alt={emp.nama} style={{ width:60,height:60,borderRadius:'50%',objectFit:'cover',border:'3px solid white',boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }} onError={e=>e.target.style.display='none'}/>
                : <div style={{ width:60,height:60,borderRadius:'50%',background:'linear-gradient(135deg,#E53935,#F5A623)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:800,fontSize:24 }}>{emp.nama?.[0]}</div>}
              <button onClick={()=>fotoProfRef.current?.click()} style={{ position:'absolute',bottom:0,right:0,width:20,height:20,borderRadius:'50%',background:'#E53935',border:'2px solid white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10 }}>📷</button>
              <input ref={fotoProfRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ const f=e.target.files[0]; if(f) uploadFotoProfil(f) }}/>
              {uploadingFoto && <div style={{ position:'absolute',inset:0,borderRadius:'50%',background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'white' }}>⏳</div>}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontWeight:800,fontSize:16,margin:'0 0 2px' }}>{emp.nama}</p>
              <p style={{ fontSize:12,color:'#888',margin:'0 0 6px' }}>{emp.nip} · {emp.jabatan}</p>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}><Chip status={emp.status}/><span style={{ fontSize:11,padding:'3px 10px',borderRadius:99,background:'#E3F2FD',color:'#1565C0',fontWeight:700 }}>{emp.divisi}</span></div>
            </div>
            {!editMode && (
              <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                <button onClick={()=>{ setEditForm({...emp}); setEditMode(true) }} style={{ background:'#FFF8E1',border:'none',borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:700,color:'#F57F17',cursor:'pointer' }}>✏️ Edit</button>
                <button onClick={()=>setConfirmDel(true)} style={{ background:'#FFF5F5',border:'none',borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:700,color:'#E53935',cursor:'pointer' }}>🗑️ Hapus</button>
              </div>
            )}
          </div>
          <div style={{ display:'flex',gap:8,marginBottom:12 }}>
            <select value={attBulan} onChange={e=>setAttBulan(Number(e.target.value))} style={{ flex:1,border:'1px solid #e0e0e0',borderRadius:10,padding:'8px 10px',fontSize:13,outline:'none' }}>{BNAME.map((b,i)=><option key={i} value={i}>{b}</option>)}</select>
            <select value={attTahun} onChange={e=>setAttTahun(Number(e.target.value))} style={{ width:80,border:'1px solid #e0e0e0',borderRadius:10,padding:'8px 10px',fontSize:13,outline:'none' }}>{[2024,2025,2026].map(y=><option key={y}>{y}</option>)}</select>
          </div>
          <div style={{ display:'flex',borderBottom:'1px solid #f0f0f0',marginBottom:12,overflowX:'auto' }}>
            {['Info','Absensi','Riwayat Izin','Payroll'].map(t=>(
              <button key={t} onClick={()=>{ setDetailTab(t); setEditMode(false) }} style={{ padding:'10px 14px',fontSize:12,fontWeight:700,border:'none',borderBottom:detailTab===t?'2px solid #E53935':'2px solid transparent',color:detailTab===t?'#E53935':'#aaa',background:'transparent',cursor:'pointer',whiteSpace:'nowrap' }}>{t}</button>
            ))}
          </div>

          {detailTab==='Info' && (
            <div>
              {editMode && <div style={{ background:'#FFF8E1',padding:'10px 14px',borderRadius:10,fontSize:12,color:'#F57F17',fontWeight:600,marginBottom:12 }}>Mode Edit aktif</div>}
              {[['NIP','nip'],['Nama','nama'],['NIK','nik'],['Email','email'],['No. HP','no_hp'],['Alamat','alamat'],['Divisi','divisi'],['Jabatan','jabatan'],['Tanggal Masuk','tanggal_masuk'],['Atasan','atasan'],['Sisa Izin Lainnya','sisa_izin'],['Status','status']].map(([lbl,k])=>(
                <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5',fontSize:13 }}>
                  <span style={{ color:'#aaa',flexShrink:0,width:130 }}>{lbl}</span>
                  {editMode&&k!=='nip'?efv(k):<span style={{ fontWeight:600,color:'#333',textAlign:'right',flex:1,marginLeft:8 }}>{emp[k]||'-'}</span>}
                </div>
              ))}
              {/* Jadwal Jam Kerja per Hari */}
              <div style={{ marginTop:16,padding:14,borderRadius:14,background:'#E8F5E9',border:'1px solid #C8E6C9' }}>
                <p style={{ fontSize:11,fontWeight:700,color:'#2E7D32',margin:'0 0 12px' }}>⏰ JADWAL KERJA PER HARI</p>
                {['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'].map(hari=>{
                  const keyMasuk  = `jam_masuk_${hari.toLowerCase()}`
                  const keyKeluar = `jam_keluar_${hari.toLowerCase()}`
                  const defMasuk  = emp.jam_masuk_wajib  || '08:00'
                  const defKeluar = emp.jam_keluar_wajib || '16:40'
                  return (
                    <div key={hari} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid #DCEDC8' }}>
                      <span style={{ width:60,fontSize:12,fontWeight:700,color:'#388E3C',flexShrink:0 }}>{hari}</span>
                      {editMode ? (
                        <>
                          <input type="time" value={editForm[keyMasuk] ?? defMasuk} onChange={e=>setEditForm({...editForm,[keyMasuk]:e.target.value})}
                            style={{ flex:1,border:'1px solid #F5A623',borderRadius:8,padding:'4px 6px',fontSize:12,outline:'none' }}/>
                          <span style={{ color:'#aaa',fontSize:11 }}>—</span>
                          <input type="time" value={editForm[keyKeluar] ?? defKeluar} onChange={e=>setEditForm({...editForm,[keyKeluar]:e.target.value})}
                            style={{ flex:1,border:'1px solid #F5A623',borderRadius:8,padding:'4px 6px',fontSize:12,outline:'none' }}/>
                        </>
                      ) : (
                        <span style={{ flex:1,textAlign:'right',fontSize:13,fontWeight:600,color:'#2E7D32' }}>
                          {emp[keyMasuk] ?? defMasuk} – {emp[keyKeluar] ?? defKeluar}
                        </span>
                      )}
                    </div>
                  )
                })}
                <p style={{ fontSize:11,color:'#81C784',margin:'8px 0 0' }}>Keterlambatan dihitung dari jam masuk sesuai hari tersebut</p>
                <p style={{ fontSize:10,color:'#A5D6A7',margin:'2px 0 0' }}>Minggu otomatis libur (tidak ada jadwal)</p>
              </div>
              {editMode && (
                <button onClick={()=>{
                  // Terapkan jam Senin ke semua hari kerja sekaligus
                  const m = editForm.jam_masuk_senin || emp.jam_masuk_wajib || '08:00'
                  const k = editForm.jam_keluar_senin || emp.jam_keluar_wajib || '16:40'
                  const upd = {}
                  ;['selasa','rabu','kamis','jumat','sabtu'].forEach(h=>{ upd[`jam_masuk_${h}`]=m; upd[`jam_keluar_${h}`]=k })
                  setEditForm({...editForm, ...upd, jam_masuk_senin:m, jam_keluar_senin:k})
                  showToast('✅ Jam Senin disalin ke semua hari')
                }} style={{ marginTop:8,width:'100%',padding:'8px 0',background:'#FFF8E1',border:'1px dashed #F5A623',borderRadius:10,fontSize:12,fontWeight:700,color:'#F57F17',cursor:'pointer' }}>
                  📋 Samakan semua hari dengan jam Senin
                </button>
              )}
              <div style={{ marginTop:16,padding:14,borderRadius:14,background:'#F9F9F9' }}>
                <p style={{ fontSize:11,fontWeight:700,color:'#aaa',margin:'0 0 10px' }}>INFO GAJI</p>
                {[['Gaji Pokok','gaji_pokok'],['Tunjangan Jabatan','tunjangan_jabatan'],['Tunjangan Transport','tunjangan_transport'],['Tunjangan Makan','tunjangan_makan'],['BPJS Kesehatan','bpjs_kesehatan'],['BPJS Ketenagakerjaan','bpjs_ketenagakerjaan'],['PPh 21','pph21']].map(([lbl,k])=>(
                  <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #f0f0f0',fontSize:12 }}>
                    <span style={{ color:'#777' }}>{lbl}</span>
                    {editMode?efv(k):<span style={{ fontWeight:600,color:'#333' }}>{formatRp(emp[k]||0)}</span>}
                  </div>
                ))}
              </div>
              {editMode && <div style={{ marginTop:16,display:'flex',gap:8 }}>
                <BtnGrad small color="green" onClick={saveEdit} disabled={loadingSave}>{loadingSave?'Menyimpan...':'💾 Simpan'}</BtnGrad>
                <BtnGrad small outline onClick={()=>setEditMode(false)}>Batal</BtnGrad>
              </div>}
            </div>
          )}

          {detailTab==='Absensi' && (
            <div>
              {empPayroll && <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12 }}>
                {[['Hadir',empPayroll.hadir,'#E8F5E9','#2E7D32'],['Terlambat',empPayroll.terlambat,'#FFF8E1','#F57F17'],['Alpha',empPayroll.alpha,'#FFEBEE','#C62828']].map(([l,v,bg,c])=>(
                  <div key={l} style={{ borderRadius:10,padding:10,textAlign:'center',background:bg }}><p style={{ fontSize:16,fontWeight:800,color:c,margin:0 }}>{v}</p><p style={{ fontSize:11,color:c,margin:0 }}>{l}</p></div>
                ))}
              </div>}
              {empAtt.length===0?<p style={{ textAlign:'center',color:'#aaa',padding:24,fontSize:13 }}>Tidak ada data</p>
              :empAtt.map((a,i)=>(
                <div key={i} style={{ border:'1px solid #f0f0f0',borderRadius:14,padding:12,marginBottom:8 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                    <span style={{ fontWeight:700,fontSize:13 }}>{a.tanggal}</span>
                    <Chip status={a.status_kehadiran}/>
                  </div>
                  {a.jam_masuk && <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:8 }}>
                    {[['Masuk',a.jam_masuk,'#E8F5E9','#2E7D32'],['Pulang',a.jam_keluar||'-','#FFF5F5','#C62828'],['Durasi',a.durasi||'-','#F5F5F5','#555']].map(([l,v,bg,c])=>(
                      <div key={l} style={{ background:bg,borderRadius:8,padding:8,textAlign:'center' }}><p style={{ fontSize:10,color:'#aaa',margin:0 }}>{l}</p><p style={{ fontWeight:700,fontSize:12,color:c,margin:0 }}>{v}</p></div>
                    ))}
                  </div>}
                  {/* Foto & Lokasi */}
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                    {/* Clock In */}
                    <div style={{ background:'#F0FFF4',borderRadius:10,padding:10 }}>
                      <p style={{ fontSize:10,fontWeight:700,color:'#2E7D32',margin:'0 0 6px' }}>🟢 Clock In</p>
                      {a.foto_masuk && (
                        <a href={a.foto_masuk} target="_blank" rel="noreferrer">
                          <img
                            src={a.foto_masuk}
                            alt="masuk"
                            style={{ width:'100%',borderRadius:8,maxHeight:80,objectFit:'cover',display:'block',marginBottom:6,background:'#ddd' }}
                            onError={(e)=>{
                              console.error('[img] gagal load foto_masuk:', a.foto_masuk)
                              e.target.style.display='none'
                              e.target.nextSibling.style.display='block'
                            }}
                          />
                          <p style={{ fontSize:9,color:'#E53935',margin:'0 0 4px',display:'none',wordBreak:'break-all' }}>⚠️ Gagal load: {a.foto_masuk?.slice(0,40)}...</p>
                        </a>
                      )}
                      {a.lokasi_masuk && <p style={{ fontSize:10,color:'#388E3C',margin:0,lineHeight:1.3 }}>📍 {a.lokasi_masuk}</p>}
                      {a.koordinat_masuk && (
                        <a href={`https://maps.google.com/?q=${a.koordinat_masuk}`} target="_blank" rel="noreferrer" style={{ fontSize:10,color:'#1565C0',fontWeight:700,display:'block',marginTop:4 }}>🗺️ Lihat Maps</a>
                      )}
                      {!a.foto_masuk && !a.lokasi_masuk && <p style={{ fontSize:10,color:'#ccc',margin:0 }}>Tidak ada data</p>}
                    </div>
                    {/* Clock Out */}
                    <div style={{ background:'#FFF5F5',borderRadius:10,padding:10 }}>
                      <p style={{ fontSize:10,fontWeight:700,color:'#C62828',margin:'0 0 6px' }}>🔴 Clock Out</p>
                      {a.foto_keluar && (
                        <a href={a.foto_keluar} target="_blank" rel="noreferrer">
                          <img src={a.foto_keluar} alt="keluar" style={{ width:'100%',borderRadius:8,maxHeight:80,objectFit:'cover',display:'block',marginBottom:6 }}/>
                        </a>
                      )}
                      {a.lokasi_keluar && <p style={{ fontSize:10,color:'#C62828',margin:0,lineHeight:1.3 }}>📍 {a.lokasi_keluar}</p>}
                      {a.koordinat_keluar && (
                        <a href={`https://maps.google.com/?q=${a.koordinat_keluar}`} target="_blank" rel="noreferrer" style={{ fontSize:10,color:'#1565C0',fontWeight:700,display:'block',marginTop:4 }}>🗺️ Lihat Maps</a>
                      )}
                      {!a.foto_keluar && !a.lokasi_keluar && <p style={{ fontSize:10,color:'#ccc',margin:0 }}>{a.jam_keluar?'Tidak ada data':'Belum clock out'}</p>}
                    </div>
                  </div>
                  {a.menit_terlambat>0 && (
                    <div style={{ marginTop:8,padding:'8px 12px',background:'#FFEBEE',borderRadius:10,border:'1px solid #FFCDD2',display:'flex',alignItems:'center',gap:8 }}>
                      <span style={{ fontSize:16 }}>⏰</span>
                      <span style={{ fontSize:12,fontWeight:700,color:'#C62828' }}>Terlambat {a.menit_terlambat} menit</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {detailTab==='Riwayat Izin' && (
            <div>
              {empIzin.length===0?<p style={{ textAlign:'center',color:'#aaa',padding:24,fontSize:13 }}>Tidak ada riwayat izin</p>
              :empIzin.map((c,i)=>(
                <div key={i} style={{ border:'1px solid #f0f0f0',borderRadius:14,padding:12,marginBottom:8 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6 }}><span style={{ fontWeight:700,fontSize:13 }}>{c.jenis_izin}</span><Chip status={c.status}/></div>
                  <p style={{ fontSize:12,color:'#888',margin:0 }}>{c.tanggal_mulai} – {c.tanggal_selesai} · {c.jumlah_hari} hari</p>
                  <p style={{ fontSize:12,color:'#aaa',margin:'4px 0 0' }}>{c.keterangan}</p>
                </div>
              ))}
            </div>
          )}

          {detailTab==='Payroll' && empPayroll && (
            <div>
              <div style={{ borderRadius:14,padding:16,background:'linear-gradient(135deg,#FFF8E1,#FFF3CD)',marginBottom:14 }}>
                <p style={{ fontSize:11,color:'#888',margin:0 }}>Take Home Pay · {BNAME[attBulan]} {attTahun}</p>
                <p style={{ fontSize:24,fontWeight:800,color:'#E53935',margin:'4px 0 2px' }}>{formatRp(empPayroll.takeHomePay)}</p>
              </div>
              {[['Gaji Pokok',emp.gaji_pokok||0],['Tunjangan Jabatan',emp.tunjangan_jabatan||0],['Tunjangan Transport',emp.tunjangan_transport||0],['Tunjangan Makan',emp.tunjangan_makan||0],['Bonus Lembur',empPayroll.bonusLembur]].map(([k,v])=>(
                <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f5f5f5',fontSize:13 }}><span style={{ color:'#777' }}>{k}</span><span style={{ color:'#43A047',fontWeight:600 }}>+{formatRp(v)}</span></div>
              ))}
              <div style={{ display:'flex',justifyContent:'space-between',padding:'6px 0 12px',fontSize:13,fontWeight:700 }}><span style={{ color:'#43A047' }}>Total Penghasilan</span><span style={{ color:'#43A047' }}>{formatRp(empPayroll.totalPenghasilan)}</span></div>
              {[['BPJS Kesehatan',emp.bpjs_kesehatan||0],['BPJS Ketenagakerjaan',emp.bpjs_ketenagakerjaan||0],['PPh 21',emp.pph21||0],['Potongan Terlambat',empPayroll.potTerlambat],['Potongan Alpha',empPayroll.potAlpha]].map(([k,v])=>(
                <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f5f5f5',fontSize:13 }}><span style={{ color:'#777' }}>{k}</span><span style={{ color:'#E53935',fontWeight:600 }}>-{formatRp(v)}</span></div>
              ))}
              <div style={{ display:'flex',justifyContent:'space-between',padding:'8px 0 12px',fontSize:13,fontWeight:700 }}><span style={{ color:'#E53935' }}>Total Potongan</span><span style={{ color:'#E53935' }}>-{formatRp(empPayroll.totalPotongan)}</span></div>
              <div style={{ borderRadius:12,padding:14,background:'#FFF8E1',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                <span style={{ fontWeight:800,fontSize:14 }}>Take Home Pay</span>
                <span style={{ fontWeight:800,fontSize:18,color:'#F5A623' }}>{formatRp(empPayroll.takeHomePay)}</span>
              </div>
            </div>
          )}
        </Modal>
      )}

      {confirmDel && emp && (
        <Modal title="Hapus Karyawan" onClose={()=>setConfirmDel(false)}>
          <div style={{ textAlign:'center',padding:'16px 0' }}>
            <div style={{ fontSize:48,marginBottom:12 }}>⚠️</div>
            <p style={{ fontWeight:700,fontSize:16,margin:'0 0 8px' }}>Hapus {emp.nama}?</p>
            <p style={{ fontSize:13,color:'#888',marginBottom:24 }}>Tindakan ini tidak dapat dibatalkan.</p>
            <div style={{ display:'flex',gap:10 }}>
              <BtnGrad outline onClick={()=>setConfirmDel(false)}>Batal</BtnGrad>
              <BtnGrad onClick={deleteKaryawan}>🗑️ Hapus</BtnGrad>
            </div>
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal title="Tambah Akun Baru" onClose={()=>{ setShowAdd(false); setAddRole('EMPLOYEE') }}>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:8 }}>Jenis Akun</label>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
              {[['EMPLOYEE','👤','Karyawan'],['HRD','🧑‍💼','HRD']].map(([r,icon,lbl])=>(
                <button key={r} onClick={()=>setAddRole(r)} style={{ padding:'12px 8px',borderRadius:12,border:`2px solid ${addRole===r?'#E53935':'#e0e0e0'}`,background:addRole===r?'#FFF5F5':'white',cursor:'pointer',fontWeight:700,fontSize:13,color:addRole===r?'#E53935':'#888' }}>
                  {icon}<br/><span style={{ fontSize:12 }}>{lbl}</span>
                </button>
              ))}
            </div>
          </div>
          {['NIP','Nama'].map(k=>(
            <div key={k} style={{ marginBottom:10 }}>
              <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>{k}</label>
              <input value={addForm[k]} onChange={e=>setAddForm({...addForm,[k]:e.target.value})} placeholder={k==='NIP'?'Bebas, mis: 30001':k} style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>
            </div>
          ))}
          {addRole==='EMPLOYEE' && ['Jabatan','Divisi'].map(k=>(
            <div key={k} style={{ marginBottom:10 }}>
              <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>{k}</label>
              <input value={addForm[k]} onChange={e=>setAddForm({...addForm,[k]:e.target.value})} placeholder={k} style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>
            </div>
          ))}
          {['Email','NoHP'].map(k=>(
            <div key={k} style={{ marginBottom:10 }}>
              <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>{k}</label>
              <input value={addForm[k]} onChange={e=>setAddForm({...addForm,[k]:e.target.value})} placeholder={k} style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>
            </div>
          ))}
          <p style={{ fontSize:11,color:'#aaa',margin:'0 0 12px' }}>Password default: <strong>password123</strong></p>
          <BtnGrad onClick={handleAdd}>Tambah Akun {addRole==='HRD'?'HRD':'Karyawan'}</BtnGrad>
        </Modal>
      )}
    </div>
  )
}

// ─── HRD ABSENSI ──────────────────────────────────────────────────────────────
const HRDAbsensi = ({ user, showToast, dbData, refreshData }) => {
  const [tanggal, setTanggal] = useState(()=>{
    const w = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jakarta'}))
    return `${w.getFullYear()}-${String(w.getMonth()+1).padStart(2,'0')}-${String(w.getDate()).padStart(2,'0')}`
  })
  const [search, setSearch] = useState('')
  const [fotoModal, setFotoModal] = useState(null)
  const [showBelumAbsen, setShowBelumAbsen] = useState(false)
  const [showHadir, setShowHadir] = useState(false)
  const [showTerlambat, setShowTerlambat] = useState(false)

  const records = dbData.attendance.filter(a=>{
    const matchDate = a.tanggal===tanggal
    const matchSearch = !search||a.nama?.toLowerCase().includes(search.toLowerCase())||a.nip?.includes(search)
    return matchDate&&matchSearch
  })

  const hadirList      = records.filter(a=>['HADIR','WFH'].includes(a.status_kehadiran))
  const terlambatList  = records.filter(a=>a.status_kehadiran==='TERLAMBAT')
  const hadir          = hadirList.length
  const terlambat      = terlambatList.length

  // Karyawan yang BELUM absen sama sekali (tidak ada record di tanggal itu)
  const sudahAbsenNip = new Set(dbData.attendance.filter(a=>a.tanggal===tanggal).map(a=>a.nip))
  const semuaKaryawan = dbData.karyawan.filter(k=>k.role!=='hrd')
  const belumAbsenList = semuaKaryawan.filter(k=>!sudahAbsenNip.has(k.nip)&&(!search||k.nama?.toLowerCase().includes(search.toLowerCase())||k.nip?.includes(search)))
  const belumAbsen = belumAbsenList.length

  const formatTgl  = tgl=>{ if(!tgl) return '-'; const d=new Date(tgl); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}` }

  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ padding:'24px 16px 12px' }}>
        <h1 style={{ fontWeight:800,fontSize:18,margin:0 }}>Absensi</h1>
        <p style={{ fontSize:11,color:'#aaa',margin:0 }}>Monitoring kehadiran harian</p>
      </div>
      <div style={{ padding:'0 16px',display:'flex',flexDirection:'column',gap:10 }}>
        <input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} style={{ width:'100%',background:'white',border:'1px solid #e0e0e0',borderRadius:14,padding:'12px 14px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>

        {/* Statistik 3 kotak */}
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10 }}>
          <button onClick={()=>setShowHadir(true)} style={{ borderRadius:14,padding:12,textAlign:'center',background:'#E8F5E9',border:'none',cursor:'pointer' }}>
            <p style={{ fontSize:22,fontWeight:800,color:'#2E7D32',margin:0 }}>{hadir}</p>
            <p style={{ fontSize:11,fontWeight:600,color:'#2E7D32',margin:0 }}>Hadir</p>
          </button>
          <button onClick={()=>setShowTerlambat(true)} style={{ borderRadius:14,padding:12,textAlign:'center',background:'#FFF8E1',border:'none',cursor:'pointer' }}>
            <p style={{ fontSize:22,fontWeight:800,color:'#F57F17',margin:0 }}>{terlambat}</p>
            <p style={{ fontSize:11,fontWeight:600,color:'#F57F17',margin:0 }}>Terlambat</p>
          </button>
          {/* Belum Absen — bisa diklik untuk lihat siapa saja */}
          <button onClick={()=>setShowBelumAbsen(true)} style={{ borderRadius:14,padding:12,textAlign:'center',background:'#FFEBEE',border:'none',cursor:'pointer' }}>
            <p style={{ fontSize:22,fontWeight:800,color:'#C62828',margin:0 }}>{belumAbsen}</p>
            <p style={{ fontSize:11,fontWeight:600,color:'#C62828',margin:0 }}>Belum Absen</p>
          </button>
        </div>

        <div style={{ display:'flex',alignItems:'center',background:'white',border:'1px solid #e0e0e0',borderRadius:14,padding:'10px 14px',gap:8 }}>
          <span style={{ color:'#aaa' }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama atau NIP..." style={{ flex:1,outline:'none',fontSize:13,border:'none',background:'transparent' }}/>
        </div>

        {records.length===0
          ? <Card style={{ padding:32,textAlign:'center' }}><p style={{ color:'#aaa',fontSize:13,margin:0 }}>Tidak ada data absensi untuk tanggal ini</p></Card>
          : records.map((a,i)=>{
              const empData = dbData.karyawan.find(k=>k.nip===a.nip)
              return (
                <Card key={i} style={{ padding:16 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:12 }}>
                    <Avatar fotoProfil={dbData.karyawan.find(x=>x.nip===a.nip)?.foto_profil} nama={a.nama} size={44} fontSize={18}/>
                    <div style={{ flex:1 }}><p style={{ fontWeight:700,fontSize:14,margin:0 }}>{a.nama}</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>{empData?.jabatan||''}</p></div>
                    <Chip status={a.status_kehadiran}/>
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                    <div style={{ background:'#F0FFF4',borderRadius:12,padding:12 }}>
                      <p style={{ fontSize:11,color:'#aaa',margin:'0 0 4px',fontWeight:600 }}>🟢 Clock In</p>
                      <p style={{ fontSize:13,fontWeight:700,color:'#2E7D32',margin:0 }}>{a.jam_masuk?`${formatTgl(a.tanggal)} ${a.jam_masuk}`:'-'}</p>
                      {a.lokasi_masuk && <div style={{ display:'flex',alignItems:'flex-start',gap:4,marginTop:4 }}><span style={{ fontSize:10,flexShrink:0,marginTop:1 }}>📍</span><span style={{ fontSize:10,color:'#388E3C',lineHeight:1.3 }}>{a.lokasi_masuk}</span></div>}
                      {a.koordinat_masuk && <a href={`https://www.google.com/maps?q=${a.koordinat_masuk}`} target="_blank" rel="noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:4,marginTop:6,fontSize:10,color:'#1565C0',fontWeight:600,textDecoration:'none',background:'#E3F2FD',padding:'3px 8px',borderRadius:6 }}>🗺️ Lihat Maps</a>}
                      {a.foto_masuk
                        ? <img onClick={()=>setFotoModal({url:a.foto_masuk,label:'Foto Clock In',lokasi:a.lokasi_masuk,coords:a.koordinat_masuk})}
                            src={a.foto_masuk} alt="masuk"
                            style={{ width:'100%',borderRadius:10,maxHeight:90,objectFit:'cover',display:'block',marginTop:6,cursor:'pointer',border:'2px solid #C8E6C9' }}
                            onError={e=>e.target.style.display='none'}/>
                        : <p style={{ fontSize:10,color:'#ccc',marginTop:6,margin:0 }}>Tidak ada foto</p>}
                    </div>
                    <div style={{ background:'#FFF5F5',borderRadius:12,padding:12 }}>
                      <p style={{ fontSize:11,color:'#aaa',margin:'0 0 4px',fontWeight:600 }}>🔴 Clock Out</p>
                      <p style={{ fontSize:13,fontWeight:700,color:a.jam_keluar?'#C62828':'#aaa',margin:0 }}>{a.jam_keluar?`${formatTgl(a.tanggal)} ${a.jam_keluar}`:'Belum clock out'}</p>
                      {a.lokasi_keluar && <div style={{ display:'flex',alignItems:'flex-start',gap:4,marginTop:4 }}><span style={{ fontSize:10,flexShrink:0,marginTop:1 }}>📍</span><span style={{ fontSize:10,color:'#C62828',lineHeight:1.3 }}>{a.lokasi_keluar}</span></div>}
                      {a.koordinat_keluar && <a href={`https://www.google.com/maps?q=${a.koordinat_keluar}`} target="_blank" rel="noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:4,marginTop:6,fontSize:10,color:'#1565C0',fontWeight:600,textDecoration:'none',background:'#E3F2FD',padding:'3px 8px',borderRadius:6 }}>🗺️ Lihat Maps</a>}
                      {a.foto_keluar
                        ? <img onClick={()=>setFotoModal({url:a.foto_keluar,label:'Foto Clock Out',lokasi:a.lokasi_keluar,coords:a.koordinat_keluar})}
                            src={a.foto_keluar} alt="keluar"
                            style={{ width:'100%',borderRadius:10,maxHeight:90,objectFit:'cover',display:'block',marginTop:6,cursor:'pointer',border:'2px solid #FFCDD2' }}
                            onError={e=>e.target.style.display='none'}/>
                        : <p style={{ fontSize:10,color:'#ccc',marginTop:6,margin:0 }}>{a.jam_keluar?'Tidak ada foto':'Belum clock out'}</p>}
                    </div>
                  </div>
                  {a.menit_terlambat>0 && (
                    <div style={{ marginTop:10,padding:'10px 14px',background:'#FFEBEE',borderRadius:12,border:'1px solid #FFCDD2',display:'flex',alignItems:'center',gap:10 }}>
                      <span style={{ fontSize:20 }}>⏰</span>
                      <div>
                        <p style={{ fontSize:13,fontWeight:800,color:'#C62828',margin:0 }}>Terlambat {a.menit_terlambat} menit</p>
                        <p style={{ fontSize:10,color:'#E57373',margin:0 }}>Jam masuk: {a.jam_masuk}</p>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })
        }
      </div>

      {showHadir && (
        <Modal title={`Hadir — ${tanggal}`} onClose={()=>setShowHadir(false)} wide>
          {hadirList.length===0
            ? <p style={{ textAlign:'center',color:'#aaa',fontSize:13,padding:16 }}>Belum ada yang hadir di tanggal ini</p>
            : <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                <p style={{ fontSize:12,color:'#aaa',margin:'0 0 4px' }}>{hadirList.length} karyawan hadir:</p>
                {hadirList.map((a,i)=>{ const k=dbData.karyawan.find(x=>x.nip===a.nip); return (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#F0FFF4',borderRadius:12,border:'1px solid #C8E6C9' }}>
                    <Avatar fotoProfil={dbData.karyawan.find(x=>x.nip===a.nip)?.foto_profil} nama={a.nama} size={36} fontSize={15}/>
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700,fontSize:13,margin:0,color:'#2E7D32' }}>{a.nama}</p>
                      <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{a.nip} · {k?.jabatan||'-'}</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:12,fontWeight:700,color:'#2E7D32',margin:0 }}>🟢 {a.jam_masuk}</p>
                      {a.jam_keluar && <p style={{ fontSize:11,color:'#aaa',margin:0 }}>out {a.jam_keluar}</p>}
                    </div>
                  </div>
                )})}
              </div>
          }
        </Modal>
      )}

      {showTerlambat && (
        <Modal title={`Terlambat — ${tanggal}`} onClose={()=>setShowTerlambat(false)} wide>
          {terlambatList.length===0
            ? <p style={{ textAlign:'center',color:'#aaa',fontSize:13,padding:16 }}>Tidak ada yang terlambat di tanggal ini 🎉</p>
            : <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                <p style={{ fontSize:12,color:'#aaa',margin:'0 0 4px' }}>{terlambatList.length} karyawan terlambat:</p>
                {terlambatList.map((a,i)=>{ const k=dbData.karyawan.find(x=>x.nip===a.nip); return (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#FFF8E1',borderRadius:12,border:'1px solid #FFE082' }}>
                    <Avatar fotoProfil={dbData.karyawan.find(x=>x.nip===a.nip)?.foto_profil} nama={a.nama} size={36} fontSize={15}/>
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700,fontSize:13,margin:0,color:'#E65100' }}>{a.nama}</p>
                      <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{a.nip} · {k?.jabatan||'-'}</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:12,fontWeight:700,color:'#E65100',margin:0 }}>⏰ {a.jam_masuk}</p>
                      <p style={{ fontSize:11,color:'#aaa',margin:0 }}>+{a.menit_terlambat} menit</p>
                    </div>
                  </div>
                )})}
              </div>
          }
        </Modal>
      )}

      {/* Modal daftar karyawan belum absen */}
      {showBelumAbsen && (
        <Modal title={`Belum Absen — ${tanggal}`} onClose={()=>setShowBelumAbsen(false)} wide>
          {belumAbsenList.length===0
            ? <p style={{ textAlign:'center',color:'#aaa',fontSize:13,padding:16 }}>Semua karyawan sudah absen ✅</p>
            : <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                <p style={{ fontSize:12,color:'#aaa',margin:'0 0 4px' }}>{belumAbsenList.length} karyawan belum absen:</p>
                {belumAbsenList.map((k,i)=>(
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#FFF5F5',borderRadius:12,border:'1px solid #FFCDD2' }}>
                    <Avatar fotoProfil={k?.foto_profil} nama={k.nama} size={36} fontSize={15}/>
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700,fontSize:13,margin:0,color:'#C62828' }}>{k.nama}</p>
                      <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{k.nip} · {k.jabatan||'-'}</p>
                    </div>
                    <span style={{ fontSize:18 }}>❌</span>
                  </div>
                ))}
              </div>
          }
        </Modal>
      )}

      {fotoModal && (
        <Modal title={fotoModal.label} onClose={()=>setFotoModal(null)}>
          <img src={fotoModal.url} alt={fotoModal.label} style={{ width:'100%',borderRadius:14,objectFit:'cover',maxHeight:300 }}/>
          {fotoModal.lokasi && (
            <div style={{ marginTop:10,padding:'10px 14px',background:'#F0FFF4',borderRadius:12,border:'1px solid #C8E6C9' }}>
              <div style={{ display:'flex',alignItems:'flex-start',gap:6,marginBottom:fotoModal.coords?8:0 }}>
                <span style={{ fontSize:14,flexShrink:0 }}>📍</span>
                <span style={{ fontSize:13,color:'#2E7D32',fontWeight:600 }}>{fotoModal.lokasi}</span>
              </div>
              {fotoModal.coords && (
                <div style={{ display:'flex',gap:8 }}>
                  <span style={{ fontSize:11,color:'#aaa',fontFamily:'monospace' }}>{fotoModal.coords}</span>
                  <a href={`https://www.google.com/maps?q=${fotoModal.coords}`} target="_blank" rel="noreferrer" style={{ fontSize:11,color:'#1565C0',fontWeight:700,textDecoration:'none' }}>🗺️ Buka Maps</a>
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop:12 }}><BtnGrad onClick={()=>setFotoModal(null)}>Tutup</BtnGrad></div>
        </Modal>
      )}
    </div>
  )
}

// ─── HRD APPROVAL ─────────────────────────────────────────────────────────────
const HRDApproval = ({ user, showToast, dbData, refreshData }) => {
  const [tab, setTab] = useState('Semua')
  const [selectedItem, setSelectedItem] = useState(null)
  const [note, setNote] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const tabMap = { Semua:null, Menunggu:'MENUNGGU', Disetujui:'DISETUJUI', Ditolak:'DITOLAK' }
  const data = tab==='Semua' ? [...dbData.izin] : dbData.izin.filter(c=>c.status===tabMap[tab])
  const freshStatus = id => dbData.izin.find(x=>x.id===id)?.status

  const handleApproval = async(action)=>{
    if(!selectedItem) return
    setLoading(true)
    const {error} = await supabase.from('izin').update({
      status:action==='approve'?'DISETUJUI':'DITOLAK',
      approved_by:user.nama,
      approval_note:note||(action==='approve'?'Disetujui':'Ditolak')
    }).eq('id',selectedItem.id)
    if(!error){
      if(action==='approve'){
        const emp = dbData.karyawan.find(k=>k.nip===selectedItem.nip)
        // Jenis Izin Terlambat/Setengah/Lembur tidak kurangi sisa_izin
        // Hanya Izin Lainnya yang kurangi sisa_izin
        const IS_HARI_PENUH = selectedItem.jenis_izin === 'Izin Lainnya'
        if(emp && IS_HARI_PENUH) await supabase.from('master_karyawan').update({ sisa_izin:Math.max(0,(emp.sisa_izin??0)-selectedItem.jumlah_hari) }).eq('nip',selectedItem.nip)

        // Izin Terlambat disetujui → reset keterlambatan di rekap absensi hari itu
        if(selectedItem.jenis_izin === 'Izin Terlambat'){
          await supabase.from('attendance')
            .update({ menit_terlambat:0, status_kehadiran:'HADIR' })
            .eq('nip', selectedItem.nip)
            .eq('tanggal', selectedItem.tanggal_mulai)
          // Update Sheets juga (telat jadi 0)
          logToSheet('absensi', { NIP:selectedItem.nip, Tanggal:selectedItem.tanggal_mulai }, {
            NIP:selectedItem.nip, Nama:selectedItem.nama, Tanggal:selectedItem.tanggal_mulai,
            'Jam Masuk':'', 'Jam Keluar':'', 'Telat (menit)':0, 'Lebih(menit)':0, 'Foto Masuk':'', 'Foto Keluar':'',
          })
        }
      }
      await supabase.from('audit_log').insert({ user_name:user.nama,nip:user.nip,aktivitas:`${action==='approve'?'Setujui':'Tolak'} ${selectedItem.jenis_izin} ${selectedItem.nama}`,keterangan:`${selectedItem.tanggal_mulai}` })
      await supabase.from('notifications').insert({ nip:selectedItem.nip,type:'IZIN',message:`Pengajuan izin Anda ${action==='approve'?'disetujui':'ditolak'} oleh HRD` })
      // Update baris yang sama di Sheets (key = ID izin) dengan status terbaru
      logToSheet('izin', { ID: selectedItem.id }, {
        ID: selectedItem.id, NIP:selectedItem.nip, Nama:selectedItem.nama, 'Jenis Izin':selectedItem.jenis_izin,
        'Tanggal Mulai':selectedItem.tanggal_mulai, 'Tanggal Selesai':selectedItem.tanggal_selesai,
        'Jumlah Hari':selectedItem.jumlah_hari,
        Status: action==='approve'?'DISETUJUI':'DITOLAK',
        Lampiran: selectedItem.lampiran_drive_link || selectedItem.lampiran_url || '',
      })
      showToast(`✅ Izin ${action==='approve'?'disetujui':'ditolak'}!`)
      setSelectedItem(null); setNote(''); refreshData()
    } else showToast('❌ Gagal memproses')
    setLoading(false)
  }

  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ padding:'24px 16px 0' }}>
        <h1 style={{ fontWeight:800,fontSize:18,margin:0 }}>Approval Izin</h1>
        <p style={{ fontSize:11,color:'#aaa',margin:0 }}>Kelola pengajuan izin karyawan</p>
      </div>
      <div style={{ display:'flex',borderBottom:'1px solid #e0e0e0',background:'white',marginBottom:0 }}>
        {['Semua','Menunggu','Disetujui','Ditolak'].map(t=>(
          <button key={t} onClick={()=>{ setTab(t); setSelectedItem(null) }} style={{ flex:1,padding:'12px 0',fontSize:12,fontWeight:700,border:'none',borderBottom:tab===t?'2px solid #E53935':'2px solid transparent',color:tab===t?'#E53935':'#aaa',background:'transparent',cursor:'pointer' }}>{t}</button>
        ))}
      </div>
      <div style={{ padding:'12px 16px',display:'flex',flexDirection:'column',gap:10 }}>
        {data.length===0 ? <p style={{ textAlign:'center',color:'#aaa',padding:24,fontSize:13 }}>Tidak ada data</p>
        : data.map(c=>(
          <Card key={c.id} style={{ padding:16,cursor:'pointer' }} onClick={()=>{ setSelectedItem({...c}); setNote('') }}>
            <div style={{ display:'flex',alignItems:'center',gap:12 }}>
              {c.selfie_url
                ? <img src={c.selfie_url} alt="" style={{ width:48,height:48,borderRadius:'50%',objectFit:'cover',flexShrink:0,border:'2px solid #F5A623' }}/>
                : <Avatar fotoProfil={dbData.karyawan.find(x=>x.nip===c.nip)?.foto_profil} nama={c.nama} size={48} fontSize={18}/>}
              <div style={{ flex:1 }}>
                <p style={{ fontWeight:700,fontSize:14,margin:0 }}>{c.nama}</p>
                <p style={{ fontSize:12,color:'#888',margin:0 }}>{c.jabatan} · {c.jenis_izin}</p>
                <p style={{ fontSize:11,color:'#aaa',margin:0 }}>{c.tanggal_mulai} – {c.tanggal_selesai} · {c.jumlah_hari} hari</p>
              </div>
              <Chip status={freshStatus(c.id)||c.status}/>
            </div>
            {(freshStatus(c.id)||c.status)==='MENUNGGU' && (
              <div style={{ marginTop:12,padding:'8px 12px',background:'#FFF8E1',borderRadius:10,fontSize:12,color:'#F57F17',fontWeight:600 }}>
                📋 Diajukan {c.diajukan_pada} · Tap untuk review
              </div>
            )}
          </Card>
        ))}
      </div>

      {selectedItem && (
        <Modal title="Detail Pengajuan Izin" onClose={()=>{ setSelectedItem(null); setNote('') }} wide>
          {selectedItem.selfie_url && (
            <div style={{ marginBottom:16,borderRadius:14,overflow:'hidden',border:'2px solid #F5A623' }}>
              <p style={{ fontSize:11,fontWeight:700,color:'#F57F17',padding:'6px 12px',background:'#FFF8E1',margin:0 }}>📷 Selfie Pengajuan</p>
              <img src={selectedItem.selfie_url} alt="selfie" style={{ width:'100%',maxHeight:200,objectFit:'cover' }}/>
            </div>
          )}
          <div style={{ marginBottom:16 }}>
            {[['Nama',selectedItem.nama],['Jabatan',selectedItem.jabatan||'-'],['NIP',selectedItem.nip],['Jenis Izin',selectedItem.jenis_izin],['Tanggal Mulai',selectedItem.tanggal_mulai],['Tanggal Selesai',selectedItem.tanggal_selesai],['Durasi',`${selectedItem.jumlah_hari} hari`],['Alasan',selectedItem.keterangan],['Tanggal Pengajuan',selectedItem.diajukan_pada],['Status',selectedItem.status]].map(([k,v])=>(
              <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #f5f5f5',fontSize:13 }}>
                <span style={{ color:'#aaa',flexShrink:0 }}>{k}</span>
                <span style={{ fontWeight:600,color:'#333',textAlign:'right',maxWidth:'55%' }}>{v}</span>
              </div>
            ))}
          </div>

          {selectedItem.lampiran_nama && (
            <div style={{ marginBottom:16,border:'1px solid #e0e0e0',borderRadius:14,overflow:'hidden' }}>
              <p style={{ fontSize:11,fontWeight:700,color:'#1565C0',padding:'8px 14px',background:'#E3F2FD',margin:0 }}>📎 Lampiran: {selectedItem.lampiran_nama}</p>
              {selectedItem.lampiran_url
                ? <div style={{ padding:12 }}>
                    {/\.pdf$/i.test(selectedItem.lampiran_nama) ? (
                      <div style={{ textAlign:'center',padding:'24px 12px',background:'#F9F9F9',borderRadius:10 }}>
                        <span style={{ fontSize:40 }}>📄</span>
                        <p style={{ fontSize:13,fontWeight:600,color:'#555',margin:'8px 0 0' }}>File PDF</p>
                      </div>
                    ) : (
                      <img src={selectedItem.lampiran_url} alt="lampiran" style={{ width:'100%',borderRadius:10,cursor:'pointer',border:'1px solid #e0e0e0' }} onClick={()=>setPreviewUrl(selectedItem.lampiran_url)}/>
                    )}
                    <div style={{ display:'flex',gap:8,marginTop:10 }}>
                      {!/\.pdf$/i.test(selectedItem.lampiran_nama) && (
                        <button onClick={()=>setPreviewUrl(selectedItem.lampiran_url)} style={{ flex:1,padding:'10px 0',background:'#E3F2FD',border:'none',borderRadius:10,fontSize:12,fontWeight:700,color:'#1565C0',cursor:'pointer' }}>👁️ Preview</button>
                      )}
                      <a href={selectedItem.lampiran_url} target="_blank" rel="noreferrer" style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'10px 0',background:'#E8F5E9',borderRadius:10,fontSize:12,fontWeight:700,color:'#2E7D32',textDecoration:'none' }}>⬇️ Download</a>
                    </div>
                  </div>
                : <p style={{ padding:'12px 14px',fontSize:12,color:'#aaa',margin:0 }}>File belum tersedia.</p>}
            </div>
          )}

          {(freshStatus(selectedItem.id)||selectedItem.status)==='MENUNGGU' ? (
            <>
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>Catatan (opsional)</label>
                <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Catatan untuk karyawan..." style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',resize:'none',boxSizing:'border-box' }}/>
              </div>
              <div style={{ display:'flex',gap:10 }}>
                <button onClick={()=>handleApproval('reject')} disabled={loading} style={{ flex:1,padding:'14px 20px',borderRadius:14,fontWeight:700,fontSize:13,border:'2px solid #E53935',color:'#E53935',background:'transparent',cursor:'pointer' }}>✗ Tolak</button>
                <button onClick={()=>handleApproval('approve')} disabled={loading} style={{ flex:1,padding:'14px 20px',borderRadius:14,fontWeight:700,fontSize:13,border:'none',color:'white',background:'linear-gradient(135deg,#43A047,#66BB6A)',cursor:'pointer' }}>{loading?'Memproses...':'✓ Setujui'}</button>
              </div>
            </>
          ) : (
            <div style={{ marginTop:12,padding:14,borderRadius:12,background:'#F5F5F5',fontSize:13 }}>
              <p style={{ margin:'0 0 4px',color:'#555' }}>Diproses oleh: <strong>{selectedItem.approved_by||'-'}</strong></p>
              <p style={{ margin:0,color:'#777' }}>Catatan: {selectedItem.approval_note||'-'}</p>
            </div>
          )}
        </Modal>
      )}

      {previewUrl && (
        <Modal title="Preview Lampiran" onClose={()=>setPreviewUrl(null)}>
          <img src={previewUrl} alt="preview" style={{ width:'100%',borderRadius:12,border:'1px solid #e0e0e0' }}/>
          <div style={{ marginTop:12 }}><BtnGrad onClick={()=>setPreviewUrl(null)}>Tutup</BtnGrad></div>
        </Modal>
      )}
    </div>
  )
}

// ─── HRD MORE ─────────────────────────────────────────────────────────────────
const HRDMore = ({ user, showToast, onLogout, dbData, refreshData }) => {
  const [sub, setSub] = useState(null)
  const [annForm, setAnnForm] = useState({ judul:'',isi:'',tanggal:new Date().toISOString().split('T')[0] })
  const [editHb, setEditHb] = useState(null)
  const [editHbForm, setEditHbForm] = useState({ judul:'',isi:'' })
  const [newHb, setNewHb] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)

  const handleAnnounce = async()=>{
    if(!annForm.judul||!annForm.isi){showToast('Judul dan isi wajib diisi');return}
    await supabase.from('announcements').insert({ judul:annForm.judul,isi:annForm.isi,tanggal:annForm.tanggal,created_by:user.nama,type:'INFO' })
    const empNIPs = dbData.users.filter(u=>u.role==='EMPLOYEE').map(u=>u.nip)
    if(empNIPs.length>0) await supabase.from('notifications').insert(empNIPs.map(nip=>({ nip,type:'PENGUMUMAN',message:`Pengumuman Baru: ${annForm.judul}` })))
    await supabase.from('audit_log').insert({ user_name:user.nama,nip:user.nip,aktivitas:`Buat pengumuman: ${annForm.judul}`,keterangan:'' })
    showToast('✅ Pengumuman dikirim!')
    setAnnForm({ judul:'',isi:'',tanggal:new Date().toISOString().split('T')[0] }); refreshData()
  }

  const saveHb = async()=>{
    if(newHb){
      await supabase.from('handbook').insert({ judul:editHbForm.judul,isi:editHbForm.isi,updated_at:new Date().toISOString().split('T')[0] })
    } else {
      await supabase.from('handbook').update({ judul:editHbForm.judul,isi:editHbForm.isi,updated_at:new Date().toISOString().split('T')[0] }).eq('id',editHb.id)
    }
    await supabase.from('audit_log').insert({ user_name:user.nama,nip:user.nip,aktivitas:`${newHb?'Tambah':'Edit'} handbook: ${editHbForm.judul}`,keterangan:'' })
    setEditHb(null); setNewHb(false); showToast('✅ Handbook disimpan!'); refreshData()
  }

  return (
    <div style={{ flex:1,overflowY:'auto',paddingBottom:80,background:'#F8F8F8' }}>
      <div style={{ padding:'24px 16px 12px' }}><h1 style={{ fontWeight:800,fontSize:18,margin:0 }}>Lainnya</h1></div>
      <div style={{ padding:'0 16px',display:'flex',flexDirection:'column',gap:10 }}>
        <Card style={{ padding:16,display:'flex',alignItems:'center',gap:14 }}>
          <Avatar fotoProfil={dbData.karyawan.find(x=>x.nip===user.nip)?.foto_profil} nama={user.nama} size={52} fontSize={22}/>
          <div><p style={{ fontWeight:800,margin:0 }}>{user.nama}</p><p style={{ fontSize:12,color:'#aaa',margin:0 }}>{user.nip}</p><span style={{ fontSize:11,padding:'2px 10px',borderRadius:99,color:'white',background:'linear-gradient(135deg,#E53935,#F5A623)',fontWeight:700 }}>HRD</span></div>
        </Card>
        {[
          {icon:'📖',key:'handbook',label:'Handbook',sub:'Kelola panduan karyawan'},
          {icon:'📢',key:'pengumuman',label:'Pengumuman',sub:'Kirim info ke seluruh karyawan'},
          {icon:'🔍',key:'auditlog',label:'Audit Log',sub:'Riwayat aktivitas seluruh karyawan'},
        ].map(m=>(
          <button key={m.key} onClick={()=>setSub(m.key)} style={{ display:'flex',alignItems:'center',gap:12,padding:16,background:'white',borderRadius:16,border:'none',cursor:'pointer',textAlign:'left',boxShadow:'0 2px 8px rgba(0,0,0,0.05)',width:'100%' }}>
            <div style={{ width:40,height:40,borderRadius:12,background:'#FFE4E1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20 }}>{m.icon}</div>
            <div style={{ flex:1 }}><p style={{ fontWeight:700,fontSize:14,margin:0 }}>{m.label}</p><p style={{ fontSize:11,color:'#aaa',margin:0 }}>{m.sub}</p></div>
            <span style={{ color:'#ccc',fontSize:18 }}>›</span>
          </button>
        ))}
        <button onClick={()=>setShowChangePw(true)} style={{ padding:14,borderRadius:14,color:'#444',fontWeight:700,fontSize:14,border:'1px solid #e0e0e0',background:'white',cursor:'pointer',marginTop:4,width:'100%' }}>🔑 Ubah Password</button>
        <button onClick={onLogout} style={{ padding:14,borderRadius:14,color:'#E53935',fontWeight:700,fontSize:14,border:'2px solid #FFCDD2',background:'white',cursor:'pointer',marginTop:4,width:'100%' }}>← Keluar</button>
        <p style={{ textAlign:'center',fontSize:10,color:'#ddd',marginTop:8 }}>#gg</p>
      </div>

      {showChangePw && <ChangePasswordModal user={user} showToast={showToast} onClose={()=>setShowChangePw(false)}/>}

      {sub==='handbook' && (
        <Modal title="Handbook Perusahaan" onClose={()=>{ setSub(null); setEditHb(null); setNewHb(false) }} wide>
          {!editHb&&!newHb&&<>
            <button onClick={()=>{ setNewHb(true); setEditHbForm({ judul:'',isi:'' }) }} style={{ width:'100%',padding:'10px 0',background:'linear-gradient(135deg,#E53935,#F5A623)',color:'white',border:'none',borderRadius:12,fontWeight:700,fontSize:13,cursor:'pointer',marginBottom:14 }}>+ Tambah Halaman Baru</button>
            {dbData.handbook.map(hb=>(
              <div key={hb.id} style={{ border:'1px solid #f0f0f0',borderRadius:14,padding:14,marginBottom:10 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6 }}>
                  <p style={{ fontWeight:700,fontSize:14,margin:0,flex:1 }}>{hb.judul}</p>
                  <div style={{ display:'flex',gap:6 }}>
                    <button onClick={()=>{ setEditHb(hb); setEditHbForm({ judul:hb.judul,isi:hb.isi }) }} style={{ background:'#FFF8E1',border:'none',borderRadius:8,padding:'4px 10px',fontSize:11,fontWeight:700,color:'#F57F17',cursor:'pointer' }}>✏️</button>
                    <button onClick={async()=>{ await supabase.from('handbook').delete().eq('id',hb.id); showToast('Dihapus'); refreshData() }} style={{ background:'#FFF5F5',border:'none',borderRadius:8,padding:'4px 10px',fontSize:11,fontWeight:700,color:'#E53935',cursor:'pointer' }}>🗑️</button>
                  </div>
                </div>
                <p style={{ fontSize:12,color:'#777',margin:0,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{hb.isi}</p>
                <p style={{ fontSize:10,color:'#ccc',margin:'6px 0 0' }}>Diperbarui: {hb.updated_at}</p>
              </div>
            ))}
          </>}
          {(editHb||newHb)&&<>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>Judul</label>
              <input value={editHbForm.judul} onChange={e=>setEditHbForm({...editHbForm,judul:e.target.value})} style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>Isi</label>
              <textarea value={editHbForm.isi} onChange={e=>setEditHbForm({...editHbForm,isi:e.target.value})} rows={6} style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',resize:'vertical',boxSizing:'border-box' }}/>
            </div>
            <div style={{ display:'flex',gap:10 }}>
              <BtnGrad outline onClick={()=>{ setEditHb(null); setNewHb(false) }}>Batal</BtnGrad>
              <BtnGrad color="green" onClick={saveHb}>💾 Simpan</BtnGrad>
            </div>
          </>}
        </Modal>
      )}

      {sub==='pengumuman' && (
        <Modal title="Buat Pengumuman" onClose={()=>setSub(null)} wide>
          <div style={{ display:'flex',flexDirection:'column',gap:12,marginBottom:16 }}>
            <div><label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>Judul</label>
              <input value={annForm.judul} onChange={e=>setAnnForm({...annForm,judul:e.target.value})} placeholder="Judul pengumuman" style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>
            </div>
            <div><label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>Isi Pengumuman</label>
              <textarea value={annForm.isi} onChange={e=>setAnnForm({...annForm,isi:e.target.value})} rows={4} placeholder="Tulis isi pengumuman..." style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',resize:'none',boxSizing:'border-box' }}/>
            </div>
            <div><label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>Tanggal Publish</label>
              <input type="date" value={annForm.tanggal} onChange={e=>setAnnForm({...annForm,tanggal:e.target.value})} style={{ width:'100%',border:'1px solid #e0e0e0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box' }}/>
            </div>
            <BtnGrad onClick={handleAnnounce}>📢 Kirim Pengumuman</BtnGrad>
          </div>
          <div style={{ borderTop:'1px solid #f0f0f0',paddingTop:12 }}>
            <p style={{ fontSize:11,fontWeight:700,color:'#aaa',margin:'0 0 10px' }}>RIWAYAT PENGUMUMAN</p>
            {dbData.announcements.map(a=>(
              <div key={a.id} style={{ paddingBottom:10,marginBottom:10,borderBottom:'1px solid #f5f5f5' }}>
                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4 }}>
                  <span style={{ fontSize:11,padding:'2px 8px',borderRadius:99,background:'#FFF8E1',color:'#F57F17',fontWeight:700 }}>{a.type}</span>
                  <span style={{ fontSize:11,color:'#aaa' }}>{a.tanggal}</span>
                </div>
                <p style={{ fontWeight:700,fontSize:13,margin:0 }}>{a.judul}</p>
                <p style={{ fontSize:12,color:'#888',margin:'2px 0 0' }}>{a.isi}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {sub==='auditlog' && (
        <Modal title="Audit Log" onClose={()=>setSub(null)} wide>
          <p style={{ fontSize:11,color:'#aaa',margin:'0 0 12px' }}>Seluruh aktivitas karyawan secara kronologis</p>
          {dbData.auditLog.length===0 && <p style={{ textAlign:'center',color:'#aaa',padding:24,fontSize:13 }}>Belum ada log</p>}
          {dbData.auditLog.map((a,i)=>(
            <div key={i} style={{ padding:'10px 0',borderBottom:'1px solid #f5f5f5' }}>
              <div style={{ display:'flex',alignItems:'flex-start',gap:10 }}>
                <div style={{ width:36,height:36,borderRadius:10,background:'#FFE4E1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:14 }}>🔍</div>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:700,fontSize:13,margin:0,color:'#333' }}>{a.aktivitas}</p>
                  <p style={{ fontSize:12,color:'#888',margin:'2px 0 0' }}>{a.user_name} · {new Date(a.created_at).toLocaleString('id-ID')}</p>
                  {a.keterangan&&<p style={{ fontSize:11,color:'#aaa',margin:'2px 0 0' }}>{a.keterangan}</p>}
                </div>
              </div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}

// ─── HRD NAV ──────────────────────────────────────────────────────────────────
const HRDNav = ({ active, onChange, dbData }) => {
  const menungguIzin = dbData.izin.filter(c=>c.status==='MENUNGGU').length
  return (
    <div style={{ position:'fixed',bottom:0,left:0,right:0,maxWidth:430,margin:'0 auto',background:'white',borderTop:'1px solid #f0f0f0',display:'flex',zIndex:40,boxShadow:'0 -4px 20px rgba(0,0,0,0.06)' }}>
      {[{key:'dashboard',icon:'🏠',label:'Dashboard'},{key:'karyawan',icon:'👥',label:'Karyawan'},{key:'absensi',icon:'🕒',label:'Absensi'},{key:'approval',icon:'📋',label:'Approval'},{key:'more',icon:'☰',label:'Lainnya'}].map(item=>{
        const badge = item.key==='approval'?menungguIzin:0
        return (
          <button key={item.key} onClick={()=>onChange(item.key)} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'10px 0',background:'none',border:'none',cursor:'pointer',position:'relative' }}>
            <span style={{ fontSize:18 }}>{item.icon}</span>
            {badge>0&&<span style={{ position:'absolute',top:6,right:'calc(50% - 14px)',width:16,height:16,background:'#E53935',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:9,fontWeight:700 }}>{badge}</span>}
            <span style={{ fontSize:10,fontWeight:700,color:active===item.key?'#E53935':'#aaa' }}>{item.label}</span>
            {active===item.key&&<span style={{ width:18,height:2,borderRadius:2,background:'#E53935' }}/>}
          </button>
        )
      })}
    </div>
  )
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const LoginPage = ({ onLogin }) => {
  const [nip, setNip] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const login = async()=>{
    setErr(''); if(!nip||!pw){setErr('NIP dan Password wajib diisi');return}
    setLoading(true)
    const {data,error} = await supabase.from('users').select('*').eq('nip',nip).eq('password',pw).eq('status','aktif').maybeSingle()
    if(error||!data){ setErr('NIP atau Password salah') }
    else {
      const {data:empData} = await supabase.from('master_karyawan').select('*').eq('nip',nip).maybeSingle()
      await supabase.from('audit_log').insert({ user_name:data.nama,nip:data.nip,aktivitas:'Login ke sistem',keterangan:'' })
      onLogin({...data,...(empData||{}),role:data.role})
    }
    setLoading(false)
  }
  return (
    <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'#FBF5F5',position:'relative',overflow:'hidden' }}>
      <div style={{ position:'absolute',top:0,left:0,width:180,height:180,borderRadius:'50%',background:'#FFCDD2',opacity:0.3,transform:'translate(-30%,-30%)' }}/>
      <div style={{ position:'absolute',bottom:80,right:0,width:140,height:140,borderRadius:'50% 0 0 50%',background:'#FFE0B2',opacity:0.4 }}/>
      <div style={{ width:'100%',maxWidth:360,background:'white',borderRadius:24,padding:32,position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,0.10)' }}>
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',marginBottom:24 }}>
          <WellJoyLogo size={100}/>
          <h1 style={{ fontSize:22,fontWeight:800,margin:'8px 0 2px',color:'#111' }}>WellJoy <span style={{ color:'#E53935' }}>HRIS</span></h1>
          <p style={{ fontSize:13,color:'#aaa',margin:0 }}>Sistem Informasi Karyawan</p>
        </div>
        {err&&<div style={{ marginBottom:14,background:'#FFF5F5',border:'1px solid #FFCDD2',color:'#C62828',fontSize:13,padding:'10px 14px',borderRadius:12 }}>{err}</div>}
        <div style={{ marginBottom:12 }}>
          <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>NIP</label>
          <div style={{ display:'flex',alignItems:'center',background:'white',border:'1px solid #e0e0e0',borderRadius:14,padding:'10px 14px',gap:8,boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
            <span>👤</span><input value={nip} onChange={e=>setNip(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="Contoh: 10001" style={{ flex:1,outline:'none',fontSize:13,border:'none',background:'transparent' }}/>
          </div>
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:6 }}>Password</label>
          <div style={{ display:'flex',alignItems:'center',background:'white',border:'1px solid #e0e0e0',borderRadius:14,padding:'10px 14px',gap:8,boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
            <span>🔒</span><input type={showPw?'text':'password'} value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="••••••••" style={{ flex:1,outline:'none',fontSize:13,border:'none',background:'transparent' }}/>
            <button onClick={()=>setShowPw(!showPw)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:16,color:'#aaa' }}>{showPw?'🙈':'👁️'}</button>
          </div>
        </div>
        <BtnGrad onClick={login} disabled={loading}>{loading?'Memverifikasi...':'Masuk Sekarang'}</BtnGrad>
        <p style={{ textAlign:'center',fontSize:11,color:'#ccc',marginTop:16 }}>Lupa password? Hubungi HRD</p>
        <p style={{ textAlign:'center',fontSize:10,color:'#ddd',marginTop:20 }}>#gg</p>
      </div>
    </div>
  )
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function WellJoyApp() {
  const [screen, setScreen] = useState('loading')  // loading dulu, cek session
  const [user, setUser] = useState(null)
  const [empNav, setEmpNav] = useState('home')
  const [hrdNav, setHrdNav] = useState('dashboard')
  const [toast, setToast] = useState('')
  const [dbData, setDbData] = useState({ users:[],karyawan:[],attendance:[],izin:[],notifications:[],auditLog:[],announcements:[],handbook:[] })
  const [loadingData, setLoadingData] = useState(false)

  const showToast = useCallback(msg=>{ setToast(msg); setTimeout(()=>setToast(''),3000) },[])

  const fetchData = useCallback(async()=>{
    setLoadingData(true)
    try {
      const [
        {data:users},{data:karyawan},{data:attendance},{data:izin},
        {data:notifications},{data:auditLog},{data:announcements},{data:handbook}
      ] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('master_karyawan').select('*').order('nama'),
        supabase.from('attendance').select('*').order('tanggal',{ascending:false}),
        supabase.from('izin').select('*').order('created_at',{ascending:false}),
        supabase.from('notifications').select('*').order('created_at',{ascending:false}),
        supabase.from('audit_log').select('*').order('created_at',{ascending:false}).limit(50),
        supabase.from('announcements').select('*').order('tanggal',{ascending:false}),
        supabase.from('handbook').select('*').order('created_at'),
      ])
      setDbData({ users:users||[],karyawan:karyawan||[],attendance:attendance||[],izin:izin||[],notifications:notifications||[],auditLog:auditLog||[],announcements:announcements||[],handbook:handbook||[] })
    } catch(e){ console.error('Fetch error:',e) }
    setLoadingData(false)
  },[])

  // ── Restore session dari localStorage saat pertama load ──
  useEffect(()=>{
    try {
      const saved = localStorage.getItem('welljoy_session')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Verifikasi session masih valid (cek NIP masih ada di DB)
        supabase.from('users').select('*').eq('nip', parsed.nip).eq('status','aktif').maybeSingle()
          .then(({ data }) => {
            if (data) {
              setUser({ ...parsed, ...data })
              setScreen('app')
            } else {
              localStorage.removeItem('welljoy_session')
              setScreen('login')
            }
          })
          .catch(() => {
            // Kalau offline/error, pakai data cache dulu
            setUser(parsed)
            setScreen('app')
          })
      } else {
        setScreen('login')
      }
    } catch {
      setScreen('login')
    }
  }, [])

  useEffect(()=>{ if(screen==='app') fetchData() },[screen,fetchData])

  const [ajukanIzin, setAjukanIzin] = useState(false)

  const handleLogin = userData=>{
    setUser(userData)
    setScreen('app')
    // Simpan session — jangan simpan password
    const { password:_, ...safeUser } = userData
    localStorage.setItem('welljoy_session', JSON.stringify(safeUser))
    if(userData.role==='HRD') setHrdNav('dashboard'); else setEmpNav('home')
  }

  const handleLogout = async()=>{
    if(user) await supabase.from('audit_log').insert({ user_name:user.nama,nip:user.nip,aktivitas:'Logout dari sistem',keterangan:'' })
    setUser(null)
    setScreen('login')
    setAjukanIzin(false)
    localStorage.removeItem('welljoy_session')
  }

  // ── Loading screen saat cek session ──
  if(screen==='loading') return (
    <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#FBF5F5',flexDirection:'column',gap:16 }}>
      <WellJoyLogo size={90}/>
      <div style={{ width:32,height:32,borderRadius:'50%',border:'3px solid #f0f0f0',borderTop:'3px solid #E53935',animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if(screen==='login') return <LoginPage onLogin={handleLogin}/>

  const isHRD = user?.role==='HRD'
  const commonProps = { user, showToast, dbData, refreshData:fetchData }

  if(loadingData && dbData.karyawan.length===0) return (
    <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#F8F8F8',flexDirection:'column',gap:16 }}>
      <WellJoyLogo size={80}/>
      <p style={{ color:'#aaa',fontSize:14 }}>Memuat data...</p>
      <div style={{ width:32,height:32,borderRadius:'50%',border:'3px solid #f0f0f0',borderTop:'3px solid #E53935',animation:'spin 0.8s linear infinite' }}/>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh',display:'flex',flexDirection:'column',maxWidth:430,margin:'0 auto',background:'#F8F8F8' }}>
      <Toast msg={toast}/>
      {isHRD ? (
        <>
          {hrdNav==='dashboard'  && <HRDDashboard {...commonProps} onNavChange={setHrdNav}/>}
          {hrdNav==='karyawan'   && <HRDKaryawan  {...commonProps}/>}
          {hrdNav==='absensi'    && <HRDAbsensi   {...commonProps}/>}
          {hrdNav==='approval'   && <HRDApproval  {...commonProps}/>}
          {hrdNav==='more'       && <HRDMore      {...commonProps} onLogout={handleLogout}/>}
          <HRDNav active={hrdNav} onChange={setHrdNav} dbData={dbData}/>
        </>
      ) : (
        <>
          {ajukanIzin
            ? <EmpAjukanIzin {...commonProps} onBack={()=>setAjukanIzin(false)}/>
            : <>
                {empNav==='home' && <EmpHome {...commonProps} onLogout={handleLogout}/>}
                {empNav==='izin' && <EmpIzin {...commonProps} onAjukan={()=>setAjukanIzin(true)}/>}
                {empNav==='slip' && <EmpSlipGaji {...commonProps}/>}
                <EmpNav active={empNav} onChange={v=>{ setEmpNav(v); setAjukanIzin(false) }}/>
              </>
          }
        </>
      )}
    </div>
  )
}
