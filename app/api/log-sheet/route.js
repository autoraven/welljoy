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
// Urutan harus sama persis dengan urutan kolom di Google Sheet kamu (baris header).
const SHEET_CONFIG = {
  absensi: {
    tabName: 'Absensi',
    range: 'Absensi!A:H',
    header: ['NIP', 'Nama', 'Tanggal', 'Jam Masuk', 'Jam Keluar', 'Telat (menit)', 'Foto Masuk', 'Foto Keluar'],
    // Kolom yang dipakai untuk mencocokkan baris lama (index di array `header`, 0-based)
    keyColumns: [0, 2], // NIP + Tanggal
  },
  izin: {
    tabName: 'Izin',
    range: 'Izin!A:I',
    header: ['ID', 'NIP', 'Nama', 'Jenis Izin', 'Tanggal Mulai', 'Tanggal Selesai', 'Jumlah Hari', 'Status', 'Lampiran'],
    keyColumns: [0], // ID izin dari Supabase (unik)
  },
}

async function ensureHeader(sheets, spreadsheetId, config) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${config.tabName}!A1:Z1` })
  const firstRow = res.data.values?.[0]
  if (!firstRow || firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${config.tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.header] },
    })
  }
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
    await ensureHeader(sheets, spreadsheetId, config)

    // Susun baris baru sesuai urutan header
    const newRowValues = config.header.map(col => row[col] ?? '')

    // Ambil semua data existing untuk cari baris yang cocok
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: config.range })
    const rows = existing.data.values || []

    let matchIndex = -1 // index di array `rows` (0 = header)
    for (let i = 1; i < rows.length; i++) {
      const isMatch = config.keyColumns.every(colIdx => {
        const headerName = config.header[colIdx]
        return String(rows[i][colIdx] ?? '') === String(key[headerName] ?? '')
      })
      if (isMatch) { matchIndex = i; break }
    }

    if (matchIndex >= 0) {
      // Update baris yang sudah ada (baris ke matchIndex+1 di sheet, karena 1-indexed)
      const targetRow = matchIndex + 1
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${config.tabName}!A${targetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [newRowValues] },
      })
      return Response.json({ success: true, action: 'updated', row: targetRow })
    } else {
      // Tambah baris baru
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: config.range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [newRowValues] },
      })
      return Response.json({ success: true, action: 'appended' })
    }
  } catch (e) {
    const detail = e?.response?.data?.error || e?.errors || e.message
    console.error('[log-sheet] error:', JSON.stringify(detail, null, 2))
    return Response.json({ error: detail?.message || detail || 'Gagal mencatat ke Sheets' }, { status: 500 })
  }
}
