// app/api/get-slip/route.js
//
// Baca data slip gaji karyawan dari Google Spreadsheet "Absensi Welljoy Jaya"
// berdasarkan NIP. Sheet punya header di baris 5, data mulai baris 6.
//
// Kolom yang dibaca (sesuai struktur spreadsheet):
// A=NIP, B=Nama, C=Gaji Pokok, D=Tunjangan Makan, E=Tunjangan Disiplin,
// F=Bonus Penjualan, G=Total Masuk, H=Total Lembur, I=Total Bonus Lembur,
// J=Total Penghasilan, K=Total Izin Sakit, L=Total Izin Terlambat,
// M=Total Izin Setengah Hari, N=Total Terlambat(Menit), O=Total Jumlah Terlambat,
// P=Izin Lainnya, Q=Total Alpha, R=Total Denda Terlambat, S=Total Denda Izin,
// T=Total Denda Alpha, U=Total Denda, V=Performa Kedisiplinan

import { getSheetsClient } from '../../lib/google-auth'

export const runtime = 'nodejs'

// Parsing angka dari format rupiah Sheets: "2.000.000" → 2000000
function parseAngka(str) {
  if (str === null || str === undefined || str === '') return 0
  const s = String(str).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

const SPREADSHEET_ID = '1iylEq0HtxQ8kOGxPcp4HaFeK8ByDMXMzd1JnCLL5VS8'
const TAB_NAME       = process.env.GOOGLE_PAYROLL_SHEET_TAB || 'Rekap Absensi'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const nip = searchParams.get('nip')

    if (!nip) return Response.json({ error: 'Parameter nip wajib diisi' }, { status: 400 })

    const sheets = getSheetsClient()

    // Ambil semua data: baris 5 ke bawah (header + data)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB_NAME}!A5:V200`,
    })

    const rows = res.data.values || []
    if (rows.length < 2) return Response.json({ error: 'Data tidak ditemukan di spreadsheet' }, { status: 404 })

    // Baris pertama (index 0) adalah header (baris 5 di sheet)
    // Data mulai index 1 (baris 6 di sheet)
    const dataRows = rows.slice(1)

    // Cari baris yang NIP-nya cocok (case-insensitive, trim)
    const row = dataRows.find(r => String(r[0]||'').trim().toLowerCase() === nip.trim().toLowerCase())
    if (!row) return Response.json({ error: `Data slip gaji untuk NIP "${nip}" tidak ditemukan di spreadsheet` }, { status: 404 })

    const slip = {
      nip:                   String(row[0]  || '').trim(),
      nama:                  String(row[1]  || '').trim(),

      // ── Penghasilan ──
      gajiPokok:             parseAngka(row[2]),   // C: Gaji Pokok
      tunjanganMakan:        parseAngka(row[3]),   // D: Tunjangan Makan
      tunjanganKedisiplinan: parseAngka(row[4]),   // E: Tunjangan Disiplin
      bonusPenjualan:        parseAngka(row[5]),   // F: Bonus Penjualan
      totalMasuk:            parseAngka(row[6]),   // G: Total Masuk (hari)
      totalLembur:           parseAngka(row[7]),   // H: Total Lembur (jam)
      totalBonusLembur:      parseAngka(row[8]),   // I: Total Bonus Lembur
      totalPenghasilan:      parseAngka(row[9]),   // J: Total Penghasilan

      // ── Rekap Izin ──
      totalIzinSakit:        parseAngka(row[10]),  // K: Total Izin Sakit
      totalIzinTerlambat:    parseAngka(row[11]),  // L: Total Izin Terlambat
      totalIzinSetengahHari: parseAngka(row[12]),  // M: Total Izin Setengah Hari
      totalTerlambatMenit:   parseAngka(row[13]),  // N: Total Terlambat (Menit)
      totalJumlahTerlambat:  parseAngka(row[14]),  // O: Total Jumlah Terlambat (kali)
      izinLainnya:           parseAngka(row[15]),  // P: Izin Lainnya
      totalAlpha:            parseAngka(row[16]),  // Q: Total Alpha

      // ── Potongan ──
      totalDendaTerlambat:   parseAngka(row[17]),  // R: Total Denda Terlambat
      totalDendaIzin:        parseAngka(row[18]),  // S: Total Denda Izin
      totalDendaAlpha:       parseAngka(row[19]),  // T: Total Denda Alpha
      totalDenda:            parseAngka(row[20]),  // U: Total Denda

      // ── Performa ──
      performaKedisiplinan:  String(row[21] || '').trim(), // V: Performa Kedisiplinan

      // Gaji bersih = Total Penghasilan - Total Denda
      takeHomePay: parseAngka(row[9]) - parseAngka(row[20]),
    }

    return Response.json({ success: true, slip })
  } catch (e) {
    const detail = e?.response?.data?.error || e?.errors || e.message
    console.error('[get-slip] error:', JSON.stringify(detail, null, 2))
    return Response.json({ error: detail?.message || detail || 'Gagal membaca data slip' }, { status: 500 })
  }
}
