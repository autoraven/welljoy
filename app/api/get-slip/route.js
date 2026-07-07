// app/api/get-slip/route.js
//
// Mapping kolom FINAL (verified dari spreadsheet + konfirmasi user):
// A(0)=NIP, B(1)=Nama, C(2)=Gaji Pokok, D(3)=Tunjangan Makan,
// E(4)=Tunjangan Disiplin, F(5)=Bonus Penjualan, G(6)=Total Masuk,
// H(7)=Total Lembur, I(8)=Total Bonus Lembur,
// J(9)=Total Penghasilan, K(10)=Take Home Pay,
// L(11)=Total Izin Sakit, M(12)=Total Izin Terlambat,
// N(13)=Total Izin Setengah Hari, O(14)=Total Terlambat(Menit),
// P(15)=Total Jumlah Terlambat, Q(16)=Izin Lainnya, R(17)=Total Alpha,
// S(18)=Total Denda Terlambat, T(19)=Total Denda Izin,
// U(20)=Total Denda Alpha, V(21)=Total Denda, W(22)=Performa Kedisiplinan

import { getSheetsClient } from '../../lib/google-auth'

export const runtime = 'nodejs'

function parseAngka(str) {
  if (str === null || str === undefined || str === '') return 0
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

    const sheets = getSheetsClient()

    // Header di baris 5, data mulai baris 6, sampai kolom W
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB_NAME}!A5:W200`,
    })

    const rows = res.data.values || []
    if (rows.length < 2) return Response.json({ error: 'Data tidak ditemukan di spreadsheet' }, { status: 404 })

    const dataRows = rows.slice(1) // skip header row (baris 5)
    const nipCari = nip.trim().toLowerCase()
    const row = dataRows.find(r => String(r[0] || '').trim().toLowerCase() === nipCari)

    if (!row) {
      const nipList = dataRows.map(r => String(r[0] || '').trim()).filter(Boolean)
      return Response.json({
        error: `NIP "${nip}" tidak ditemukan di sheet "${TAB_NAME}"`,
        debug_nip_tersedia: nipList
      }, { status: 404 })
    }

    const slip = {
      nip:                   String(row[0]  || '').trim(),  // A
      nama:                  String(row[1]  || '').trim(),  // B
      // Penghasilan
      gajiPokok:             parseAngka(row[2]),   // C
      tunjanganMakan:        parseAngka(row[3]),   // D
      tunjanganKedisiplinan: parseAngka(row[4]),   // E: Tunjangan Disiplin
      bonusPenjualan:        parseAngka(row[5]),   // F
      totalMasuk:            parseAngka(row[6]),   // G: Total Masuk (hari)
      totalLembur:           parseAngka(row[7]),   // H: Total Lembur (jam)
      totalBonusLembur:      parseAngka(row[8]),   // I
      totalPenghasilan:      parseAngka(row[9]),   // J
      takeHomePay:           parseAngka(row[10]),  // K ← langsung dari sheet
      // Rekap izin
      totalIzinSakit:        parseAngka(row[11]),  // L
      totalIzinTerlambat:    parseAngka(row[12]),  // M
      totalIzinSetengahHari: parseAngka(row[13]),  // N
      totalTerlambatMenit:   parseAngka(row[14]),  // O
      totalJumlahTerlambat:  parseAngka(row[15]),  // P: jumlah kejadian terlambat
      izinLainnya:           parseAngka(row[16]),  // Q
      totalAlpha:            parseAngka(row[17]),  // R
      // Potongan
      totalDendaTerlambat:   parseAngka(row[18]),  // S
      totalDendaIzin:        parseAngka(row[19]),  // T
      totalDendaAlpha:       parseAngka(row[20]),  // U
      totalDenda:            parseAngka(row[21]),  // V
      // Performa
      performaKedisiplinan:  String(row[22] || '').trim(), // W
    }

    return Response.json({ success: true, slip })
  } catch (e) {
    const detail = e?.response?.data?.error || e?.errors || e.message
    console.error('[get-slip] error:', JSON.stringify(detail, null, 2))
    return Response.json({ error: detail?.message || detail || 'Gagal membaca data slip' }, { status: 500 })
  }
}
