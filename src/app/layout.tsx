import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'World Cup 2026 Sweepstakes',
  description: 'Live sweepstakes standings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-100">{children}</body>
    </html>
  );
}
