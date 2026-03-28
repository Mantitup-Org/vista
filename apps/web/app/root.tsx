import type { Metadata } from 'vista';
import { Geist, Geist_Mono } from 'vista/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ThemeProvider, ThemeScript } from 'vista/theme';
import {
  absoluteUrl,
  siteDescription,
  siteKeywords,
  siteLocale,
  siteName,
  siteOgImage,
  siteTitle,
  siteUrl,
} from '@/lib/site';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: '%s | Vista',
  },
  description: siteDescription,
  applicationName: siteName,
  authors: [{ name: 'Vista Team', url: siteUrl }],
  creator: 'Vista Team',
  publisher: 'Vista Team',
  generator: 'Vista',
  referrer: 'origin-when-cross-origin',
  keywords: siteKeywords,
  robots: {
    index: true,
    follow: true,
    'max-snippet': -1,
    'max-image-preview': 'large',
    'max-video-preview': -1,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [{ url: '/favicon.ico' }],
    shortcut: [{ url: '/favicon.ico' }],
    apple: [{ url: '/favicon.ico' }],
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: '/',
    siteName,
    locale: siteLocale,
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: siteOgImage,
        alt: 'Vista logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [absoluteUrl(siteOgImage)],
  },
  category: 'technology',
  other: {
    'theme-color': '#000000',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      url: siteUrl,
      description: siteDescription,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: siteName,
      url: siteUrl,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      description: siteDescription,
    },
  ];

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="dark" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="dark">
          <div className="flex min-h-screen flex-col">
            <Navbar />
            {children}
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
