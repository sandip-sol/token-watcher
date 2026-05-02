import { prisma } from '../src/lib/prisma'
import { rebuildRollupsForDateRange } from '../src/lib/rollups'
import { parseUtcDateInput } from '../src/lib/date'

async function main() {
  const args = parseArgs(process.argv.slice(2))

  await rebuildRollupsForDateRange({
    from: args.from ? parseUtcDateInput(args.from) : undefined,
    to: args.to ? parseUtcDateInput(args.to, true) : undefined,
    workspaceId: args.workspaceId,
    chunkSize: args.chunkSize ? Number(args.chunkSize) : undefined,
  })

  console.log('Rollups rebuilt successfully.')
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {}

  for (const arg of args) {
    if (!arg.startsWith('--')) continue
    const [key, value = ''] = arg.slice(2).split('=')
    parsed[key] = value
  }

  return {
    from: parsed.from || process.env.ROLLUP_FROM || '',
    to: parsed.to || process.env.ROLLUP_TO || '',
    workspaceId: parsed.workspaceId || process.env.ROLLUP_WORKSPACE_ID || '',
    chunkSize: parsed.chunkSize || process.env.ROLLUP_CHUNK_SIZE || '',
  }
}

main()
  .catch(error => {
    console.error('[TokenWatcher] Rollup rebuild failed:', error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
