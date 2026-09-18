import type { Metadata, Viewport } from 'next';
import './globals.css';
const publicBasePath = process.env.GITHUB_PAGES === 'true' ? '/reel-town' : '';
export const metadata: Metadata = {
  title: 'Reel Town',
  description: 'Fish, wander, play and chat together on a cozy island.',
  // An iPhone cannot put a tab in full screen, so the way to play without the browser
  // around the harbour is to install it: standalone display, and an icon to launch it.
  manifest: `${publicBasePath}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: 'Reel Town', statusBarStyle: 'black-translucent' },
  icons: { icon: `${publicBasePath}/favicon.svg`, apple: `${publicBasePath}/apple-touch-icon.png` },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The HUD already pads itself with env(safe-area-inset-*); without cover those are zero.
  viewportFit: 'cover',
  themeColor: '#27443a',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* iOS before 16.4 reads standalone from this tag rather than the manifest. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {children}
      </body>
    </html>
  );
}
