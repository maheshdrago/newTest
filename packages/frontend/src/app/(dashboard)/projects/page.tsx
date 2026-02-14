'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useProjectStore } from '@/lib/stores/project-store';
import { formatRelativeTime } from '@/lib/utils';

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'default', generating: 'warning', ready: 'success', deploying: 'info', deployed: 'success', error: 'danger', archived: 'default',
};

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, isLoading, fetchProjects, createProject } = useProjectStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [search, setSearch] = useState('');
  const [newProject, setNewProject] = useState({ name: '', description: '', framework: 'react' });

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreate = async () => {
    try {
      const project = await createProject(newProject);
      setShowCreateModal(false);
      setNewProject({ name: '', description: '', framework: 'react' });
      router.push(`/editor/${project.id}`);
    } catch (err) { console.error('Failed to create project:', err); }
  };

  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold">Projects</h1><p className="text-surface-500 text-sm mt-1">Manage your AI-generated applications</p></div>
        <Button onClick={() => setShowCreateModal(true)}>+ New Project</Button>
      </div>
      <div className="mb-6"><Input placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {filteredProjects.length === 0 && !isLoading ? (
        <div className="text-center py-16">
          <h3 className="text-lg font-medium mb-2">No projects yet</h3>
          <p className="text-surface-500 text-sm mb-4">Create your first project to get started</p>
          <Button onClick={() => setShowCreateModal(true)}>Create Project</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <button key={project.id} onClick={() => router.push(`/editor/${project.id}`)} className="text-left p-5 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-md transition-all duration-200">
              <div className="flex items-start justify-between mb-3"><h3 className="font-semibold truncate">{project.name}</h3><Badge variant={statusVariants[project.status]}>{project.status}</Badge></div>
              <p className="text-sm text-surface-500 line-clamp-2 mb-4">{project.description}</p>
              <div className="flex items-center justify-between"><Badge variant="info">{project.framework}</Badge><span className="text-xs text-surface-400">{formatRelativeTime(project.updatedAt)}</span></div>
            </button>
          ))}
        </div>
      )}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Project">
        <div className="space-y-4">
          <Input label="Project Name" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} placeholder="My Awesome App" />
          <div className="space-y-1.5"><label className="block text-sm font-medium">Description</label><textarea value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} placeholder="A brief description..." rows={3} className="w-full rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20" /></div>
          <div className="space-y-1.5"><label className="block text-sm font-medium">Framework</label><select value={newProject.framework} onChange={(e) => setNewProject({ ...newProject, framework: e.target.value })} className="w-full rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2 text-sm"><option value="react">React</option><option value="nextjs">Next.js</option><option value="vue">Vue.js</option><option value="svelte">Svelte</option><option value="vanilla">Vanilla JS</option></select></div>
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button><Button onClick={handleCreate} disabled={!newProject.name || !newProject.description}>Create</Button></div>
        </div>
      </Modal>
    </div>
  );
}
