// app/api/auth/google/callback/route.js
//
// Langkah 2: Google akan redirect ke sini setelah kamu klik "Allow".
// Route ini menukar "code" jadi access_token + refresh_token, lalu
// MENAMPILKAN refresh_token di halaman ini (sekali tampil saja).
//
// PENTING: copy refresh_token itu ke env var GOOGLE_OAUTH_REFRESH_TOKEN,
// lalu HAPUS dua file route (/api/auth/google dan /api/auth/google/callback)
// dari project setelah selesai — supaya endpoint ini tidak bisa dipakai orang lain.

import { google } from 'googleapis'

export const runtime = 'nodejs'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')

  if (errorParam) {
    return new Response(`<h2>Gagal: ${errorParam}</h2>`, { headers: { 'Content-Type': 'text/html' } })
  }
  if (!code) {
    return new Response('<h2>Parameter "code" tidak ditemukan.</h2>', { headers: { 'Content-Type': 'text/html' } })
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

  try {
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      return new Response(`
        <h2>Tidak ada refresh_token dikembalikan.</h2>
        <p>Kemungkinan kamu sudah pernah authorize app ini sebelumnya tanpa revoke.
        Buka <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>,
        cabut akses app ini, lalu ulangi dari /api/auth/google.</p>
      `, { headers: { 'Content-Type': 'text/html' } })
    }

    // Tampilkan token di halaman (HANYA untuk kamu copy manual, sekali ini saja)
    return new Response(`
      <html>
        <body style="font-family: monospace; padding: 24px; max-width: 700px;">
          <h2>✅ Berhasil! Copy refresh_token di bawah ini:</h2>
          <textarea readonly style="width:100%;height:100px;padding:10px;font-size:13px;">${tokens.refresh_token}</textarea>
          <p>Langkah selanjutnya:</p>
          <ol>
            <li>Copy nilai di atas (tanpa tanda kutip)</li>
            <li>Tambahkan ke Environment Variables di Vercel: <b>GOOGLE_OAUTH_REFRESH_TOKEN</b></li>
            <li>Redeploy project</li>
            <li>Setelah upload berhasil, <b>hapus file</b> <code>app/api/auth/google/route.js</code> dan
                <code>app/api/auth/google/callback/route.js</code> dari repo, lalu commit & push</li>
          </ol>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
  } catch (e) {
    console.error('[oauth-callback] error:', e?.response?.data || e.message)
    return new Response(`<h2>Error: ${e.message}</h2>`, { headers: { 'Content-Type': 'text/html' }, status: 500 })
  }
}
