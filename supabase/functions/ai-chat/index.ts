import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = 'claude-haiku-4-5-20251001'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ClusterContext {
  clusterName: string
  namespaces: string[]
  stats: { nodes: number; edges: number; critical: number; high: number; medium: number; low: number }
  findings: Array<{ severity: string; type: string; resource: string; description: string }>
  iamChains: Array<{
    workload: string; namespace: string; serviceAccount: string; role: string
    services: Array<{ name: string; accessLevel: string }>
  }>
  serviceBindings: Array<{ service: string; namespace: string; selects: string[] }>
  ingressRoutes: Array<{ ingress: string; namespace: string; routes: string[] }>
  rbacBindings: Array<{ binding: string; namespace: string; role: string; subjects: string[] }>
  inventory: Array<{ type: string; namespace: string; name: string }>
}

function buildSystemPrompt(ctx: ClusterContext): string {
  const score = Math.max(0, 100 - ctx.stats.critical * 15 - ctx.stats.high * 5 - ctx.stats.medium * 2 - ctx.stats.low * 0.5)

  const findingsSummary = ctx.findings.length === 0
    ? 'No findings.'
    : ctx.findings
        .sort((a, b) => {
          const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
          return (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
        })
        .slice(0, 60)
        .map(f => `[${f.severity.toUpperCase()}] ${f.type} — ${f.resource}: ${f.description}`)
        .join('\n')

  const iamSummary = ctx.iamChains.length === 0
    ? 'No IRSA chains found.'
    : ctx.iamChains
        .map(c => {
          const svcs = c.services.map(s => `${s.name}(${s.accessLevel})`).join(', ') || 'no AWS services'
          return `${c.namespace}/${c.workload} → SA:${c.serviceAccount} → IAM:${c.role} → [${svcs}]`
        })
        .join('\n')

  const svcSummary = ctx.serviceBindings.length === 0
    ? 'No service bindings found.'
    : ctx.serviceBindings
        .map(s => `${s.namespace}/${s.service} selects: [${s.selects.join(', ')}]`)
        .join('\n')

  const ingressSummary = ctx.ingressRoutes.length === 0
    ? 'No ingress routes found.'
    : ctx.ingressRoutes
        .map(i => `${i.namespace}/${i.ingress} routes → [${i.routes.join(', ')}]`)
        .join('\n')

  const rbacSummary = ctx.rbacBindings.length === 0
    ? 'No RBAC bindings found.'
    : ctx.rbacBindings
        .slice(0, 40)
        .map(b => `${b.namespace}/${b.binding}: role=${b.role}, subjects=[${b.subjects.join(', ')}]`)
        .join('\n')

  const inventoryByType = ctx.inventory.reduce((acc, n) => {
    if (!acc[n.type]) acc[n.type] = []
    acc[n.type].push(`${n.namespace}/${n.name}`)
    return acc
  }, {} as Record<string, string[]>)

  const inventorySummary = Object.entries(inventoryByType)
    .map(([type, items]) => `${type}: ${items.join(', ')}`)
    .join('\n')

  return `You are GuardMap AI — a senior cloud security engineer embedded in a Kubernetes security platform.

You have FULL access to the latest security scan of cluster "${ctx.clusterName}".

CLUSTER OVERVIEW:
- Namespaces: ${ctx.namespaces.join(', ')}
- Graph: ${ctx.stats.nodes} nodes, ${ctx.stats.edges} edges
- Security score: ${score.toFixed(0)}/100
- Findings: ${ctx.stats.critical} critical | ${ctx.stats.high} high | ${ctx.stats.medium} medium | ${ctx.stats.low} low

SECURITY FINDINGS:
${findingsSummary}

IRSA PERMISSION CHAINS (Workload → ServiceAccount → IAM Role → AWS Services):
${iamSummary}

K8s SERVICE BINDINGS (which Service selects which Workload):
${svcSummary}

INGRESS ROUTES (Ingress → Services):
${ingressSummary}

RBAC BINDINGS (RoleBinding/ClusterRoleBinding → Role → Subjects):
${rbacSummary}

FULL RESOURCE INVENTORY:
${inventorySummary}

RESPONSE RULES — follow these exactly:
- Max 3-5 sentences. If it needs more, use a short bullet list (max 4 items).
- Lead with the answer. Never with "The scan shows..." or "Based on the data...".
- No preamble, no hedging, no "I'd recommend". Just state it.
- If something isn't in the scan: one line — "Not in scan data." — then give what you DO know.
- For remediations: one kubectl/AWS CLI command inline, not a numbered tutorial.
- You're a senior engineer talking to another senior engineer. Terse, precise, no bullshit.`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  let body: { message: string; history: ChatMessage[]; context: ClusterContext }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const { message, history = [], context } = body

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const messages: ChatMessage[] = [
    ...history.slice(-12),
    { role: 'user', content: message },
  ]

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(context),
      messages,
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    return new Response(JSON.stringify({ error: `Anthropic API error: ${err}` }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const result = await anthropicRes.json()
  const content = result.content?.[0]?.text ?? ''

  return new Response(JSON.stringify({ content }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
