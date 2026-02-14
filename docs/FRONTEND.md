# BuildCraft AI - Frontend Documentation

Complete documentation of the Next.js frontend application, including components, state management, API integration, and WebSocket communication.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Pages & Routing](#pages--routing)
4. [State Management (Zustand)](#state-management-zustand)
5. [API Client](#api-client)
6. [WebSocket Client](#websocket-client)
7. [Components Reference](#components-reference)
8. [Types](#types)
9. [Utilities](#utilities)
10. [Styling & Theme](#styling--theme)

---

## Tech Stack

| Technology              | Version  | Purpose                              |
|-------------------------|----------|--------------------------------------|
| Next.js                 | 14.1.0   | React framework (App Router)         |
| React                   | 18.2.0   | UI library                           |
| TypeScript              | 5.3.x    | Type safety                          |
| Tailwind CSS            | 3.4.x    | Utility-first CSS                    |
| Zustand                 | 4.5.0    | Lightweight state management         |
| Framer Motion           | —        | Animations                           |
| Monaco Editor           | —        | Code editor (`@monaco-editor/react`) |
| Lucide React            | —        | Icon library                         |
| React Hot Toast         | —        | Toast notifications                  |
| clsx + tailwind-merge   | —        | Class name utilities                 |

---

## Project Structure

```
packages/frontend/src/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (metadata, global CSS)
│   ├── page.tsx                  # Landing page (/)
│   ├── (auth)/                   # Auth route group
│   │   ├── login/page.tsx        # Login page (/login)
│   │   └── register/page.tsx     # Register page (/register)
│   ├── (dashboard)/              # Dashboard route group
│   │   ├── layout.tsx            # Dashboard layout (sidebar + header)
│   │   ├── projects/page.tsx     # Projects list (/projects)
│   │   ├── settings/page.tsx     # Settings page (/settings)
│   │   └── profile/page.tsx      # Profile page (/profile)
│   └── (editor)/                 # Editor route group
│       └── editor/
│           └── [projectId]/
│               └── page.tsx      # Project editor (/editor/:projectId)
├── components/
│   ├── ui/                       # Generic UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── modal.tsx
│   │   └── badge.tsx
│   ├── layout/                   # Layout components
│   │   ├── sidebar.tsx
│   │   └── header.tsx
│   ├── chat/                     # Chat feature
│   │   └── chat-panel.tsx
│   ├── editor/                   # Editor features
│   │   ├── code-editor.tsx
│   │   └── file-tree.tsx
│   └── preview/                  # Preview feature
│       └── preview-panel.tsx
├── lib/
│   ├── api/
│   │   ├── client.ts             # HTTP API client
│   │   └── index.ts              # API endpoint definitions
│   ├── hooks/
│   │   └── index.ts              # Re-exports stores as hooks
│   ├── stores/
│   │   ├── auth-store.ts         # Auth state (Zustand)
│   │   └── project-store.ts      # Project state (Zustand)
│   ├── utils/
│   │   └── index.ts              # Utility functions
│   └── websocket/
│       └── index.ts              # WebSocket client
└── types/
    └── index.ts                  # Frontend type definitions
```

---

## Pages & Routing

Next.js 14 App Router with route groups for layout sharing.

### Route Map

| Route                    | Page File                               | Type       | Auth Required | Layout        |
|--------------------------|-----------------------------------------|------------|---------------|---------------|
| `/`                      | `app/page.tsx`                          | Server     | No            | Root          |
| `/login`                 | `app/(auth)/login/page.tsx`             | Client     | No            | None          |
| `/register`              | `app/(auth)/register/page.tsx`          | Client     | No            | None          |
| `/projects`              | `app/(dashboard)/projects/page.tsx`     | Client     | Yes           | Dashboard     |
| `/settings`              | `app/(dashboard)/settings/page.tsx`     | Client     | Yes           | Dashboard     |
| `/profile`               | `app/(dashboard)/profile/page.tsx`      | Client     | Yes           | Dashboard     |
| `/editor/:projectId`     | `app/(editor)/editor/[projectId]/page.tsx` | Client  | Yes           | None (custom) |

### Landing Page (`/`)

Server-rendered marketing page with:
- Navigation bar with logo and auth links
- Hero section: "Build apps with AI superpowers"
- CTA buttons: "Start Building Free", "See How It Works"
- 6-feature grid:
  1. AI Code Generation — Describe features, get production code
  2. Real-time Collaboration — Multiple users edit simultaneously
  3. One-Click Deploy — Deploy to cloud infrastructure instantly
  4. Live Preview — See changes in real-time browser preview
  5. Enterprise Security — SOC 2, sandboxed execution, audit logs
  6. Version Control — Snapshots, rollback, branching

### Login Page (`/login`)

- Email + password form
- Error display
- Calls `authStore.login(email, password)`
- Redirects to `/projects` on success
- Link to register page

### Register Page (`/register`)

- Name + email + password form
- Password requirements note displayed
- Calls `authStore.register(name, email, password)`
- Redirects to `/projects` on success
- Link to login page

### Dashboard Layout

Shared layout for `/projects`, `/settings`, `/profile`:
- Left sidebar (256px) with navigation
- Top header with search and dark mode toggle
- Main content area with overflow scrolling

### Projects Page (`/projects`)

- Grid layout (1-3 columns responsive)
- Project cards with: name, status badge, description, framework, last updated
- Search filter (filters by name/description)
- Create project modal:
  - Name input
  - Description textarea
  - Framework selector (React, Next.js, Vue, Svelte, Vanilla)
- Click card → navigate to `/editor/{id}`
- Empty state with create button

### Settings Page (`/settings`)

- AI Configuration section:
  - OpenAI API Key input
  - Anthropic API Key input
  - Default Model dropdown
- Subscription section:
  - Current plan badge
  - Upgrade button

### Profile Page (`/profile`)

- User profile card with avatar (first initial)
- Update profile form (name, email)
- Security section (change password)

### Editor Page (`/editor/:projectId`)

The main application workspace. Multi-panel layout:

```
┌──────────────────────────────────────────────────┐
│  Header: Project name │ Panels │ Chat │ Deploy   │
├────────┬─────────────────────────┬───────────────┤
│        │                         │               │
│  File  │     Code Editor         │  Chat Panel   │
│  Tree  │     (or Split View)     │  (optional)   │
│        │                         │               │
│  Side  │     Preview Panel       │               │
│  bar   │     (in split mode)     │               │
│        │                         │               │
└────────┴─────────────────────────┴───────────────┘
```

**State:** `selectedFile`, `activePanel`, `showChat`, `showSidebar`, `messages`, `isGenerating`

**Panel Modes:**
- `code` — Full-width code editor
- `preview` — Full-width preview iframe
- `split` — 50/50 code + preview

**Key Functions:**
- `buildFileTree()` — Recursively constructs nested directory tree from flat file array
- `handleSendMessage()` — Sends prompt to `generateCode()`, tracks chat messages
- `handleDeploy()` — Triggers deployment, shows URL in chat

---

## State Management (Zustand)

### Auth Store

**File:** `packages/frontend/src/lib/stores/auth-store.ts`

```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): void;
  loadUser(): Promise<void>;
}
```

**Token Storage:**
- `accessToken` → `localStorage.setItem('accessToken', token)`
- `refreshToken` → `localStorage.setItem('refreshToken', token)`

**User Interface:**
```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  avatarUrl?: string;
}
```

**Methods:**

| Method       | Description                                           |
|--------------|-------------------------------------------------------|
| `login()`    | POST /auth/login, stores tokens, sets user            |
| `register()` | POST /auth/register, stores tokens, sets user         |
| `logout()`   | Clears localStorage tokens, resets state              |
| `loadUser()` | GET /auth/me, refreshes user from server              |

---

### Project Store

**File:** `packages/frontend/src/lib/stores/project-store.ts`

```typescript
interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  total: number;
  page: number;

  fetchProjects(params?): Promise<void>;
  fetchProject(id: string): Promise<void>;
  createProject(data): Promise<Project>;
  updateProject(id: string, data): Promise<void>;
  deleteProject(id: string): Promise<void>;
  generateCode(id: string, prompt: string): Promise<any>;
  deployProject(id: string): Promise<any>;
  setCurrentProject(project: Project | null): void;
}
```

**Project Interface:**
```typescript
interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  framework: string;
  visibility: string;
  files: Array<{ path: string; content: string; language: string }>;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

**Methods:**

| Method            | API Call                              | Description                     |
|-------------------|---------------------------------------|---------------------------------|
| `fetchProjects()` | GET /projects                         | Load paginated project list     |
| `fetchProject()`  | GET /projects/:id                     | Load project with files         |
| `createProject()` | POST /projects                        | Create new project              |
| `updateProject()` | PATCH /projects/:id                   | Update project metadata         |
| `deleteProject()` | DELETE /projects/:id                  | Delete project                  |
| `generateCode()`  | POST /projects/:id/generate           | Queue AI generation             |
| `deployProject()` | POST /projects/:id/deploy             | Queue deployment                |

---

## API Client

**File:** `packages/frontend/src/lib/api/client.ts`

### ApiClient Class

Handles all HTTP communication with the backend.

**Base URL:** `process.env.NEXT_PUBLIC_API_URL` || `http://localhost:4000/api/v1`

**Methods:**
```typescript
class ApiClient {
  async get<T>(url: string, params?: Record<string, string>): Promise<T>;
  async post<T>(url: string, data?: any): Promise<T>;
  async patch<T>(url: string, data?: any): Promise<T>;
  async delete<T>(url: string): Promise<T>;
}
```

**Authentication:** Automatically reads `accessToken` from localStorage and adds `Authorization: Bearer <token>` header to all requests.

**Error Handling:** Throws `ApiError` with `status`, `code`, and `message` on non-OK responses.

### API Endpoints

**File:** `packages/frontend/src/lib/api/index.ts`

```typescript
const authApi = {
  login(email, password): Promise<AuthResponse>;
  register(name, email, password): Promise<AuthResponse>;
  refreshToken(token): Promise<TokenResponse>;
  getMe(): Promise<User>;
};

const projectApi = {
  list(params?): Promise<ProjectListResponse>;
  get(id): Promise<ProjectResponse>;
  create(data): Promise<ProjectResponse>;
  update(id, data): Promise<ProjectResponse>;
  delete(id): Promise<void>;
  generate(id, prompt): Promise<GenerationResponse>;
  deploy(id): Promise<DeploymentResponse>;
  getDeployments(id): Promise<DeploymentsResponse>;
};
```

---

## WebSocket Client

**File:** `packages/frontend/src/lib/websocket/index.ts`

### WebSocketClient Class

Manages real-time WebSocket communication with auto-reconnection.

**Connection URL:** `ws://localhost:4000/ws?token={accessToken}`

```typescript
class WebSocketClient {
  connect(token: string): void;
  send(event: string, payload: any): void;
  on(event: string, handler: Function): () => void;  // Returns unsubscribe fn
  disconnect(): void;
}
```

**Auto-Reconnection:**
- Max 5 attempts
- Exponential backoff delays: 1s, 2s, 4s, 8s, 16s
- Triggers `'disconnected'` event, then `'connected'` on reconnect

**Event Model:**
```typescript
// Send
wsClient.send('join-project', { projectId: 'uuid' });

// Receive
const unsub = wsClient.on('generation-completed', (data) => {
  console.log('Files changed:', data.filesChanged);
});

// Cleanup
unsub();
```

**Lifecycle Events:**
- `'connected'` — emitted when WebSocket opens
- `'disconnected'` — emitted when WebSocket closes

---

## Components Reference

### UI Components

#### Button (`components/ui/button.tsx`)

Reusable button with variants, sizes, loading state, and icon support.

| Prop        | Type                                            | Default     |
|-------------|-------------------------------------------------|-------------|
| `variant`   | `'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'outline'` | `'primary'` |
| `size`      | `'sm' \| 'md' \| 'lg'`                         | `'md'`      |
| `isLoading` | `boolean`                                       | `false`     |
| `leftIcon`  | `ReactNode`                                     | —           |
| `rightIcon` | `ReactNode`                                     | —           |

**Variant Styles:**
| Variant     | Background             | Text               |
|-------------|------------------------|---------------------|
| `primary`   | `bg-brand-600`         | `text-white`        |
| `secondary` | `bg-surface-200`       | `text-surface-900`  |
| `ghost`     | `transparent`          | `text-surface-600`  |
| `danger`    | `bg-red-600`           | `text-white`        |
| `outline`   | `transparent + border` | `text-surface-700`  |

---

#### Input (`components/ui/input.tsx`)

Text input with label, error state, and icon support.

| Prop       | Type        | Description                 |
|------------|-------------|-----------------------------|
| `label`    | `string`    | Label text above input      |
| `error`    | `string`    | Error message below (red)   |
| `leftIcon` | `ReactNode` | Icon inside input (left)    |

---

#### Modal (`components/ui/modal.tsx`)

Overlay modal dialog with backdrop blur.

| Prop      | Type                        | Default  |
|-----------|-----------------------------|----------|
| `isOpen`  | `boolean`                   | —        |
| `onClose` | `() => void`                | —        |
| `title`   | `string`                    | —        |
| `size`    | `'sm' \| 'md' \| 'lg'`     | `'md'`   |

**Behavior:** Closes on Escape key, outside click, or close button.

---

#### Badge (`components/ui/badge.tsx`)

Status indicator or tag.

| Prop      | Type                                                          | Default     |
|-----------|---------------------------------------------------------------|-------------|
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger' \| 'info'` | `'default'` |
| `size`    | `'sm' \| 'md'`                                               | `'sm'`      |

**Status Mapping (used in projects page):**
```typescript
const statusVariantMap = {
  draft: 'default',
  generating: 'warning',
  ready: 'success',
  deploying: 'info',
  deployed: 'success',
  error: 'danger',
  archived: 'default',
};
```

---

### Layout Components

#### Sidebar (`components/layout/sidebar.tsx`)

Fixed 256px left sidebar for dashboard pages.

**Sections:**
1. Header: Logo + "BuildCraft" title + "AI App Builder" subtitle
2. Navigation links: Projects, Settings, Profile (highlights active route)
3. Footer: User avatar (first initial) + name + email + logout button

---

#### Header (`components/layout/header.tsx`)

Top bar for dashboard pages.

**Features:**
- Search input ("Search projects...")
- Dark mode toggle (toggles `dark` class on `document.documentElement`)

---

### Feature Components

#### ChatPanel (`components/chat/chat-panel.tsx`)

AI chat interface for natural language code generation.

| Prop             | Type                       | Description                     |
|------------------|----------------------------|---------------------------------|
| `messages`       | `ChatMessage[]`            | Conversation history            |
| `onSendMessage`  | `(message: string) => void`| Callback when user sends        |
| `isGenerating`   | `boolean`                  | Shows loading indicator         |

**Message Layout:**
- User messages: right-aligned, blue background
- Assistant messages: left-aligned, gray background
- File change count shown in assistant messages
- Auto-scrolls to newest message

**Input:** Textarea with Shift+Enter for newline, Enter to send.

---

#### FileTree (`components/editor/file-tree.tsx`)

Recursive file explorer for project files.

| Prop            | Type                       | Description              |
|-----------------|----------------------------|--------------------------|
| `items`         | `FileTreeItem[]`           | Nested file/folder tree  |
| `selectedPath`  | `string`                   | Currently selected file  |
| `onSelectFile`  | `(path: string) => void`   | File selection callback  |

**Features:**
- Expandable/collapsible directories
- Auto-expanded for first 2 levels
- Visual indicators: `D` (directory), `F` (file)
- Indentation based on depth (16px per level)
- Selected file highlighting

---

#### CodeEditor (`components/editor/code-editor.tsx`)

Code editor for viewing and editing project files.

| Prop        | Type                               | Description               |
|-------------|------------------------------------|-----------------------    |
| `value`     | `string`                           | File content              |
| `language`  | `string`                           | Syntax highlighting lang  |
| `path`      | `string`                           | Displayed file path       |
| `onChange`  | `(value: string) => void`          | Edit callback             |
| `readOnly`  | `boolean`                          | Default: `false`          |

**Implementation:** Uses a monospace textarea. Header shows file path and language.

---

#### PreviewPanel (`components/preview/preview-panel.tsx`)

Live preview of the generated application.

| Prop   | Type     | Description                     |
|--------|----------|---------------------------------|
| `url`  | `string` | URL to load in iframe           |
| `html` | `string` | Inline HTML to render           |

**Features:**
- Viewport switcher: Desktop (100%), Tablet (768px), Mobile (375px)
- Refresh button
- Sandboxed iframe (`allow-scripts`, `allow-same-origin`)
- Supports both URL and inline HTML rendering
- Empty state: "No preview available"

---

## Types

**File:** `packages/frontend/src/types/index.ts`

```typescript
type Framework = 'react' | 'nextjs' | 'vue' | 'svelte' | 'vanilla';

type ProjectStatus = 'draft' | 'generating' | 'ready' | 'deploying'
                   | 'deployed' | 'error' | 'archived';

type Visibility = 'private' | 'public' | 'team';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  fileChanges?: FileChange[];
  isStreaming?: boolean;
}

interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
  language: string;
}

interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeItem[];
  language?: string;
}
```

---

## Utilities

**File:** `packages/frontend/src/lib/utils/index.ts`

| Function                  | Parameters           | Returns    | Description                           |
|---------------------------|----------------------|------------|---------------------------------------|
| `cn(...inputs)`           | `ClassValue[]`       | `string`   | Merges Tailwind classes (prevents conflicts) |
| `formatDate(date)`        | `string \| Date`     | `string`   | Formats as "Feb 14, 2026"            |
| `formatRelativeTime(date)`| `string \| Date`     | `string`   | Returns "2d ago", "just now", etc.   |

---

## Styling & Theme

### Tailwind Configuration

**File:** `packages/frontend/tailwind.config.ts`

#### Custom Color Palettes

**Brand Colors (Blue):**
```
50:  #eff6ff    100: #dbeafe    200: #bfdbfe
300: #93c5fd    400: #60a5fa    500: #3b82f6
600: #2563eb    700: #1d4ed8    800: #1e40af
900: #1e3a8a
```

**Surface Colors (Dark Grays):**
```
50:  #f8fafc    100: #f1f5f9    200: #e2e8f0
300: #cbd5e1    400: #94a3b8    500: #64748b
600: #475569    700: #334155    800: #1e293b
900: #0f172a    950: #020617
```

#### Custom Fonts

| Font            | CSS Variable    | Usage          |
|-----------------|-----------------|----------------|
| Inter           | `font-sans`     | UI text        |
| JetBrains Mono  | `font-mono`     | Code display   |

#### Custom Animations

| Animation       | Description                              |
|-----------------|------------------------------------------|
| `fade-in`       | Opacity 0 → 1 over 300ms               |
| `slide-up`      | Translate Y 10px → 0 + fade in         |
| `slide-in-right`| Translate X 10px → 0 + fade in         |
| `pulse-soft`    | Opacity cycles 1 → 0.5 → 1             |
| `shimmer`       | Translate X -100% → 100% (loading)      |

#### Dark Mode

Class-based: add `dark` class to `<html>` element. Toggle via Header component.
