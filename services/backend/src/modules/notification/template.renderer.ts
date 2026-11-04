import { Lang, Vars } from './notification.types';

export function render(text: string, vars: Vars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => String(vars[key] ?? ''));
}

const URGENCY: Record<Lang, Record<string, string>> = {
  en: { Critical: 'critical', Urgent: 'urgent', Routine: 'routine' },
  bn: { Critical: 'অতি জরুরি', Urgent: 'জরুরি', Routine: 'নিয়মিত' },
};

const APPOINTMENT: Record<Lang, Record<string, string>> = {
  en: { proposed: 'proposed', confirmed: 'confirmed' },
  bn: { proposed: 'প্রস্তাবিত', confirmed: 'নিশ্চিত' },
};

const OUTCOME: Record<Lang, Record<string, string>> = {
  en: { fulfilled: 'fully fulfilled', partial: 'partly fulfilled' },
  bn: { fulfilled: 'সম্পূর্ণ পূরণ হয়েছে', partial: 'আংশিক পূরণ হয়েছে' },
};

export const urgencyLabel = (lang: Lang, urgency: string) => URGENCY[lang][urgency] ?? urgency;
export const appointmentLabel = (lang: Lang, key: string) => APPOINTMENT[lang][key] ?? key;
export const outcomeLabel = (lang: Lang, key: string) => OUTCOME[lang][key] ?? key;

export function formatTime(lang: Lang, when: Date): string {
  return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(when);
}

const SECURITY_EVENT: Record<Lang, Record<string, string>> = {
  en: {
    PASSWORD_CHANGED: 'Password changed',
    PASSWORD_RESET: 'Password reset',
    NEW_DEVICE: 'Sign-in from a new device',
    ACCOUNT_LOCKED: 'Account locked after repeated failed sign-ins',
    SUSPICIOUS_SIGN_IN_REPORTED: 'Unknown sign-in reported and other devices signed out',
  },
  bn: {
    PASSWORD_CHANGED: 'পাসওয়ার্ড পরিবর্তন হয়েছে',
    PASSWORD_RESET: 'পাসওয়ার্ড রিসেট হয়েছে',
    NEW_DEVICE: 'নতুন ডিভাইস থেকে সাইন-ইন',
    ACCOUNT_LOCKED: 'বারবার ভুল সাইন-ইনের পর অ্যাকাউন্ট লক হয়েছে',
    SUSPICIOUS_SIGN_IN_REPORTED: 'অজানা সাইন-ইন রিপোর্ট করা হয়েছে এবং অন্য ডিভাইসগুলো সাইন-আউট হয়েছে',
  },
};

export const securityEventLabel = (lang: Lang, kind: string) => SECURITY_EVENT[lang][kind] ?? kind;
