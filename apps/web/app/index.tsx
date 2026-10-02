import type { Metadata } from 'vista';
import { Manrope } from 'vista/font/google';
import { HomeExperience } from '@/components/home-experience';
import {
  absoluteUrl,
  siteDescription,
  siteName,
  siteOgImage,
  siteTitle,
} from '@/lib/site';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    absolute: siteTitle,
  },
  description: siteDescription,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    title: siteTitle,
    description: siteDescription,
    siteName,
    images: [{ url: siteOgImage, alt: 'Vista logo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [absoluteUrl(siteOgImage)],
  },
};

export default function Index() {
  return (
    <main
      className={`${manrope.variable} relative bg-background text-foreground`}
      style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}
    >
      <HomeExperience />
    </main>
  );
}
