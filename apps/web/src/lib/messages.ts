import en from '../../messages/en.json';
import bn from '../../messages/bn.json';

export type Locale = 'en' | 'bn';
export type MessageKey = keyof typeof en;

const catalogues: Record<Locale, Record<string, string>> = { en, bn };

export function translate(locale: Locale, key: MessageKey, params?: Record<string, string>): string {
  let text = catalogues[locale][key] ?? en[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replace(`{${name}}`, value);
  }
  return text;
}

export function hasMessage(key: string): key is MessageKey {
  return key in en;
}
