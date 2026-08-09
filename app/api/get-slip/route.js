// app/api/get-slip/route.js
// Baca data slip gaji via Google Sheets API + API Key (tidak butuh OAuth)
// Spreadsheet harus public (Anyone with the link - Viewer)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseAngka(str) {
  if (!str && str !== 0) return 0
  const s = String(str).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

const SPREADSHEET_ID = '1iylEq0HtxQ8kOGxPcp4HaFeK8ByDMXMzd1JnCLL5VS8'
const TAB_NAME = process.env.GOOGLE_PAYROLL_SHEET_TAB || 'Rekap Absensi'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const nip = searchParams.get('nip')
    if (!nip) return Response.json({ error: 'Parameter nip wajib diisi' }, { status: 400 })

    const API_KEY = process.env.GOOGLE_SHEETS_API_KEY
    if (!API_KEY) return Response.json({ error: 'GOOGLE_SHEETS_API_KEY belum diset di env var' }, { status: 500 })

    // Fetch via Sheets API v4 dengan API key — tidak butuh OAuth
    const range = encodeURIComponent(`${TAB_NAME}!A5:W200`)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`

    const res = await fetch(url)
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const msg = errBody?.error?.message || res.statusText
      console.error('[get-slip] Sheets API error:', res.status, msg)
      return Response.json({ error: `Sheets API error: ${msg}` }, { status: res.status })
    }

    const json = await res.json()
    const rows = json.values || []

    if (rows.length < 2) return Response.json({ error: 'Data tidak ditemukan di spreadsheet' }, { status: 404 })

    // rows[0] = header (baris 5), rows[1+] = data mulai baris 6
    const dataRows = rows.slice(1)
    const nipCari = nip.trim().toLowerCase()
    const row = dataRows.find(r => String(r[0] || '').trim().toLowerCase() === nipCari)

    if (!row) {
      const nipList = dataRows.map(r => String(r[0] || '').trim()).filter(Boolean)
      return Response.json({
        error: `NIP "${nip}" tidak ditemukan di sheet "${TAB_NAME}"`,
        debug_nip_tersedia: nipList
      }, { status: 404 })
    }

    // Mapping kolom (A=0 NIP, B=1 Nama, C=2 Gaji Pokok ... sesuai sheet)
    const slip = {
      nip:                   String(row[0]  || '').trim(),
      nama:                  String(row[1]  || '').trim(),
      gajiPokok:             parseAngka(row[2]),   // C
      tunjanganMakan:        parseAngka(row[3]),   // D
      tunjanganKedisiplinan: parseAngka(row[4]),   // E
      bonusPenjualan:        parseAngka(row[5]),   // F
      totalMasuk:            parseAngka(row[6]),   // G
      totalLembur:           parseAngka(row[7]),   // H
      totalBonusLembur:      parseAngka(row[8]),   // I
      totalPenghasilan:      parseAngka(row[9]),   // J
      takeHomePay:           parseAngka(row[10]),  // K
      totalIzinSakit:        parseAngka(row[11]),  // L
      totalIzinTerlambat:    parseAngka(row[12]),  // M
      totalIzinSetengahHari: parseAngka(row[13]),  // N
      totalTerlambatMenit:   parseAngka(row[14]),  // O
      totalJumlahTerlambat:  parseAngka(row[15]),  // P
      izinLainnya:           parseAngka(row[16]),  // Q
      totalAlpha:            parseAngka(row[17]),  // R
      totalDendaTerlambat:   parseAngka(row[18]),  // S
      totalDendaIzin:        parseAngka(row[19]),  // T
      totalDendaAlpha:       parseAngka(row[20]),  // U
      totalDenda:            parseAngka(row[21]),  // V
      performaKedisiplinan:  String(row[22] || '').trim(), // W
    }

    return Response.json({ success: true, slip })
  } catch (e) {
    console.error('[get-slip] error:', e.message)
    return Response.json({ error: e.message || 'Gagal membaca data slip' }, { status: 500 })
  }
}
