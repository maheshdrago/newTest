'use client';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface PreviewPanelProps { url?: string; html?: string; }

export function PreviewPanel({ url, html }: PreviewPanelProps) {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [key, setKey] = useState(0);
  const widths = { desktop: '100%', tablet: '768px', mobile: '375px' };
  return (
    <div className="h-full flex flex-col bg-surface-100 dark:bg-surface-900">
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-surface-950 border-b dark:border-surface-800">
        <div className="flex items-center gap-1">
          {(['desktop', 'tablet', 'mobile'] as const).map((vp) => (
            <button key={vp} onClick={() => setViewport(vp)} className={cn('px-2 py-1 rounded text-xs transition-colors', viewport === vp ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800')}>{vp}</button>
          ))}
        </div>
        <button onClick={() => setKey(k => k + 1)} className="px-2 py-1 rounded text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800">Refresh</button>
      </div>
      <div className="flex-1 flex items-start justify-center overflow-auto p-4">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300" style={{ width: widths[viewport], height: '100%' }}>
          {url ? <iframe key={key} src={url} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts allow-same-origin" /> : html ? <iframe key={key} srcDoc={html} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts" /> : <div className="flex items-center justify-center h-full text-surface-400"><p className="text-sm">No preview available. Generate code to see a preview.</p></div>}
        </div>
      </div>
    </div>
  );
}
