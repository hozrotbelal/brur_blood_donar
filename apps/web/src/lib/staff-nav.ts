import type { MessageKey } from './messages';
import type { StaffRole } from './api';

export interface NavLeaf {
  key: MessageKey;
  href: string;
  built: boolean;
}

export interface NavHeading {
  heading: MessageKey;
}

export type NavChild = NavLeaf | NavHeading;

export interface NavGroup {
  key: MessageKey;
  href: string;
  built: boolean;
  children: NavChild[];
}

export const isHeading = (child: NavChild): child is NavHeading => 'heading' in child;

const planned = (key: MessageKey): NavLeaf => ({ key, href: `/planned?screen=${key}`, built: false });
const live = (key: MessageKey, href: string): NavLeaf => ({ key, href, built: true });

export const STAFF_NAV: Record<StaffRole, NavGroup[]> = {
  SUP: [
    {
      key: 'nav.sup.queue',
      href: '/queue',
      built: true,
      children: [
        live('nav.sup.queue.all', '/queue'),
        planned('nav.sup.queue.verify'),
        live('nav.sup.queue.cases', '/cases'),
        live('nav.sup.queue.outcomes', '/outcomes'),
        planned('nav.sup.queue.escalations'),
        planned('nav.sup.queue.recovery'),
        planned('nav.sup.queue.audit'),
      ],
    },
    {
      key: 'nav.sup.search',
      href: '/planned?screen=nav.sup.search',
      built: false,
      children: [
        planned('nav.sup.search.map'),
        planned('nav.sup.search.runs'),
        planned('nav.sup.search.batch'),
        planned('nav.sup.search.find'),
        planned('nav.sup.search.contacts'),
      ],
    },
    {
      key: 'nav.sup.conv',
      href: '/planned?screen=nav.sup.conv',
      built: false,
      children: [
        planned('nav.sup.conv.chats'),
        planned('nav.sup.conv.tickets'),
        planned('nav.sup.conv.callbacks'),
        planned('nav.sup.conv.quick'),
        planned('nav.sup.conv.notes'),
        planned('nav.sup.conv.calls'),
      ],
    },
    { key: 'nav.sup.notif', href: '/planned?screen=nav.sup.notif', built: false, children: [planned('nav.sup.notif.inbox')] },
    {
      key: 'nav.sup.reports',
      href: '/planned?screen=nav.sup.reports',
      built: false,
      children: [planned('nav.sup.reports.support'), planned('nav.sup.reports.campaigns'), planned('nav.sup.reports.volunteer')],
    },
  ],
  MOD: [
    {
      key: 'nav.mod.rq',
      href: '/planned?screen=nav.mod.rq',
      built: false,
      children: [
        planned('nav.mod.rq.all'),
        { heading: 'nav.group.byType' },
        planned('nav.mod.rq.dup'),
        planned('nav.mod.rq.susp'),
        planned('nav.mod.rq.fraud'),
        planned('nav.mod.rq.harass'),
        planned('nav.mod.rq.inapp'),
        { heading: 'nav.group.actions' },
        planned('nav.mod.rq.pauses'),
        planned('nav.mod.rq.received'),
        planned('nav.mod.rq.audit'),
        planned('nav.mod.rq.advfraud'),
      ],
    },
    {
      key: 'nav.mod.community',
      href: '/planned?screen=nav.mod.community',
      built: false,
      children: [planned('nav.mod.community.reported'), planned('nav.mod.community.eappeals')],
    },
    { key: 'nav.mod.appeals', href: '/planned?screen=nav.mod.appeals', built: false, children: [planned('nav.mod.appeals.list')] },
    { key: 'nav.mod.notif', href: '/planned?screen=nav.mod.notif', built: false, children: [planned('nav.mod.notif.inbox')] },
    { key: 'nav.mod.reports', href: '/planned?screen=nav.mod.reports', built: false, children: [planned('nav.mod.reports.mod')] },
  ],
  ADM: [
    {
      key: 'nav.adm.dash',
      href: '/planned?screen=nav.adm.dash',
      built: false,
      children: [
        planned('nav.adm.dash.overview'),
        planned('nav.adm.dash.map'),
        { heading: 'nav.group.settings' },
        planned('nav.adm.dash.config'),
        planned('nav.adm.dash.templates'),
        planned('nav.adm.dash.events'),
        planned('nav.adm.dash.windows'),
        planned('nav.adm.dash.reminders'),
        planned('nav.adm.dash.limits'),
        planned('nav.adm.dash.sla'),
        planned('nav.adm.dash.rules'),
        planned('nav.adm.dash.pause'),
        planned('nav.adm.dash.bulk'),
        planned('nav.adm.dash.failures'),
        planned('nav.adm.dash.privacy'),
        planned('nav.adm.dash.community'),
      ],
    },
    {
      key: 'nav.adm.cases',
      href: '/planned?screen=nav.adm.cases',
      built: false,
      children: [planned('nav.adm.cases.delayed'), planned('nav.adm.cases.all'), planned('nav.adm.cases.history')],
    },
    {
      key: 'nav.adm.team',
      href: '/team/staff',
      built: true,
      children: [
        live('nav.adm.team.staff', '/team/staff'),
        live('nav.adm.team.invitations', '/team/invitations'),
        live('nav.adm.team.roles', '/team/roles'),
        live('nav.adm.team.access', '/team/access'),
        planned('nav.adm.team.recovery'),
        planned('nav.adm.team.logins'),
      ],
    },
    { key: 'nav.adm.notif', href: '/planned?screen=nav.adm.notif', built: false, children: [planned('nav.adm.notif.inbox')] },
    {
      key: 'nav.adm.reports',
      href: '/planned?screen=nav.adm.reports',
      built: false,
      children: [planned('nav.adm.reports.org'), planned('nav.adm.reports.delivery'), planned('nav.adm.reports.audit')],
    },
  ],
};
