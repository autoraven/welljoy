// app/api/upload-drive/route.js
//
// API Route untuk upload file ke Google Drive via Service Account.
// Browser kirim file ke endpoint ini, lalu server (yang punya kredensial aman)
// yang upload ke Drive. Kredensial TIDAK PERNAH terkirim ke browser.

import { google } from 'googleapis'
import { Readable } from 'stream'

export const runtime = 'nodejs'

// ── Setup Service Account dari Environment Variable ──
function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}')
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

// ── Cari atau buat folder di Drive, return folder ID ──
async function findOrCreateFolder(drive, name, parentId) {
  const q = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`

  const res = await drive.files.list({
    q, fields: 'files(id, name)', spaces: 'drive',
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  })
  if (res.data.files.length > 0) return res.data.files[0].id

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  return folder.data.id
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const tanggal = formData.get('tanggal')   // contoh: 2025-06-22
    const nip = formData.get('nip')           // contoh: 10001
    const nama = formData.get('nama')         // contoh: Ayu Lestari
    const kategori = formData.get('kategori') // 'absensi' | 'izin'
    const fileName = formData.get('fileName') // nama file final, contoh: masuk_0805.jpg

    if (!file || !tanggal || !nip || !kategori) {
      return Response.json({ error: 'Parameter tidak lengkap' }, { status: 400 })
    }

    const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID // folder utama "WellJoy HRIS"
    if (!ROOT_FOLDER_ID) {
      return Response.json({ error: 'GOOGLE_DRIVE_ROOT_FOLDER_ID belum diset' }, { status: 500 })
    }

    const drive = getDriveClient()

    // Struktur: ROOT / Absensi atau Lampiran-Izin / 2025-06-22 / 10001_Nama / file.jpg
    const kategoriFolderName = kategori === 'izin' ? 'Lampiran-Izin' : 'Absensi'
    const kategoriFolderId = await findOrCreateFolder(drive, kategoriFolderName, ROOT_FOLDER_ID)
    const tanggalFolderId = await findOrCreateFolder(drive, tanggal, kategoriFolderId)
    const namaFolderSafe = `${nip}_${(nama || 'Karyawan').replace(/[^a-zA-Z0-9 ]/g, '').trim()}`
    const nipFolderId = await findOrCreateFolder(drive, namaFolderSafe, tanggalFolderId)

    // Convert file (Blob dari formData) jadi buffer untuk upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const stream = Readable.from(buffer)

    const uploaded = await drive.files.create({
      requestBody: {
        name: fileName || file.name || `file_${Date.now()}`,
        parents: [nipFolderId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: stream,
      },
      fields: 'id, webViewLink, webContentLink',
      supportsAllDrives: true,
    })

    // Set permission agar bisa diakses dengan link (opsional, hanya readonly oleh siapapun yg punya link)
    await drive.permissions.create({
      fileId: uploaded.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    })

    return Response.json({
      success: true,
      fileId: uploaded.data.id,
      webViewLink: uploaded.data.webViewLink,
      folderPath: `${kategoriFolderName}/${tanggal}/${namaFolderSafe}/${fileName}`,
    })
  } catch (e) {
    // Google API error biasanya nyimpen detail asli di e.response.data atau e.errors
    const detail = e?.response?.data?.error || e?.errors || e.message
    console.error('[upload-drive] error:', JSON.stringify(detail, null, 2))
    return Response.json({ error: detail?.message || detail || 'Upload ke Drive gagal' }, { status: 500 })
  }
}
