import { useEffect, useState } from 'react'
import { ArrowPathIcon, CpuChipIcon, UserIcon } from '@heroicons/react/24/outline'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import { asPerson, asPersonList, personKey, type PersonValue } from '@biu/type-file-system'
import { listCollection } from './db-client.ts'

type ChatPerson = {
  id: string
  name: string
  mascot?: { shape: string; color: string; eye?: number }
}

const USER: PersonValue = { kind: 'user', name: '用户' }
const SYSTEM: PersonValue = { kind: 'system', name: '系统' }

let agentsInflight: Promise<ChatPerson[]> | null = null

export function agentNameLooksLikeId(name: string, sessionId: string) {
  const text = name.trim()
  if (!text || !sessionId) return false
  return text === sessionId || text === sessionId.slice(0, 8)
}

export function resolveAgentName(person: PersonValue, sessions: ReadonlyMap<string, string>): string {
  if (person.kind !== 'agent' || !person.sessionId) return person.name
  const queried = sessions.get(person.sessionId)?.trim()
  if (queried) return queried
  if (agentNameLooksLikeId(person.name, person.sessionId)) return ''
  return person.name
}

export async function loadAgents(): Promise<ChatPerson[]> {
  if (agentsInflight) return agentsInflight
  const request = listCollection({
    path: '/sessions',
    limit: 500,
    sortField: 'updatedAt',
    sortDir: 'desc',
    columns: ['title', 'mascot'],
  })
    .then((page) =>
      page.items
        .filter((item) => typeof item?.id === 'string' && item.id)
        .map((item) => {
          const id = String(item.id)
          const mascot =
            item.mascot && typeof item.mascot === 'object' && !Array.isArray(item.mascot)
              ? (item.mascot as ChatPerson['mascot'])
              : undefined
          return {
            id,
            name: String(item.title ?? '').trim() || id.slice(0, 8),
            ...(mascot ? { mascot } : {}),
          }
        }),
    )
    .finally(() => {
      agentsInflight = null
    })
  agentsInflight = request
  return request
}

export function PersonFace({ value, empty = '' }: { value: unknown; empty?: string }) {
  const people = asPersonList(value)
  const [sessionNames, setSessionNames] = useState<Map<string, string>>(() => new Map())
  const needAgents = people.some((item) => item.kind === 'agent' && item.sessionId)
  const shareRuntime = typeof document !== 'undefined' && document.documentElement.classList.contains('share')

  useEffect(() => {
    if (!needAgents || shareRuntime) return
    let cancelled = false
    void loadAgents()
      .then((rows) => {
        if (cancelled) return
        setSessionNames(new Map(rows.map((row) => [row.id, row.name])))
      })
      .catch(() => {
        if (!cancelled) setSessionNames(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [needAgents, shareRuntime])

  if (!people.length) {
    return empty ? (
      <span className="fsdb-person is-empty">
        <UserIcon aria-hidden className="size-[14px]" />
        {empty}
      </span>
    ) : null
  }

  return (
    <span className="fsdb-person-list">
      {people.map((person) => {
        const displayName = resolveAgentName(person, sessionNames) || (person.kind === 'agent' ? person.name : person.name)
        const label = displayName || empty
        return (
          <span key={personKey(person) || person.name} className="fsdb-person" title={label || undefined}>
            {person.kind === 'agent' && (person.sessionId || person.mascot) ? (
              <span className="fsdb-person-face" aria-hidden>
                <SidebarMascot
                  size={18}
                  sessionId={person.sessionId || person.name}
                  identity={resolveSessionMascot(person.sessionId || person.name, person.mascot)}
                  animate={false}
                  title={label || person.sessionId}
                />
              </span>
            ) : (
              <span className="fsdb-person-avatar" aria-hidden>
                {person.kind === 'system' ? <CpuChipIcon className="size-[14px]" /> : <UserIcon className="size-[14px]" />}
              </span>
            )}
            {label ? <span className="fsdb-person-name">{label}</span> : null}
          </span>
        )
      })}
    </span>
  )
}

export function PersonPickPanel({
  value,
  onChange,
  onPicked,
}: {
  value: unknown
  onChange: (next: PersonValue) => void
  onPicked?: () => void
}) {
  const current = asPerson(value)
  const selected = personKey(current)
  const [people, setPeople] = useState<ChatPerson[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadAgents()
      .then((rows) => {
        if (!cancelled) setPeople(rows)
      })
      .catch(() => {
        if (!cancelled) setPeople([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function pick(next: PersonValue) {
    onChange(next)
    onPicked?.()
  }

  return (
    <div className="fsdb-person-pick">
      <button
        type="button"
        className={`fsdb-person-option${selected === 'user' ? ' is-selected' : ''}`}
        onClick={() => pick(USER)}
      >
        <span className="fsdb-person-avatar" aria-hidden>
          <UserIcon className="size-[14px]" />
        </span>
        <span className="fsdb-person-name">用户</span>
      </button>
      <button
        type="button"
        className={`fsdb-person-option${selected === 'system' ? ' is-selected' : ''}`}
        onClick={() => pick(SYSTEM)}
      >
        <span className="fsdb-person-avatar" aria-hidden>
          <CpuChipIcon className="size-[14px]" />
        </span>
        <span className="fsdb-person-name">系统</span>
      </button>
      {people.map((person) => (
        <button
          type="button"
          key={person.id}
          className={`fsdb-person-option${selected === person.id ? ' is-selected' : ''}`}
          onClick={() => pick({ kind: 'agent', name: person.name, sessionId: person.id })}
        >
          <span className="fsdb-person-face" aria-hidden>
            <SidebarMascot
              size={18}
              sessionId={person.id}
              identity={resolveSessionMascot(person.id, person.mascot)}
              animate={false}
              title={person.name}
            />
          </span>
          <span className="fsdb-person-name">{person.name}</span>
        </button>
      ))}
      {loading ? (
        <div className="fsdb-person-loading">
          <ArrowPathIcon className="size-[14px] fsdb-spin" aria-hidden />
          加载会话…
        </div>
      ) : null}
    </div>
  )
}
