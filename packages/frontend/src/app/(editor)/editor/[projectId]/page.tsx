'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { FileTree } from '@/components/editor/file-tree';
import { CodeEditor } from '@/components/editor/code-editor';
import { ChatPanel } from '@/components/chat/chat-panel';
import { PreviewPanel } from '@/components/preview/preview-panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProjectStore } from '@/lib/stores/project-store';
import Link from 'next/link';
import type { FileTreeItem, ChatMessage } from '@/types';

type ActivePanel = 'code' | 'preview' | 'split';

function buildFileTree(files: Array<{ path: string; content: string; language: string }>): FileTreeItem[] {
  const root: FileTreeItem[] = [];
  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const existingPath = parts.slice(0, i + 1).join('/');
      let existing = current.find((item) => item.name === part);
      if (!existing) {
        existing = { name: part, path: existingPath, type: isFile ? 'file' : 'directory', language: isFile ? file.language : undefined, children: isFile ? undefined : [] };
        current.push(existing);
      }
      if (!isFile) current = existing.children!;
    }
  }
  return root;
}

export default function EditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { currentProject, fetchProject, generateCode, deployProject } = useProjectStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>('split');
  const [showChat, setShowChat] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => { if (projectId) fetchProject(projectId); }, [projectId, fetchProject]);

  const fileTree = currentProject ? buildFileTree(currentProject.files) : [];
  const selectedFileContent = currentProject?.files.find((f) => f.path === selectedFile);

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = { id: `msg_${Date.now()}`, role: 'user', content, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setIsGenerating(true);
    try {
      const result = await generateCode(projectId, content);
      const assistantMessage: ChatMessage = { id: `msg_${Date.now()}_ai`, role: 'assistant', content: result.message, timestamp: new Date(), fileChanges: result.fileChanges };
      setMessages((prev) => [...prev, assistantMessage]);
      if (result.fileChanges?.length > 0 && !selectedFile) setSelectedFile(result.fileChanges[0].path);
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: `msg_${Date.now()}_err`, role: 'assistant', content: `Error: ${err.message}`, timestamp: new Date() }]);
    } finally { setIsGenerating(false); }
  }, [projectId, generateCode, selectedFile]);

  const handleDeploy = async () => {
    try {
      const result = await deployProject(projectId);
      setMessages((prev) => [...prev, { id: `msg_${Date.now()}_deploy`, role: 'assistant', content: `Deployed! URL: ${result.deployment.url}`, timestamp: new Date() }]);
    } catch (err: any) { console.error('Deploy failed:', err); }
  };

  if (!currentProject) return <div className="flex items-center justify-center h-screen"><div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-surface-950">
      <header className="flex items-center justify-between px-4 py-2 border-b dark:border-surface-800">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800">&larr;</Link>
          <div><h1 className="font-semibold text-sm">{currentProject.name}</h1><div className="flex items-center gap-2"><Badge variant="info" size="sm">{currentProject.framework}</Badge><Badge variant={currentProject.status === 'ready' ? 'success' : 'default'} size="sm">{currentProject.status}</Badge></div></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg dark:border-surface-700 overflow-hidden">
            {(['code', 'split', 'preview'] as const).map((panel) => (
              <button key={panel} onClick={() => setActivePanel(panel)} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', activePanel === panel ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800')}>{panel}</button>
            ))}
          </div>
          <button onClick={() => setShowChat(!showChat)} className={cn('p-2 rounded-lg transition-colors text-xs', showChat ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30' : 'text-surface-500 hover:bg-surface-100')}>Chat</button>
          <Button size="sm" onClick={handleDeploy}>Deploy</Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && (
          <div className="w-56 border-r dark:border-surface-800 flex flex-col bg-surface-50 dark:bg-surface-900">
            <div className="flex items-center justify-between px-3 py-2 border-b dark:border-surface-800"><span className="text-xs font-semibold uppercase text-surface-500">Explorer</span><button onClick={() => setShowSidebar(false)} className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-xs">X</button></div>
            <div className="flex-1 overflow-y-auto scrollbar-thin"><FileTree items={fileTree} selectedPath={selectedFile || undefined} onSelectFile={setSelectedFile} /></div>
          </div>
        )}
        {!showSidebar && <button onClick={() => setShowSidebar(true)} className="p-2 border-r dark:border-surface-800 hover:bg-surface-100 dark:hover:bg-surface-800 text-xs">&gt;</button>}
        <div className="flex-1 flex overflow-hidden">
          {(activePanel === 'code' || activePanel === 'split') && (
            <div className={cn('flex-1 overflow-hidden', activePanel === 'split' && 'border-r dark:border-surface-800')}>
              {selectedFileContent ? <CodeEditor value={selectedFileContent.content} language={selectedFileContent.language} path={selectedFileContent.path} /> : <div className="flex items-center justify-center h-full text-surface-400 text-sm">Select a file to edit</div>}
            </div>
          )}
          {(activePanel === 'preview' || activePanel === 'split') && <div className="flex-1 overflow-hidden"><PreviewPanel /></div>}
        </div>
        {showChat && <div className="w-96 border-l dark:border-surface-800"><ChatPanel messages={messages} onSendMessage={handleSendMessage} isGenerating={isGenerating} /></div>}
      </div>
    </div>
  );
}
