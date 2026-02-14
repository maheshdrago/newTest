export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  status: ProjectStatus;
  framework: ProjectFramework;
  visibility: ProjectVisibility;
  files: ProjectFile[];
  metadata: ProjectMetadata;
  createdAt: Date;
  updatedAt: Date;
  deployedAt?: Date;
  deploymentUrl?: string;
}

export enum ProjectStatus {
  DRAFT = 'draft',
  GENERATING = 'generating',
  READY = 'ready',
  DEPLOYING = 'deploying',
  DEPLOYED = 'deployed',
  ERROR = 'error',
  ARCHIVED = 'archived',
}

export enum ProjectFramework {
  REACT = 'react',
  NEXTJS = 'nextjs',
  VUE = 'vue',
  SVELTE = 'svelte',
  VANILLA = 'vanilla',
}

export enum ProjectVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
  TEAM = 'team',
}

export interface ProjectFile {
  id: string;
  path: string;
  content: string;
  language: string;
  lastModifiedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMetadata {
  totalFiles: number;
  totalSize: number;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  version: string;
}

export interface CreateProjectRequest {
  name: string;
  description: string;
  framework: ProjectFramework;
  visibility?: ProjectVisibility;
  prompt?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  visibility?: ProjectVisibility;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
