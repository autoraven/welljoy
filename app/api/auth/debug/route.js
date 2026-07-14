// app/api/auth/debug/route.js
// HAPUS FILE INI setelah selesai debug

export const runtime = 'nodejs'

export async function GET() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN

  // Tampilkan sebagian nilai env var untuk verifikasi (bukan full value)
  const info = {
    CLIENT_ID:     clientId     ? clientId.slice(0,20)+'...'     : '❌ TIDAK ADA',
    CLIENT_SECRET: clientSecret ? clientSecret.slice(0,6)+'...'  : '❌ TIDAK ADA',
    REFRESH_TOKEN: refreshToken ? refreshToken.slice(0,20)+'...' : '❌ TIDAK ADA',
  }

  if (!clientId || !clientSecret || !refreshToken) {
    return Response.json({ error: 'Env var tidak lengkap', info })
  }

  // Coba refresh token ke access token langsung ke Google
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    })

    const json = await res.json()

    if (res.ok) {
      return Response.json({
        status: '✅ OAuth berhasil!',
        access_token_preview: json.access_token?.slice(0,20)+'...',
        expires_in: json.expires_in,
        info,
      })
    } else {
      return Response.json({
        status: '❌ OAuth gagal',
        google_error: json.error,
        google_error_description: json.error_description,
        info,
      }, { status: 400 })
    }
  } catch (e) {
    return Response.json({ status: '❌ Exception', message: e.message, info }, { status: 500 })
  }
}
