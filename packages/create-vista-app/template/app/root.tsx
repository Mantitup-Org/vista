import type { Metadata } from 'vista';
import { Geist, Geist_Mono } from 'vista/font/google';
import { ThemeProvider, ThemeScript } from 'vista/theme';
import { JsonLd } from 'vista/metadata';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const siteUrl = process.env.VISTA_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'My Vista App',
    template: '%s | My Vista App',
  },
  description: 'Built with Vista Framework — React, fullstack, and AI-ready.',
  applicationName: 'My Vista App',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'My Vista App',
    title: 'My Vista App',
    description: 'Built with Vista Framework — React, fullstack, and AI-ready.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'My Vista App' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'My Vista App',
    description: 'Built with Vista Framework — React, fullstack, and AI-ready.',
    images: ['/opengraph-image'],
  },
  other: {
    'theme-color': '#111111',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'My Vista App',
    url: siteUrl,
    description: 'Built with Vista Framework — React, fullstack, and AI-ready.',
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="system" />
        <JsonLd data={structuredData} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-hidden antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="system">{children}</ThemeProvider>
      </body>
    </html>
  );
}
