import type { Metadata } from 'vista';
import { Geist, Geist_Mono } from 'vista/font/google';
import { ThemeProvider, ThemeScript } from 'vista/theme';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'My Vista App',
  description: 'Built with Vista Framework',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="system" />
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
