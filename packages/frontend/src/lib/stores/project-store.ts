import { create } from 'zustand';
import { projectApi } from '../api';

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  framework: string;
  visibility: string;
  files: any[];
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  total: number;
  page: number;
  fetchProjects: (params?: Record<string, string>) => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (data: { name: string; description: string; framework: string; visibility?: string }) => Promise<Project>;
  updateProject: (id: string, data: any) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  generateCode: (id: string, prompt: string) => Promise<any>;
  deployProject: (id: string) => Promise<any>;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  total: 0,
  page: 1,

  fetchProjects: async (params) => {
    set({ isLoading: true });
    try {
      const response = await projectApi.list(params);
      set({
        projects: response.data.projects,
        total: response.data.total,
        page: response.data.page,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProject: async (id: string) => {
    set({ isLoading: true });
    try {
      const response = await projectApi.get(id);
      set({ currentProject: response.data.project });
    } finally {
      set({ isLoading: false });
    }
  },

  createProject: async (data) => {
    const response = await projectApi.create(data);
    const project = response.data.project;
    set((state) => ({ projects: [project, ...state.projects] }));
    return project;
  },

  updateProject: async (id, data) => {
    const response = await projectApi.update(id, data);
    const updated = response.data.project;
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? updated : p)),
      currentProject: state.currentProject?.id === id ? updated : state.currentProject,
    }));
  },

  deleteProject: async (id) => {
    await projectApi.delete(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }));
  },

  generateCode: async (id, prompt) => {
    const response = await projectApi.generate(id, prompt);
    // Refresh the project to get updated files
    const projectResponse = await projectApi.get(id);
    set({ currentProject: projectResponse.data.project });
    return response.data;
  },

  deployProject: async (id) => {
    const response = await projectApi.deploy(id);
    const projectResponse = await projectApi.get(id);
    set({ currentProject: projectResponse.data.project });
    return response.data;
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));
