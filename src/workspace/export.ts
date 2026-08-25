import type { WorkspaceDocumentV1, WorkspaceExportContext } from './types'

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const filename = (title: string) => {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'faultline-workspace'
}

export const serializeWorkspace = (document: WorkspaceDocumentV1) =>
  JSON.stringify(document, null, 2)

export function workspaceMarkdown(
  document: WorkspaceDocumentV1,
  context: WorkspaceExportContext,
): string {
  const ru = context.locale === 'ru'
  const nodeById = new Map(document.architecture.nodes.map((node) => [node.id, node]))
  const componentRows = document.architecture.nodes.map((node) => {
    const notes = node.data.notes?.replace(/\|/g, '\\|').replace(/\n/g, ' ') || '—'
    return `| ${node.data.label} | ${node.data.kind} | ${node.data.replicas ?? 1} | ${node.data.shards ?? 1} | ${notes} |`
  })
  const connections = document.architecture.edges.map((edge) => {
    const source = nodeById.get(edge.source)?.data.label ?? edge.source
    const target = nodeById.get(edge.target)?.data.label ?? edge.target
    return `- ${source} → ${target}${edge.label ? ` — ${edge.label}` : ''}`
  })

  return [
    `# ${document.title}`,
    '',
    ru ? '> Создано в Faultline Workspace.' : '> Created with Faultline Workspace.',
    '',
    ru ? '## Текущая симуляция' : '## Current simulation',
    '',
    `- ${ru ? 'Модель' : 'Model'}: ${context.modelLabel}`,
    `- ${ru ? 'Нагрузка' : 'Load'}: ${document.load}×`,
    `- ${ru ? 'Сбой' : 'Fault'}: ${document.fault}`,
    `- ${ru ? 'Пропускная способность' : 'Throughput'}: ${context.metrics.throughput}`,
    `- p99: ${context.metrics.p99}`,
    `- ${ru ? 'Ошибки' : 'Errors'}: ${context.metrics.errors}`,
    `- ${ru ? 'Инфраструктура в месяц' : 'Monthly infrastructure'}: $${Math.round(context.monthlyCost).toLocaleString('en-US')}`,
    '',
    ru ? '## Компоненты' : '## Components',
    '',
    `| ${ru ? 'Компонент' : 'Component'} | ${ru ? 'Тип' : 'Type'} | ${ru ? 'Реплики' : 'Replicas'} | ${ru ? 'Шарды' : 'Shards'} | ${ru ? 'Заметки' : 'Notes'} |`,
    '| --- | --- | ---: | ---: | --- |',
    ...componentRows,
    '',
    ru ? '## Связи' : '## Connections',
    '',
    ...(connections.length ? connections : [ru ? '- Связей пока нет.' : '- No connections yet.']),
    '',
    ru ? '## Допущения модели' : '## Model assumptions',
    '',
    ...context.assumptions.map((assumption) => `- ${assumption}`),
    '',
  ].join('\n')
}

