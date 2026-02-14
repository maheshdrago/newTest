'use client';
import React from 'react';

export function Header() {
  const [darkMode, setDarkMode] = React.useState(false);
  const toggleDarkMode = () => { setDarkMode(!darkMode); document.documentElement.classList.toggle('dark'); };
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md flex-1">
          <input type="text" placeholder="Search projects..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={toggleDarkMode} className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-sm">{darkMode ? 'Light' : 'Dark'}</button>
      </div>
    </header>
  );
}
