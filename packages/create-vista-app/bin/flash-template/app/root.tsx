import type { Metadata } from 'vista';
import { Geist, Geist_Mono } from 'vista/font/google';
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
      <head />
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-hidden bg-black text-zinc-100 antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
