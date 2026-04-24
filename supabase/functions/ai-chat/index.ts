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
  stats: {
    nodes: number
    edges: number
    critical: number
    high: number
    medium: number
    low: number
  }
  findings: Array<{
    severity: string
    type: string
    resource: string
    description: string
  }>
  iamChains: Array<{
    workload: string
    namespace: string
    serviceAccount: string
    role: string
    services: Array<{ name: string; accessLevel: string }>
  }>
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
          const svcs = c.services.map(s => `${s.name}(${s.accessLevel})`).join(', ')
          return `${c.namespace}/${c.workload} → ${c.serviceAccount} → ${c.role} → [${svcs}]`
        })
        .join('\n')

  return `You are GuardMap AI — a senior cloud security engineer embedded in a Kubernetes security platform called GuardMap.

You have full access to the latest security scan of cluster "${ctx.clusterName}".

CLUSTER OVERVIEW:
- Namespaces: ${ctx.namespaces.join(', ')}
- Graph: ${ctx.stats.nodes} nodes, ${ctx.stats.edges} edges
- Security score: ${score.toFixed(0)}/100
- Findings: ${ctx.stats.critical} critical | ${ctx.stats.high} high | ${ctx.stats.medium} medium | ${ctx.stats.low} low

SECURITY FINDINGS:
${findingsSummary}

IRSA PERMISSION CHAINS (Workload → ServiceAccount → IAM Role → AWS Services):
${iamSummary}

INSTRUCTIONS:
- You are talking to engineers (DevOps, SecOps, Platform). Be direct and technical.
- When asked about a specific workload, namespace, or IAM role — reference it by exact name.
- For remediations, give specific kubectl or AWS CLI commands when possible.
- For blast radius questions, trace the chain: which pods → which SAs → which IAM roles → which AWS services.
- Keep answers focused and concise. No unnecessary preamble.
- If asked about something not in the scan data, say so clearly.`
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
    ...history.slice(-12), // last 12 turns (6 exchanges) for context window
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
      max_tokens: 1024,
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
