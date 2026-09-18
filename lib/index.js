// Host half of dsh-plugin-archive-folder.
// Registers one HTTP prefix route (/archive-folder) that the browser half calls.
export const inject = [
  'fs',
  'sessionQuery',
  'workspaceRegistry',
  'shell',
  'sessionTitle',
  'sessions',
  'webServer',
]

export function apply(ctx) {
  const fs = ctx.fs
  const sessionQuery = ctx.sessionQuery
  const workspaceRegistry = ctx.workspaceRegistry
  const shell = ctx.shell
  const sessionTitle = ctx.sessionTitle
  const sessions = ctx.sessions

  function norm(p) { return String(p || '').replace(/\\/g, '/') }

  function ts() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes())
  }

  function sanitize(name) {
    return String(name || '').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'chat'
  }

  function join(base, child) {
    const b = String(base || '').replace(/[\\/]+$/, '')
    return b ? b + '\\' + child : child
  }

  function parentDir(p) {
    return String(p || '').replace(/[^\\/]+$/, '').replace(/[\\/]+$/, '') || '.'
  }

  function esc(p) { return String(p || '').replace(/'/g, '') }

  async function cwdOf(sessionId) {
    try {
      const s = await sessionQuery.readSurface(sessionId)
      return (s && s.session && s.session.cwd) || null
    } catch (e) { return null }
  }

  async function shellJsonNames(dir) {
    const cmd = "Get-ChildItem -LiteralPath '" + esc(dir) + "' -Filter *.json -File | Where-Object { $_.Name -ne '_归档索引.json' -and $_.Name -ne '.index.json' } | ForEach-Object { $_.Name }"
    try {
      const spec = shell.resolve({ command: cmd, timeoutMs: 20000, sandboxPolicy: { mode: 'workspace-write', workspaceRoot: dir } })
      const r = await shell.run(spec)
      return ((r && r.stdout && r.stdout.text) || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    } catch (e) { return [] }
  }

  async function listArchiveDirs(sessionId) {
    const dirs = []
    const seen = {}
    function add(d) {
      if (!d) return
      const k = norm(d)
      if (seen[k]) return
      seen[k] = true
      dirs.push(d)
    }
    if (sessionId) {
      const c = await cwdOf(sessionId)
      if (c) add(join(c, '归档'))
    }
    let records = []
    try { records = await sessionQuery.listSessions() } catch (e) { records = [] }
    for (const r of records || []) {
      const c = r && r.header && r.header.cwd
      if (c) add(join(c, '归档'))
    }
    const existing = workspaceRegistry.list()
    for (const ws of existing) {
      if (!ws || !ws.path) continue
      const baseName = String(ws.path).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''
      add(baseName === '归档' ? ws.path : join(ws.path, '归档'))
    }
    return dirs
  }

  function parseName(name) {
    const base = String(name).replace(/\.json$/i, '')
    const m = base.match(/^(.*)-(\d{4}-\d{2}-\d{2}_\d{4})$/)
    if (m) {
      const d = m[2]
      return { title: m[1], timeLabel: d.slice(0, 10) + ' ' + d.slice(11, 13) + ':' + d.slice(13, 15) }
    }
    return { title: base || name, timeLabel: '' }
  }

  function lastUserGuiText(events) {
    const evs = Array.isArray(events) ? events : []
    let fallback = ''
    for (let i = evs.length - 1; i >= 0; i--) {
      const ev = evs[i]
      if (!ev) continue
      const d = ev.data || {}
      const isUser = ev.type === 'user/message' || d.role === 'user'
      if (!isUser) continue
      const blocks = d.content || (d.message && d.message.content)
      if (!blocks) continue
      const text = blocks.map((b) => (b && b.type === 'text' && b.text ? b.text : '')).join('').trim()
      if (!text) continue
      if (!fallback) fallback = text
      if (d.source && d.source.clientTimeZone) return text
    }
    return fallback
  }

  async function readJson(path) {
    try {
      const t = await fs.readText(await fs.resolve(path))
      return JSON.parse(t)
    } catch (e) { return null }
  }

  async function maxAnchorOf(dir, sessionId) {
    const names = await shellJsonNames(dir)
    let max = -1
    for (const name of names) {
      const p = await readJson(join(dir, name))
      if (p && String(p.sessionId) === String(sessionId) && typeof p.anchorSeq === 'number') {
        max = Math.max(max, p.anchorSeq)
      }
    }
    return max
  }

  function anchorSeqOf(events) {
    let anchor = null
    for (const e of events || []) {
      if (e && e.type === 'turn/end' && typeof e.seq === 'number') anchor = e.seq
    }
    if (anchor === null) {
      for (const e of events || []) {
        if (e && (e.type === 'user/message' || e.type === 'assistant/message') && typeof e.seq === 'number') anchor = e.seq
      }
    }
    return anchor
  }

  async function ensure(sessionId) {
    const log = await sessionQuery.readSession(sessionId)
    let title = 'chat'
    try {
      const t = await sessionQuery.readTitle(sessionId)
      if (t && t.title) title = t.title
    } catch (e) { /* title is optional */ }
    const cwd = await cwdOf(sessionId)
    return { log, title, cwd }
  }

  async function doStore(args) {
    const sessionId = args && args.sessionId
    if (!sessionId) return { ok: false, error: '没有提供会话 ID' }
    let info
    try { info = await ensure(sessionId) } catch (e) {
      return { ok: false, error: '读取会话失败: ' + ((e && e.message) || String(e)) }
    }
    let base = info.cwd
    if (!base) {
      const existing = workspaceRegistry.list()
      base = existing && existing[0] && existing[0].path
    }
    if (!base) return { ok: false, error: '该会话不在任何文件夹里，无法归档' }
    const archiveDir = join(base, '归档')
    const oldAnchor = await maxAnchorOf(archiveDir, sessionId)
    const curAnchor = anchorSeqOf(info.log.events)
    if (oldAnchor >= 0 && typeof curAnchor === 'number' && oldAnchor >= curAnchor) {
      return { ok: false, error: '该会话已归档过，且没有新的聊天内容，不能重复归档（请继续聊天后再归档）' }
    }
    const stem = sanitize(info.title) + '-' + ts()
    const jsonPath = join(archiveDir, stem + '.json')
    const payload = {
      version: 1,
      sessionId: String(sessionId),
      title: info.title,
      cwd: info.cwd,
      archivedAt: new Date().toISOString(),
      anchorSeq: curAnchor,
      events: info.log.events,
    }
    try {
      await fs.writeText(await fs.resolve(jsonPath), JSON.stringify(payload), undefined, undefined, { mode: 'workspace-write', workspaceRoot: base })
    } catch (e) {
      return { ok: false, error: '写入归档失败: ' + ((e && e.message) || String(e)) }
    }
    // Clean up index files written by earlier versions of this feature.
    try {
      const cmd = "Remove-Item -LiteralPath '" + esc(join(archiveDir, '_归档索引.json')) + "','" + esc(join(archiveDir, '.index.json')) + "' -Force -ErrorAction SilentlyContinue"
      const spec = shell.resolve({ command: cmd, workdir: archiveDir, timeoutMs: 10000, sandboxPolicy: { mode: 'workspace-write', workspaceRoot: archiveDir } })
      await shell.run(spec)
    } catch (e) { /* cleanup is best effort */ }
    return { ok: true, jsonPath }
  }

  async function doList(args) {
    const sessionId = args && args.sessionId
    const dirs = await listArchiveDirs(sessionId)
    const items = []
    const seen = {}
    for (const dir of dirs) {
      const names = await shellJsonNames(dir)
      for (const name of names) {
        const path = join(dir, name)
        const key = norm(path)
        if (seen[key]) continue
        seen[key] = true
        const p = await readJson(path)
        const parsed = parseName(name)
        items.push({
          name,
          path,
          key,
          title: parsed.title || (p && p.title) || name,
          timeLabel: parsed.timeLabel,
          snippet: (p ? lastUserGuiText(p.events) : '') || '',
        })
      }
    }
    items.sort((a, b) => (a.timeLabel < b.timeLabel ? 1 : -1))
    return { ok: true, items, dirs }
  }

  async function doRestore(args) {
    const file = args && args.file
    if (!file) return { ok: false, error: '没有提供存档文件' }
    const p = await readJson(file)
    if (!p) return { ok: false, error: '读取存档失败' }
    const parsed = parseName(String(file).replace(/^.*[\\/]/, ''))
    return {
      ok: true,
      sourceSessionId: p.sessionId ? String(p.sessionId) : null,
      anchorSeq: typeof p.anchorSeq === 'number' ? p.anchorSeq : null,
      title: p.title || parsed.title || '',
      timeLabel: parsed.timeLabel,
    }
  }

  async function doName(args) {
    const id = args && args.sessionId
    const title = args && args.title
    if (!id || !title) return { ok: false }
    try {
      const session = sessions.get(id)
      if (session) await sessionTitle.rename(session, String(title))
      return { ok: true }
    } catch (e) { return { ok: false } }
  }

  async function doDel(args) {
    const file = args && args.file
    if (!file) return { ok: false, error: '没有提供存档文件' }
    const mdPath = String(file).replace(/\.json$/i, '.md')
    const metaPath = String(file).replace(/\.json$/i, '.meta.json')
    const dir = parentDir(file)
    const cmd = "Remove-Item -LiteralPath '" + esc(file) + "','" + esc(mdPath) + "','" + esc(metaPath) + "' -Force -ErrorAction SilentlyContinue"
    try {
      const spec = shell.resolve({ command: cmd, workdir: dir, timeoutMs: 15000, sandboxPolicy: { mode: 'workspace-write', workspaceRoot: dir } })
      await shell.run(spec)
    } catch (e) {
      return { ok: false, error: '删除失败: ' + ((e && e.message) || String(e)) }
    }
    return { ok: true }
  }

  const handlers = { store: doStore, list: doList, restore: doRestore, name: doName, del: doDel }

  function readBody(req) {
    return new Promise((resolve) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 4_000_000) body = body.slice(0, 4_000_000)
      })
      req.on('end', () => {
        try { resolve(JSON.parse(body || '{}')) } catch (e) { resolve({}) }
      })
      req.on('error', () => resolve({}))
    })
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/archive-folder',
    handler: async (req, res) => {
      const body = req.method === 'POST' ? await readBody(req) : {}
      const fn = handlers[body && body.op]
      let out
      try {
        out = typeof fn === 'function' ? await fn(body) : { ok: false, error: 'unknown op' }
      } catch (e) {
        out = { ok: false, error: String((e && e.message) || e) }
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(out))
    },
  }), 'archive-folder: http route')
}
