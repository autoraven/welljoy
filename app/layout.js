import './globals.css'

export const metadata = {
  title: 'WellJoy HRIS',
  description: 'Sistem Informasi Karyawan WellJoy Powder Drink',
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
