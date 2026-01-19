import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { TitleLoadingCleanup } from '@/components/chat/TitleLoadingCleanup';
import './globals.css';

export const metadata: Metadata = {
  title: 'Guardian - AI Vendor Assessment',
  description: 'Healthcare AI vendor risk assessment platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* Story 26.3: Clean up stale title loading states on app initialization */}
        <TitleLoadingCleanup />
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
