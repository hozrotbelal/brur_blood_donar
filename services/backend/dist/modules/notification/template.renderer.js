"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityEventLabel = exports.outcomeLabel = exports.appointmentLabel = exports.urgencyLabel = void 0;
exports.render = render;
exports.formatTime = formatTime;
function render(text, vars) {
    return text.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(vars[key] ?? ''));
}
const URGENCY = {
    en: { Critical: 'critical', Urgent: 'urgent', Routine: 'routine' },
    bn: { Critical: 'অতি জরুরি', Urgent: 'জরুরি', Routine: 'নিয়মিত' },
};
const APPOINTMENT = {
    en: { proposed: 'proposed', confirmed: 'confirmed' },
    bn: { proposed: 'প্রস্তাবিত', confirmed: 'নিশ্চিত' },
};
const OUTCOME = {
    en: { fulfilled: 'fully fulfilled', partial: 'partly fulfilled' },
    bn: { fulfilled: 'সম্পূর্ণ পূরণ হয়েছে', partial: 'আংশিক পূরণ হয়েছে' },
};
const urgencyLabel = (lang, urgency) => URGENCY[lang][urgency] ?? urgency;
exports.urgencyLabel = urgencyLabel;
const appointmentLabel = (lang, key) => APPOINTMENT[lang][key] ?? key;
exports.appointmentLabel = appointmentLabel;
const outcomeLabel = (lang, key) => OUTCOME[lang][key] ?? key;
exports.outcomeLabel = outcomeLabel;
function formatTime(lang, when) {
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
        timeZone: 'Asia/Dhaka',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(when);
}
const SECURITY_EVENT = {
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
const securityEventLabel = (lang, kind) => SECURITY_EVENT[lang][kind] ?? kind;
exports.securityEventLabel = securityEventLabel;
//# sourceMappingURL=template.renderer.js.map