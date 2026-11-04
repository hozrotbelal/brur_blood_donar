import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LocaleLayout } from '@/components/locale-layout';
import './globals.css';

export const metadata: Metadata = {
  title: 'BBDA Staff portal',
  description: 'BBDA staff web portal for Support, Moderation and Administrator',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LocaleLayout>{children}</LocaleLayout>
      </body>
    </html>
  );
}
