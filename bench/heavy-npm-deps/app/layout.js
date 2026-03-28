import './globals.css'

export const metadata = {
  title: 'Vista Heavy NPM Deps',
  description: 'Heavy dependency benchmark fixture',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
