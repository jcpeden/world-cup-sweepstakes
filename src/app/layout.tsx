import type { Metadata } from 'next';
import './globals.css';
import bgImage from '@/assets/bg.jpeg';

export const metadata: Metadata = {
  title: 'World Cup 2026 Sweepstakes',
  description: 'Live sweepstakes standings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div
          className="fixed inset-0 -z-10 scale-110 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImage.src})` }}
        />
        {children}
      </body>
    </html>
  );
}
