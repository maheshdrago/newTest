'use client';
import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ChatMessage } from '@/types';

interface ChatPanelProps { messages: ChatMessage[]; onSendMessage: (message: string) => void; isGenerating: boolean; }

export function ChatPanel({ messages, onSendMessage, isGenerating }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    onSendMessage(input.trim());
    setInput('');
  };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center mb-4 text-white text-2xl">AI</div>
            <h3 className="text-lg font-semibold mb-2">Start Building</h3>
            <p className="text-surface-500 text-sm max-w-sm">Describe what you want to build and AI will generate the code for you.</p>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={cn('flex gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}>
            {message.role === 'assistant' && <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0 text-white text-xs">AI</div>}
            <div className={cn('max-w-[80%] rounded-xl px-4 py-3 text-sm', message.role === 'user' ? 'bg-brand-600 text-white' : 'bg-surface-100 dark:bg-surface-800')}>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.fileChanges && message.fileChanges.length > 0 && <div className="mt-2 pt-2 border-t border-white/20"><p className="text-xs opacity-75">{message.fileChanges.length} files modified</p></div>}
            </div>
            {message.role === 'user' && <div className="w-8 h-8 rounded-lg bg-surface-200 dark:bg-surface-700 flex items-center justify-center flex-shrink-0 text-xs">You</div>}
          </div>
        ))}
        {isGenerating && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0 text-white text-xs">AI</div>
            <div className="bg-surface-100 dark:bg-surface-800 rounded-xl px-4 py-3"><div className="flex items-center gap-2 text-sm text-surface-500">Generating code...</div></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t dark:border-surface-800 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea ref={useRef(null)} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Describe what you want to build..." rows={1} className="flex-1 resize-none rounded-xl border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
          <Button type="submit" disabled={!input.trim() || isGenerating}>Send</Button>
        </form>
      </div>
    </div>
  );
}
