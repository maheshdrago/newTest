'use client';
import React from 'react';

interface CodeEditorProps { value: string; language: string; path: string; onChange?: (value: string) => void; readOnly?: boolean; }

export function CodeEditor({ value, language, path, onChange, readOnly = false }: CodeEditorProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-4 py-2 bg-surface-50 dark:bg-surface-900 border-b dark:border-surface-800 text-xs text-surface-500">
        <span className="font-mono">{path}</span>
        <span className="ml-auto">{language}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <textarea value={value} onChange={(e) => onChange?.(e.target.value)} readOnly={readOnly} className="w-full h-full p-4 bg-surface-950 text-surface-100 font-mono text-sm resize-none focus:outline-none" spellCheck={false} />
      </div>
    </div>
  );
}
