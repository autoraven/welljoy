// app/api/log-sheet/route.js
//
// Catat (atau update) satu baris di Google Sheets — terpisah untuk Absensi dan Izin.
// Dipanggil dari frontend setiap ada event: clock-in, clock-out, ajukan izin, approve/tolak izin.
//
// Logic "upsert": cari baris yang cocok dengan `key` di kolom-kolom tertentu.
// Kalau ketemu → update baris itu (misal saat clock-out, update baris yang dibuat saat clock-in).
// Kalau belum ada → tambah baris baru di bawah.

import { getSheetsClient } from '../../lib/google-auth'

export const runtime = 'nodejs'

// ── Definisi kolom per sheet ──
// `header` di sini cuma dipakai untuk MEMBUAT header awal kalau sheet masih kosong.
// Untuk pemetaan nilai, kode SELALU baca ulang header row yang sebenarnya ada di sheet,
// supaya tidak ketuker walau urutan kolom di sheet diubah manual.
const SHEET_CONFIG = {
  absensi: {
    tabName: 'Absensi',
    defaultHeader: ['NIP', 'Nama', 'Tanggal', 'Jam Masuk', 'Jam Keluar', 'Telat (menit)', 'Lebih(menit)', 'Foto Masuk', 'Foto Keluar'],
    keyColumnNames: ['NIP', 'Tanggal'],
  },
  izin: {
    tabName: 'Izin',
    defaultHeader: ['ID', 'NIP', 'Nama', 'Jenis Izin', 'Tanggal Mulai', 'Tanggal Selesai', 'Jumlah Hari', 'Status', 'Lampiran'],
    keyColumnNames: ['ID'],
  },
}

// Ambil header row asli dari sheet. Kalau kosong, tulis defaultHeader dulu.
async function getOrCreateHeader(sheets, spreadsheetId, config) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${config.tabName}!A1:Z1` })
  let header = res.data.values?.[0]
  if (!header || header.length === 0) {
    header = config.defaultHeader
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${config.tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    })
  }
  return header
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { sheet, key, row } = body // sheet: 'absensi' | 'izin', key: {} cocokkan kolom, row: {} nilai kolom

    const config = SHEET_CONFIG[sheet]
    if (!config) return Response.json({ error: `sheet "${sheet}" tidak dikenal` }, { status: 400 })

    const spreadsheetId = process.env.GOOGLE_SHEET_ID
    if (!spreadsheetId) return Response.json({ error: 'GOOGLE_SHEET_ID belum diset' }, { status: 500 })

    const sheets = getSheetsClient()
    const header = await getOrCreateHeader(sheets, spreadsheetId, config) // header ASLI dari sheet, urutan apa adanya

    const lastCol = colLetter(header.length)
    const range = `${config.tabName}!A:${lastCol}`

    // Susun baris sesuai urutan kolom ASLI di sheet (bukan asumsi tetap)
    const newRowValues = header.map(colName => row[colName] ?? '')

    // Ambil semua data existing untuk cari baris yang cocok
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    const rows = existing.data.values || []

    const keyColIdx = config.keyColumnNames.map(name => header.indexOf(name))
    if (keyColIdx.some(i => i === -1)) {
      return Response.json({ error: `Kolom kunci (${config.keyColumnNames.join(', ')}) tidak ditemukan di header sheet "${config.tabName}". Cek nama header-nya.` }, { status: 400 })
    }

    let matchIndex = -1 // index di array `rows` (0 = header)
    for (let i = 1; i < rows.length; i++) {
      const isMatch = config.keyColumnNames.every((name, idx) => {
        const colI = keyColIdx[idx]
        return String(rows[i][colI] ?? '') === String(key[name] ?? '')
      })
      if (isMatch) { matchIndex = i; break }
    }

    if (matchIndex >= 0) {
      // Update baris yang sudah ada (baris ke matchIndex+1 di sheet, karena 1-indexed)
      const targetRow = matchIndex + 1
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${config.tabName}!A${targetRow}:${lastCol}${targetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [newRowValues] },
      })
      return Response.json({ success: true, action: 'updated', row: targetRow, header })
    } else {
      // Tambah baris baru
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [newRowValues] },
      })
      return Response.json({ success: true, action: 'appended', header })
    }
  } catch (e) {
    const detail = e?.response?.data?.error || e?.errors || e.message
    console.error('[log-sheet] error:', JSON.stringify(detail, null, 2))
    return Response.json({ error: detail?.message || detail || 'Gagal mencatat ke Sheets' }, { status: 500 })
  }
}

// Konversi angka kolom (1, 2, ..., 27) jadi huruf kolom Sheets (A, B, ..., AA)
function colLetter(n) {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
