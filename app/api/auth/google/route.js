// app/api/auth/google/route.js
//
// Langkah 1 dari setup OAuth2: buka URL ini di browser (sekali saja, manual)
// untuk login dengan akun Google pribadimu dan dapat izin akses Drive.
// Setelah itu kamu akan diarahkan ke /api/auth/google/callback yang akan
// menampilkan REFRESH TOKEN — simpan itu ke env var, lalu route ini bisa dihapus.

import { google } from 'googleapis'

export const runtime = 'nodejs'

export async function GET(request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI // contoh: https://welljoy.vercel.app/api/auth/google/callback

  if (!clientId || !clientSecret || !redirectUri) {
    return Response.json({
      error: 'Set dulu env var GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI',
    }, { status: 500 })
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',       // wajib, supaya dapat refresh_token
    prompt: 'consent',            // wajib, supaya refresh_token selalu dikirim ulang
    scope: ['https://www.googleapis.com/auth/drive'],
  })

  // Redirect langsung ke halaman consent Google
  return Response.redirect(url, 302)
}
