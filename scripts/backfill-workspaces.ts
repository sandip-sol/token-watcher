import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      id: 'default_workspace',
      name: 'Default Workspace',
      slug: 'default',
    },
  })

  const project = await prisma.project.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: 'default' } },
    update: {},
    create: {
      id: workspace.id === 'default_workspace' ? 'default_project' : undefined,
      workspaceId: workspace.id,
      name: 'Default Project',
      slug: 'default',
      environment: 'production',
    },
  })

  const [apiKeys, events, alerts, history] = await prisma.$transaction([
    prisma.apiKey.updateMany({
      where: { workspaceId: { equals: null as unknown as string } },
      data: { workspaceId: workspace.id },
    }),
    prisma.lLMEvent.updateMany({
      where: { workspaceId: { equals: null as unknown as string } },
      data: { workspaceId: workspace.id, projectId: project.id },
    }),
    prisma.alertRule.updateMany({
      where: { workspaceId: { equals: null as unknown as string } },
      data: { workspaceId: workspace.id },
    }),
    prisma.alertHistory.updateMany({
      where: { workspaceId: { equals: null as unknown as string } },
      data: { workspaceId: workspace.id },
    }),
  ])

  console.log('Workspace backfill complete')
  console.log(`  Workspace: ${workspace.name} (${workspace.id})`)
  console.log(`  Project: ${project.name} (${project.id})`)
  console.log(`  API keys updated: ${apiKeys.count}`)
  console.log(`  Events updated: ${events.count}`)
  console.log(`  Alert rules updated: ${alerts.count}`)
  console.log(`  Alert history rows updated: ${history.count}`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
