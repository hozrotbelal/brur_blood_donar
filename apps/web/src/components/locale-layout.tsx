'use client';

import type { ReactNode } from 'react';
import { LocaleProvider } from './locale-provider';

export function LocaleLayout({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}
