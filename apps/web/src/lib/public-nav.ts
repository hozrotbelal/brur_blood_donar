import type { AppRole } from './api';
import type { MessageKey } from './messages';
import type { NavGroup, NavLeaf } from './staff-nav';

const planned = (key: MessageKey): NavLeaf => ({ key, href: `/planned?screen=${key}`, built: false });
const live = (key: MessageKey, href: string): NavLeaf => ({ key, href, built: true });

/** Menus for donors and for patients and representatives, following the BBDA prototype (ADR-15 Amendment 1). */
export const PUBLIC_NAV: Partial<Record<AppRole, NavGroup[]>> = {
  DON: [
    { key: 'nav.don.home', href: '/home', built: true, children: [live('nav.don.home.overview', '/home')] },
    {
      key: 'nav.don.requests',
      href: '/invitations',
      built: true,
      children: [
        live('nav.don.requests.invitations', '/invitations'),
        planned('nav.don.requests.responses'),
        planned('nav.don.requests.destination'),
      ],
    },
    {
      key: 'nav.don.appts',
      href: '/appointments',
      built: true,
      children: [
        live('nav.don.appts.mine', '/appointments'),
        planned('nav.don.appts.attendance'),
        planned('nav.don.appts.locations'),
        planned('nav.don.appts.book'),
        planned('nav.don.appts.campaigns'),
      ],
    },
    { key: 'nav.don.notif', href: '/notifications', built: true, children: [live('nav.don.notif.inbox', '/notifications')] },
    {
      key: 'nav.don.profile',
      href: '/profile',
      built: true,
      children: [
        live('nav.don.profile.personal', '/profile'),
        planned('nav.don.profile.bgv'),
        planned('nav.don.profile.callbacks'),
        planned('nav.don.profile.history'),
        live('nav.don.profile.consent', '/profile/consent'),
        planned('nav.don.profile.security'),
      ],
    },
  ],
  PAT: [
    { key: 'nav.pat.home', href: '/home', built: true, children: [live('nav.pat.home.active', '/home')] },
    {
      key: 'nav.pat.myreq',
      href: '/requests',
      built: true,
      children: [
        live('nav.pat.myreq.new', '/requests/new'),
        live('nav.pat.myreq.drafts', '/requests/drafts'),
        live('nav.pat.myreq.history', '/requests'),
        live('nav.pat.myreq.update', '/requests/update'),
        live('nav.pat.myreq.cancel', '/requests/cancel'),
        planned('nav.pat.myreq.needinfo'),
        planned('nav.pat.myreq.dispute'),
        planned('nav.pat.myreq.appeal'),
      ],
    },
    {
      key: 'nav.pat.support',
      href: '/planned?screen=nav.pat.support',
      built: false,
      children: [planned('nav.pat.support.tickets'), planned('nav.pat.support.chat'), planned('nav.pat.support.callback')],
    },
    { key: 'nav.pat.notif', href: '/notifications', built: true, children: [live('nav.pat.notif.inbox', '/notifications')] },
    {
      key: 'nav.pat.profile',
      href: '/profile',
      built: true,
      children: [
        live('nav.pat.profile.personal', '/profile'),
        planned('nav.pat.profile.reps'),
        planned('nav.pat.profile.emergency'),
        live('nav.pat.profile.consent', '/profile/consent'),
        planned('nav.pat.profile.security'),
      ],
    },
  ],
};

