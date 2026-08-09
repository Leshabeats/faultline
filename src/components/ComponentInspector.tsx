import { Activity, Braces, Minus, Network, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SystemFlowNode } from '../canvas/types'
import type { FaultMode, Locale, ScenarioId } from '../domain/system'
import {
  MAX_REPLICAS_BY_KIND,
  normalizeNodeTopology,
  type NodeTopology,
} from '../domain/topology'
import { UI_COPY, componentLabels } from '../i18n'

type InspectorTab = 'overview' | 'contract' | 'scaling'

interface InspectorCopy {
  role: string
  responsibilities: string[]
  contracts: Array<{ name: string; detail: string }>
  decision: string
}

const copies: Record<ScenarioId, Record<Locale, Partial<Record<SystemFlowNode['data']['kind'], InspectorCopy>>>> = {
  'url-shortener': {
    en: {
      client: { role: 'Creates links and follows short URLs.', responsibilities: ['Send create and redirect requests', 'Retry only idempotent reads'], contracts: [{ name: 'HTTPS', detail: 'Public client traffic' }], decision: 'Clients never talk to storage directly.' },
      gateway: { role: 'Terminates TLS and routes public traffic.', responsibilities: ['Rate limiting', 'Routing and request IDs'], contracts: [{ name: 'HTTP', detail: 'POST /links · GET /:code' }], decision: 'Keep edge policy stateless so it can scale horizontally.' },
      service: { role: 'Owns the Short Link API and redirect orchestration.', responsibilities: ['Validate and create links', 'Resolve codes through cache-aside reads', 'Apply expiry and collision rules'], contracts: [{ name: 'POST /links', detail: '{ url, expiresAt? } → { code, shortUrl }' }, { name: 'GET /:code', detail: '301/302 → long URL · 404/410 on miss/expiry' }, { name: 'Cache key', detail: 'link:{code} → destination + expiry' }], decision: 'The API is stateless; codes and expiry live in storage.' },
      cache: { role: 'Keeps the redirect hot path away from the database.', responsibilities: ['Cache-aside lookups', 'TTL and negative-cache policy', 'Stampede protection on misses'], contracts: [{ name: 'GET link:{code}', detail: 'Destination and expiry' }, { name: 'SETEX', detail: 'Populate after a database read' }], decision: 'Redis is an optimization, not the source of truth.' },
      database: { role: 'Source of truth for short-code mappings.', responsibilities: ['Unique code constraint', 'Expiry persistence', 'Durable writes and recovery'], contracts: [{ name: 'links', detail: 'code PK · long_url · created_at · expires_at' }, { name: 'Read path', detail: 'Indexed lookup by code' }], decision: 'Shard by a stable hash of code when one primary no longer fits.' },
      queue: { role: 'Moves non-critical work off the redirect path.', responsibilities: ['Analytics events', 'Expiry cleanup', 'Retry with dead-letter handling'], contracts: [{ name: 'link.events', detail: 'Created · redirected · expired' }], decision: 'Redirects do not wait for consumers.' },
      region: { role: 'Groups a failure domain and its local traffic.', responsibilities: ['Route local users', 'Contain failures'], contracts: [{ name: 'Replication', detail: 'Asynchronous across regions' }], decision: 'Global failover changes the consistency contract.' },
    },
    ru: {
      client: { role: 'Создаёт ссылки и открывает короткие URL.', responsibilities: ['Отправляет запросы создания и редиректа', 'Повторяет только идемпотентное чтение'], contracts: [{ name: 'HTTPS', detail: 'Публичный клиентский трафик' }], decision: 'Клиенты никогда не обращаются к хранилищам напрямую.' },
      gateway: { role: 'Завершает TLS и маршрутизирует публичный трафик.', responsibilities: ['Rate limiting', 'Маршрутизация и request ID'], contracts: [{ name: 'HTTP', detail: 'POST /links · GET /:code' }], decision: 'Edge остаётся stateless и масштабируется горизонтально.' },
      service: { role: 'Владеет Short Link API и управляет редиректом.', responsibilities: ['Проверяет URL и создаёт ссылку', 'Ищет код по cache-aside схеме', 'Применяет expiry и правила коллизий'], contracts: [{ name: 'POST /links', detail: '{ url, expiresAt? } → { code, shortUrl }' }, { name: 'GET /:code', detail: '301/302 → длинный URL · 404/410 при miss/expiry' }, { name: 'Ключ кеша', detail: 'link:{code} → destination + expiry' }], decision: 'API stateless: коды и срок жизни хранятся отдельно.' },
      cache: { role: 'Убирает базу данных с горячего пути редиректа.', responsibilities: ['Cache-aside чтение', 'TTL и negative-cache policy', 'Защита от stampede при miss'], contracts: [{ name: 'GET link:{code}', detail: 'Адрес назначения и expiry' }, { name: 'SETEX', detail: 'Заполнение после чтения из БД' }], decision: 'Redis — ускоритель, а не источник истины.' },
      database: { role: 'Источник истины для соответствий коротких кодов.', responsibilities: ['Уникальность code', 'Хранение expiry', 'Надёжная запись и восстановление'], contracts: [{ name: 'links', detail: 'code PK · long_url · created_at · expires_at' }, { name: 'Чтение', detail: 'Индексированный поиск по code' }], decision: 'При росте primary шардинг идёт по стабильному hash(code).' },
      queue: { role: 'Уводит необязательную работу с пути редиректа.', responsibilities: ['События аналитики', 'Очистка истёкших ссылок', 'Retry и dead-letter очередь'], contracts: [{ name: 'link.events', detail: 'Created · redirected · expired' }], decision: 'Редирект не ждёт обработки событий.' },
      region: { role: 'Группирует домен отказа и локальный трафик.', responsibilities: ['Маршрутизирует ближайших пользователей', 'Локализует сбои'], contracts: [{ name: 'Репликация', detail: 'Асинхронная между регионами' }], decision: 'Глобальный failover меняет контракт консистентности.' },
    },
  },
  'news-feed': {
    en: {},
    ru: {},
  },
}

