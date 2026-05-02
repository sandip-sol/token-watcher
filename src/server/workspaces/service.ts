import { prisma } from '@/lib/prisma'

export const DEFAULT_WORKSPACE_SLUG = 'default'
export const DEFAULT_PROJECT_SLUG = 'default'

export type WorkspaceSelection =
  | { ok: true; workspaceId: string; projectId: string | null }
  | { ok: false; status: 400 | 404; error: string }

export function createSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return slug || DEFAULT_WORKSPACE_SLUG
}

export async function ensureUniqueWorkspaceSlug(baseSlug: string): Promise<string> {
  const normalized = createSlug(baseSlug)
  let candidate = normalized
  let suffix = 2

  while (await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${normalized}-${suffix}`
    suffix += 1
  }

  return candidate
}

export async function ensureUniqueProjectSlug(workspaceId: string, baseSlug: string): Promise<string> {
  const normalized = createSlug(baseSlug)
  let candidate = normalized
  let suffix = 2

  while (
    await prisma.project.findUnique({
      where: { workspaceId_slug: { workspaceId, slug: candidate } },
      select: { id: true },
    })
  ) {
    candidate = `${normalized}-${suffix}`
    suffix += 1
  }

  return candidate
}

export async function ensureDefaultWorkspaceAndProject() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    update: {},
    create: {
      id: 'default_workspace',
      name: 'Default Workspace',
      slug: DEFAULT_WORKSPACE_SLUG,
    },
  })

  const project = await prisma.project.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: DEFAULT_PROJECT_SLUG,
      },
    },
    update: {},
    create: {
      id: workspace.id === 'default_workspace' ? 'default_project' : undefined,
      workspaceId: workspace.id,
      name: 'Default Project',
      slug: DEFAULT_PROJECT_SLUG,
      environment: 'production',
    },
  })

  return { workspace, project }
}

export async function getDefaultWorkspace() {
  const { workspace } = await ensureDefaultWorkspaceAndProject()
  return workspace
}

export async function getProjectForIngest(input: {
  workspaceId: string
  projectId?: string | null
  projectSlug?: string | null
  apiKeyProjectId?: string | null
}): Promise<{ ok: true; projectId: string | null } | { ok: false; error: string }> {
  const { workspaceId, apiKeyProjectId } = input

  if (apiKeyProjectId) {
    const project = await prisma.project.findFirst({
      where: { id: apiKeyProjectId, workspaceId },
      select: { id: true },
    })

    if (!project) return { ok: false, error: 'API key project is invalid' }
    return { ok: true, projectId: project.id }
  }

  const projectId = input.projectId?.trim() || null
  const projectSlug = input.projectSlug?.trim() || null

  if (projectId && projectSlug) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, slug: projectSlug, workspaceId },
      select: { id: true },
    })

    if (!project) return { ok: false, error: 'Project identifiers do not match' }
    return { ok: true, projectId: project.id }
  }

  if (projectId || projectSlug) {
    const project = await prisma.project.findFirst({
      where: {
        workspaceId,
        ...(projectId ? { id: projectId } : { slug: projectSlug || '' }),
      },
      select: { id: true },
    })

    if (!project) return { ok: false, error: 'Project not found' }
    return { ok: true, projectId: project.id }
  }

  const defaultProject = await prisma.project.findFirst({
    where: { workspaceId, slug: DEFAULT_PROJECT_SLUG },
    select: { id: true },
  })

  return { ok: true, projectId: defaultProject?.id ?? null }
}

export async function resolveWorkspaceSelection(input: {
  workspaceId?: string | null
  projectId?: string | null
}): Promise<WorkspaceSelection> {
  let workspaceId = input.workspaceId?.trim() || null
  const projectId = input.projectId?.trim() || null

  if (!workspaceId) {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, slug: true },
      orderBy: [{ slug: 'asc' }, { createdAt: 'asc' }],
      take: 2,
    })

    if (workspaces.length === 0) {
      const { workspace } = await ensureDefaultWorkspaceAndProject()
      workspaceId = workspace.id
    } else if (workspaces.length === 1) {
      workspaceId = workspaces[0].id
    } else {
      const defaultWorkspace = workspaces.find(workspace => workspace.slug === DEFAULT_WORKSPACE_SLUG)
      if (!defaultWorkspace) {
        return { ok: false, status: 400, error: 'workspaceId is required when multiple workspaces exist' }
      }
      workspaceId = defaultWorkspace.id
    }
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  })

  if (!workspace) return { ok: false, status: 404, error: 'Workspace not found' }

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })

    if (!project) return { ok: false, status: 404, error: 'Project not found' }
  }

  return { ok: true, workspaceId, projectId }
}
