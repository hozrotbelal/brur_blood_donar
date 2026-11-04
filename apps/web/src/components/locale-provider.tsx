'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { translate, type Locale, type MessageKey } from '@/lib/messages';

interface LocaleContextValue {
  locale: Locale;
  toggleLocale: () => void;
  t: (key: MessageKey, params?: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  const toggleLocale = useCallback(() => setLocale((current) => (current === 'en' ? 'bn' : 'en')), []);
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, toggleLocale, t: (key, params) => translate(locale, key, params) }),
    [locale, toggleLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider');
  return value;
}
