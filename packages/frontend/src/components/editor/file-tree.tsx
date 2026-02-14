'use client';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import type { FileTreeItem } from '@/types';

interface FileTreeProps { items: FileTreeItem[]; selectedPath?: string; onSelectFile: (path: string) => void; }

export function FileTree({ items, selectedPath, onSelectFile }: FileTreeProps) {
  return <div className="py-2 text-sm">{items.map((item) => <FileTreeNode key={item.path} item={item} depth={0} selectedPath={selectedPath} onSelectFile={onSelectFile} />)}</div>;
}

function FileTreeNode({ item, depth, selectedPath, onSelectFile }: { item: FileTreeItem; depth: number; selectedPath?: string; onSelectFile: (path: string) => void; }) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const isDir = item.type === 'directory';
  const isSelected = item.path === selectedPath;
  return (
    <div>
      <button
        className={cn('flex items-center gap-1.5 w-full px-2 py-1 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors', isSelected && 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400')}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => { if (isDir) setIsExpanded(!isExpanded); else onSelectFile(item.path); }}
      >
        <span className="text-xs">{isDir ? (isExpanded ? 'v' : '>') : ' '}</span>
        <span className="text-xs">{isDir ? 'D' : 'F'}</span>
        <span className="truncate">{item.name}</span>
      </button>
      {isDir && isExpanded && item.children?.map((child) => <FileTreeNode key={child.path} item={child} depth={depth + 1} selectedPath={selectedPath} onSelectFile={onSelectFile} />)}
    </div>
  );
}