export function workspaceSvg(
  document: WorkspaceDocumentV1,
  context: WorkspaceExportContext,
): string {
  const width = 1280
  const height = 820
  const headerHeight = 92
  const nodeWidth = 146
  const nodeHeight = 112
  const padding = 74
  const nodes = document.architecture.nodes
  const minX = nodes.length ? Math.min(...nodes.map((node) => node.position.x)) : 0
  const minY = nodes.length ? Math.min(...nodes.map((node) => node.position.y)) : 0
  const maxX = nodes.length ? Math.max(...nodes.map((node) => node.position.x + nodeWidth)) : width
  const maxY = nodes.length ? Math.max(...nodes.map((node) => node.position.y + nodeHeight)) : height
  const graphWidth = Math.max(1, maxX - minX)
  const graphHeight = Math.max(1, maxY - minY)
  const scale = Math.min(
    1.2,
    (width - padding * 2) / graphWidth,
    (height - headerHeight - padding * 1.5) / graphHeight,
  )
  const offsetX = (width - graphWidth * scale) / 2 - minX * scale
  const offsetY = headerHeight + (height - headerHeight - graphHeight * scale) / 2 - minY * scale
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const position = (node: typeof nodes[number]) => ({
    x: node.position.x * scale + offsetX,
    y: node.position.y * scale + offsetY,
    width: nodeWidth * scale,
    height: nodeHeight * scale,
  })

  const edgeMarkup = document.architecture.edges.map((edge) => {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) return ''
    const from = position(source)
    const to = position(target)
    const x1 = from.x + from.width / 2
    const y1 = from.y + from.height / 2
    const x2 = to.x + to.width / 2
    const y2 = to.y + to.height / 2
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    return `<g><path d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}" fill="none" stroke="#62b775" stroke-width="2" stroke-dasharray="3 6" marker-end="url(#arrow)"/>${edge.label ? `<text x="${cx}" y="${cy - 9}" text-anchor="middle" class="edge-label">${escapeXml(edge.label)}</text>` : ''}</g>`
  }).join('')

  const nodeMarkup = nodes.map((node) => {
    const box = position(node)
    const label = node.data.label.length > 24 ? `${node.data.label.slice(0, 22)}…` : node.data.label
    const topology = `${node.data.replicas ?? 1}× · ${node.data.shards ?? 1} shard${(node.data.shards ?? 1) === 1 ? '' : 's'}`
    return `<g transform="translate(${box.x} ${box.y})"><rect width="${box.width}" height="${box.height}" rx="${18 * scale}" fill="#ffffff" stroke="#dfe4e9" stroke-width="1.4"/><circle cx="${box.width / 2}" cy="${30 * scale}" r="${13 * scale}" fill="#edf8ef" stroke="#31a852"/><text x="${box.width / 2}" y="${61 * scale}" text-anchor="middle" class="node-label" font-size="${13 * scale}">${escapeXml(label)}</text><text x="${box.width / 2}" y="${82 * scale}" text-anchor="middle" class="node-kind" font-size="${9.5 * scale}">${escapeXml(node.data.kind.toUpperCase())} · ${escapeXml(topology)}</text></g>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#62b775"/></marker><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#dde3e8"/></pattern><style>.title{font:600 25px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#12161a}.subtitle{font:400 12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#778391}.node-label{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:600;fill:#172028}.node-kind,.edge-label{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#667382}.edge-label{font-size:10px;paint-order:stroke;stroke:#fafbfc;stroke-width:5px}</style></defs>
  <rect width="100%" height="100%" fill="#fafbfc"/><rect y="${headerHeight}" width="100%" height="${height - headerHeight}" fill="url(#dots)"/>
  <text x="44" y="42" class="title">${escapeXml(document.title)}</text><text x="44" y="66" class="subtitle">FAULTLINE WORKSPACE · ${escapeXml(context.modelLabel)} · ${document.load}× · ${escapeXml(context.metrics.p99)} p99</text>
  ${edgeMarkup}${nodeMarkup}
  </svg>`
}

const download = (content: BlobPart, type: string, name: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadWorkspaceFile(
  document: WorkspaceDocumentV1,
  context: WorkspaceExportContext,
  format: 'svg' | 'markdown' | 'json',
) {
  const base = filename(document.title)
  if (format === 'json') download(serializeWorkspace(document), 'application/json', `${base}.faultline.json`)
  if (format === 'markdown') download(workspaceMarkdown(document, context), 'text/markdown', `${base}.md`)
  if (format === 'svg') download(workspaceSvg(document, context), 'image/svg+xml', `${base}.svg`)
}

export async function downloadWorkspacePng(
  document: WorkspaceDocumentV1,
  context: WorkspaceExportContext,
): Promise<void> {
  const svg = workspaceSvg(document, context)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('PNG export failed'))
      image.src = url
    })
    const canvas = documentGlobal().createElement('canvas')
    canvas.width = 2560
    canvas.height = 1640
    const context2d = canvas.getContext('2d')
    if (!context2d) throw new Error('Canvas is unavailable')
    context2d.scale(2, 2)
    context2d.drawImage(image, 0, 0, 1280, 820)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed')), 'image/png'))
    const pngUrl = URL.createObjectURL(blob)
    const anchor = documentGlobal().createElement('a')
    anchor.href = pngUrl
    anchor.download = `${filename(document.title)}.png`
    anchor.hidden = true
    documentGlobal().body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 0)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const documentGlobal = () => globalThis.document
