'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { components } from '@bbda/api-client';
import { currentRole, homeFor, restoreSession, setSession, type AppRole } from '@/lib/api';
import type { MessageKey } from '@/lib/messages';
import { apiCall } from '@/lib/staff-data';
import { isHeading, type NavChild, type NavGroup, type NavLeaf } from '@/lib/staff-nav';
import { GROUP_ICON, Icon } from './icons';
import { useLocale } from './locale-provider';

type T = (key: MessageKey) => string;
type Me = components['schemas']['MeDto'];

const pathOf = (href: string) => href.split('?')[0];

/** Exactly one sub-item is active: a built item matches the most specific path, a planned item matches its own screen. */
function activeLeaf(groups: NavGroup[], pathname: string, screen: string): { leaf: NavLeaf; group: NavGroup } | null {
  let best: { leaf: NavLeaf; group: NavGroup; score: number } | null = null;
  for (const group of groups) {
    for (const child of group.children) {
      if (isHeading(child)) continue;
      let score = -1;
      if (child.built) {
        const path = pathOf(child.href);
        if (pathname === path) score = path.length + 1000;
        else if (pathname.startsWith(`${path}/`)) score = path.length;
      } else if (pathname === '/planned' && screen === child.key) {
        score = 1_000_000;
      }
      if (score >= 0 && (!best || score > best.score)) best = { leaf: child, group, score };
    }
  }
  return best ? { leaf: best.leaf, group: best.group } : null;
}

function initials(name: string | null | undefined, fallback: string): string {
  const source = (name ?? '').trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '') || '•';
}

function Children({ items, activeKey, onSelect, t }: { items: NavChild[]; activeKey: string | null; onSelect: (key: string) => void; t: T }) {
  return (
    <div className="nav-children">
      {items.map((child, index) =>
        isHeading(child) ? (
          <div key={index} className="nav-heading">
            {t(child.heading)}
          </div>
        ) : (
          <Link
            key={child.key}
            href={child.href}
            className={`nav-child${child.key === activeKey ? ' active' : ''}${child.built ? '' : ' planned'}`}
            aria-current={child.key === activeKey ? 'page' : undefined}
            onClick={() => onSelect(child.key)}
          >
            {t(child.key)}
          </Link>
        ),
      )}
    </div>
  );
}

function Menu({ groups, activeKey, onSelect, t }: { groups: NavGroup[]; activeKey: string | null; onSelect: (key: string) => void; t: T }) {
  return (
    <nav aria-label="Main">
      {groups.map((group) => {
        const active = group.children.some((child) => !isHeading(child) && child.key === activeKey);
        const hasChildren = group.children.length > 0;
        return (
          <div key={group.key} className="nav-block">
            <Link href={group.href} className={`nav-group${active ? ' active' : ''}`} aria-current={active ? 'true' : undefined}>
              <span className="nav-icon">
                <Icon name={GROUP_ICON[group.key] ?? 'grid'} />
              </span>
              <span className="nav-label">{t(group.key)}</span>
              {hasChildren && <Icon name={active ? 'chevD' : 'chevR'} size={16} />}
            </Link>
            {active && <Children items={group.children} activeKey={activeKey} onSelect={onSelect} t={t} />}
          </div>
        );
      })}
    </nav>
  );
}

interface AppShellProps {
  roles: AppRole[];
  nav: Partial<Record<AppRole, NavGroup[]>>;
  children: ReactNode;
}

