// app/lib/google-auth.js
//
// Helper bersama untuk dapat OAuth2 client (akun Google pribadi via refresh_token).
// Dipakai oleh /api/upload-drive dan /api/log-sheet supaya tidak duplikat kode.

import { google } from 'googleapis'

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Env var OAuth (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) belum lengkap')
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

export function getDriveClient() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() })
}

export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getOAuth2Client() })
}
