import './globals.css'

export const metadata = {
  title: 'WellJoy HRIS',
  description: 'Sistem Informasi Karyawan WellJoy Powder Drink',
  icons: {
    icon: '/logo/welljoy-logo.png',
    apple: '/logo/welljoy-logo.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="icon" href="/logo/welljoy-logo.png" type="image/png"/>
        <link rel="apple-touch-icon" href="/logo/welljoy-logo.png"/>
      </head>
      <body>{children}</body>
    </html>
  )
}