/** One shell for every signed-in area. Each area lists the roles it accepts; other roles are sent to their own home. */
export function AppShell({ roles, nav, children }: AppShellProps) {
  const { t, toggleLocale, locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<AppRole | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [screen, setScreen] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then(() => {
        if (cancelled) return;
        const current = currentRole();
        if (!current) {
          router.replace('/sign-in');
          return;
        }
        if (!roles.includes(current)) {
          router.replace(homeFor(current));
          return;
        }
        setRole(current);
      })
      .catch(() => {
        if (!cancelled) router.replace('/sign-in');
      });
    return () => {
      cancelled = true;
    };
  }, [router, roles]);

  useEffect(() => {
    if (!role) return;
    apiCall<Me>('GET', '/api/v1/me')
      .then(setMe)
      .catch(() => setMe(null));
  }, [role]);

  useEffect(() => {
    if (!role) return;
    apiCall<{ unread: number }>('GET', '/api/v1/notifications/unread-count')
      .then((result) => setUnread(result.unread))
      .catch(() => setUnread(null));
  }, [role, pathname]);

  useEffect(() => {
    setMenuOpen(false);
    setUserOpen(false);
    setQuery('');
    setScreen(new URLSearchParams(window.location.search).get('screen') ?? '');
  }, [pathname]);

  const groups = role ? (nav[role] ?? []) : [];
  const current = useMemo(() => activeLeaf(groups, pathname, screen), [groups, pathname, screen]);
  const leaves = useMemo(
    () => groups.flatMap((group) => group.children.filter((child): child is NavLeaf => !isHeading(child)).map((leaf) => ({ leaf, group }))),
    [groups],
  );
  const matches = query.trim()
    ? leaves.filter(({ leaf, group }) => {
        const needle = query.trim().toLowerCase();
        return t(leaf.key).toLowerCase().includes(needle) || t(group.key).toLowerCase().includes(needle);
      })
    : [];

  if (!role) return <p role="status" className="main">{t('queue.loading')}</p>;

  const home = homeFor(role);
  const bellHref = role === 'DON' || role === 'PAT' ? '/notifications' : `/planned?screen=nav.${role.toLowerCase()}.notif`;
  const name = me?.displayName ?? null;

  const signOut = () => {
    setSession(null);
    router.replace('/sign-in');
  };

  const signOutOthers = async () => {
    setUserOpen(false);
    try {
      const result = await apiCall<{ revoked: number }>('POST', '/api/v1/auth/sessions/sign-out-others');
      setNotice(t('shell.othersSignedOut').replace('{count}', String(result.revoked)));
    } catch {
      setNotice(t('error.generic'));
    }
  };

  return (
    <div className="shell" lang={locale}>
      <header className="topbar">
        <button type="button" className="btn btn-small menu-toggle" aria-expanded={menuOpen} aria-controls="app-menu" onClick={() => setMenuOpen((open) => !open)}>
          {t('shell.menu')}
        </button>
        <Link href={home} className="brand">
          <span className="logo" aria-hidden="true">
            <Icon name="droplet" size={20} />
          </span>
          <span>
            <b>{t('app.name')}</b>
            <small>{t('app.subtitle')}</small>
          </span>
        </Link>

        <div className="gsearch">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('shell.searchPlaceholder')}
            aria-label={t('shell.searchLabel')}
            autoComplete="off"
          />
          {matches.length > 0 && (
            <div className="gs-res" role="listbox">
              {matches.slice(0, 8).map(({ leaf, group }) => (
                <Link key={leaf.key} href={leaf.href} className="gs-item">
                  <b>{t(leaf.key)}</b>
                  <small>
                    {t(group.key)}
                  </small>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="topbar-end">
          <span className="portal-pill">{t(`portal.${role}` as MessageKey)}</span>
          <button type="button" className="btn btn-small" onClick={toggleLocale}>
            {t('language.switch')}
          </button>
          <Link href={bellHref} className="icon-btn" aria-label={t('shell.bell')}>
            <Icon name="bell" />
            {unread !== null && unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
          </Link>
          <div className="who-wrap">
            <button type="button" className="who" aria-haspopup="true" aria-expanded={userOpen} onClick={() => setUserOpen((open) => !open)}>
              <span className="av">{initials(name, role)}</span>
              <span className="who-text">
                <b>{name ?? t('shell.you')}</b>
                <small>{t(`role.${role}` as MessageKey)}</small>
              </span>
            </button>
            {userOpen && (
              <div className="dropdown" role="menu">
                <div className="dh">
                  <b>{name ?? t('shell.you')}</b>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {t(`role.${role}` as MessageKey)}
                  </div>
                </div>
                <button type="button" role="menuitem" onClick={signOutOthers}>
                  <Icon name="key" size={16} />
                  {t('shell.signOutOthers')}
                </button>
                <div className="sep" />
                <button type="button" role="menuitem" onClick={signOut}>
                  <Icon name="logout" size={16} />
                  {t('shell.signOut')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {notice && (
        <p role="status" className="alert ok notice-bar" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}

      <div className="body">
        <aside id="app-menu" className={`sidebar${menuOpen ? '' : ' closed'}`}>
          <div className="menu-title">{t(`menu.${role}` as MessageKey)}</div>
          <Menu groups={groups} activeKey={current?.leaf.key ?? null} onSelect={setScreen} t={t} />
          <button type="button" className="signout" onClick={signOut}>
            <Icon name="logout" />
            <span>{t('shell.signOut')}</span>
          </button>
        </aside>
        <main id="content" className="main">
          {current && (
            <div className="crumb">
              {t(`role.${role}` as MessageKey)} › {t(current.group.key)} › <b>{t(current.leaf.key)}</b>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