const genericCopy = (locale: Locale, node: SystemFlowNode): InspectorCopy => locale === 'ru'
  ? {
      role: `${componentLabels.ru[node.data.kind]} участвует в активном пути данных.`,
      responsibilities: ['Обрабатывает входящий трафик', 'Публикует метрики и health checks'],
      contracts: [{ name: 'Поток данных', detail: 'Контракт задаётся входящими и исходящими связями' }],
      decision: 'Меняйте топологию и наблюдайте влияние на p99, ошибки и стоимость.',
    }
  : {
      role: `${componentLabels.en[node.data.kind]} participates in the active data path.`,
      responsibilities: ['Handle incoming traffic', 'Publish metrics and health checks'],
      contracts: [{ name: 'Data flow', detail: 'The contract follows incoming and outgoing edges' }],
      decision: 'Change topology and observe p99, errors, and cost.',
    }

interface ComponentInspectorProps {
  node: SystemFlowNode | null
  scenario: ScenarioId
  locale: Locale
  fault: FaultMode
  onClose: () => void
  onFaultChange: (fault: FaultMode) => void
  onTopologyChange: (nodeId: string, topology: NodeTopology) => void
}

export function ComponentInspector({
  node,
  scenario,
  locale,
  fault,
  onClose,
  onFaultChange,
  onTopologyChange,
}: ComponentInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('overview')
  useEffect(() => setTab('overview'), [node?.id])
  if (!node) return null

  const text = UI_COPY[locale]
  const copy = copies[scenario][locale][node.data.kind] ?? genericCopy(locale, node)
  const { replicas, shards } = normalizeNodeTopology(node.data.kind, node.data)
  const maxReplicas = MAX_REPLICAS_BY_KIND[node.data.kind]
  const canReplicate = node.data.kind !== 'client' && node.data.kind !== 'region'
  const canShard = node.data.kind === 'cache' || node.data.kind === 'database'
  const cacheUnavailable = node.data.kind === 'cache' && fault === 'cache-outage'

  const setTopology = (next: Partial<NodeTopology>) =>
    onTopologyChange(node.id, normalizeNodeTopology(node.data.kind, {
      replicas: next.replicas ?? replicas,
      shards: next.shards ?? shards,
    }))

  return (
    <aside className="component-inspector" aria-label={`${text.selected}: ${node.data.label}`}>
      <header>
        <div>
          <span>{componentLabels[locale][node.data.kind]}</span>
          <strong>{node.data.label}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label={text.close}><X size={18} /></button>
      </header>

      <div className="inspector-health-row">
        <span className={`health-pill health-${node.data.health}`}><i /> {node.data.detail}</span>
        <span>{replicas}× · {shards} {locale === 'ru' ? 'шард.' : `shard${shards === 1 ? '' : 's'}`}</span>
      </div>

      {cacheUnavailable && (
        <div className="inspector-fault-note">
          <Activity size={17} />
          <span>{text.unavailableBecause}</span>
          <button type="button" onClick={() => onFaultChange('none')}><RotateCcw size={14} /> {text.clearFault}</button>
        </div>
      )}

      <nav className="inspector-tabs" aria-label={locale === 'ru' ? 'Сведения о компоненте' : 'Component details'}>
        {(['overview', 'contract', 'scaling'] as const).map((value) => (
          <button key={value} type="button" className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>
            {text[value]}
          </button>
        ))}
      </nav>

      <div className="inspector-content">
        {tab === 'overview' && (
          <>
            <section>
              <span className="inspector-kicker"><Network size={14} /> {text.role}</span>
              <p>{copy.role}</p>
            </section>
            <section>
              <span className="inspector-kicker">{text.responsibilities}</span>
              <ul>{copy.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <p className="inspector-decision">{copy.decision}</p>
          </>
        )}
        {tab === 'contract' && (
          <section>
            <span className="inspector-kicker"><Braces size={14} /> {text.dataContract}</span>
            <dl className="contract-list">
              {copy.contracts.map((contract) => (
                <div key={contract.name}><dt>{contract.name}</dt><dd>{contract.detail}</dd></div>
              ))}
            </dl>
          </section>
        )}
        {tab === 'scaling' && (
          <section className="topology-editor">
            <span className="inspector-kicker">{text.topology}</span>
            {canReplicate && (
              <div className="topology-control">
                <div><strong>{text.replicas}</strong><small>{text.replicaHelp}</small></div>
                <div>
                  <button type="button" aria-label={`${text.replicas}: −`} onClick={() => setTopology({ replicas: replicas - 1 })} disabled={replicas <= 1}><Minus size={15} /></button>
                  <output>{replicas}</output>
                  <button type="button" aria-label={`${text.replicas}: +`} onClick={() => setTopology({ replicas: replicas + 1 })} disabled={replicas >= maxReplicas}><Plus size={15} /></button>
                </div>
              </div>
            )}
            {canShard && (
              <div className="topology-control">
                <div><strong>{text.shards}</strong><small>{text.shardHelp}</small></div>
                <div>
                  <button type="button" aria-label={`${text.shards}: −`} onClick={() => setTopology({ shards: shards / 2 })} disabled={shards <= 1}><Minus size={15} /></button>
                  <output>{shards}</output>
                  <button type="button" aria-label={`${text.shards}: +`} onClick={() => setTopology({ shards: shards * 2 })} disabled={shards >= 8}><Plus size={15} /></button>
                </div>
              </div>
            )}
            {!canReplicate && !canShard && <p>{copy.decision}</p>}
            <p className="topology-hint">{text.topologyHint}</p>
          </section>
        )}
      </div>
    </aside>
  )
}
