import { manifest } from 'vista/metadata';
import { siteDescription, siteName } from '../../lib/site';

export default function webManifest() {
  return manifest({
    name: siteName,
    short_name: siteName,
    description: siteDescription,
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
  });
}
