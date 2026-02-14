'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth-store';

const navItems = [
  { href: '/projects', label: 'Projects', icon: 'P' },
  { href: '/settings', label: 'Settings', icon: 'S' },
  { href: '/profile', label: 'Profile', icon: 'U' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  return (
    <aside className="flex flex-col w-64 h-screen border-r border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950">
      <div className="flex items-center gap-3 px-6 py-5 border-b dark:border-surface-800">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl gradient-brand text-white font-bold text-sm">B</div>
        <div><h1 className="font-bold text-lg gradient-text">BuildCraft</h1><p className="text-xs text-surface-500">AI App Builder</p></div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
            )}>
              <span className="w-5 h-5 rounded bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t dark:border-surface-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-white text-sm font-medium">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{user?.name || 'User'}</p><p className="text-xs text-surface-500 truncate">{user?.email}</p></div>
          <button onClick={logout} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-xs" title="Logout">Out</button>
        </div>
      </div>
    </aside>
  );
}
