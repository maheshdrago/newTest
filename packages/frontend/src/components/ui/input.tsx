import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export function Input({ label, error, leftIcon, className, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{label}</label>}
      <div className="relative">
        {leftIcon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">{leftIcon}</div>}
        <input
          className={cn(
            'w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm',
            'placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
            'dark:border-surface-700 dark:bg-surface-900 dark:text-surface-50 dark:focus:border-brand-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            leftIcon && 'pl-10', error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20', className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
