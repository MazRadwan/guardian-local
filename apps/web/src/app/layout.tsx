import type { Metadata } from 'next';
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
