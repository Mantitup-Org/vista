import type { Metadata } from 'vista';
import { Geist, Geist_Mono } from 'vista/font/google';
import { AppProviders } from '../components/app-providers';
import { ThemeScript } from '../components/theme-script';
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
  title: 'Vista RAG Demo',
  description: 'Agentic RAG playground built with create-vista-app',
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
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
