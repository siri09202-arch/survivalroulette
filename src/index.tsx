import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// ===== 型定義 =====
type Bindings = {
  ROOMS_KV: KVNamespace
}

// ルームの有効期限（秒）: 3時間
const ROOM_TTL = 60 * 60 * 3

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// ===== ルーム取得 =====
app.get('/api/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId').toUpperCase()
  const raw = await c.env.ROOMS_KV.get(roomId)
  if (!raw) return c.json({ error: 'NOT_FOUND' }, 404)
  try {
    return c.json(JSON.parse(raw))
  } catch {
    return c.json({ error: 'PARSE_ERROR' }, 500)
  }
})

// ===== ルーム作成 =====
app.post('/api/rooms', async (c) => {
  const body = await c.req.json()
  const roomId: string = body.roomId
  if (!roomId) return c.json({ error: 'NO_ROOM_ID' }, 400)
  await c.env.ROOMS_KV.put(roomId, JSON.stringify(body), { expirationTtl: ROOM_TTL })
  return c.json({ ok: true, roomId })
})

// ===== ルーム更新（部分更新） =====
app.patch('/api/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId').toUpperCase()
  const raw = await c.env.ROOMS_KV.get(roomId)
  if (!raw) return c.json({ error: 'NOT_FOUND' }, 404)
  const current = JSON.parse(raw)
  const patch = await c.req.json()

  // ドット記法のキー（例: "gameState.turn"）を再帰的に適用
  const applyDotPatch = (obj: any, patches: Record<string, any>) => {
    const result = { ...obj }
    for (const [key, value] of Object.entries(patches)) {
      if (key.includes('.')) {
        const parts = key.split('.')
        let cur = result
        for (let i = 0; i < parts.length - 1; i++) {
          if (cur[parts[i]] === undefined) cur[parts[i]] = {}
          cur[parts[i]] = { ...cur[parts[i]] }
          cur = cur[parts[i]]
        }
        cur[parts[parts.length - 1]] = value
      } else {
        result[key] = value
      }
    }
    return result
  }

  const updated = applyDotPatch(current, patch)
  await c.env.ROOMS_KV.put(roomId, JSON.stringify(updated), { expirationTtl: ROOM_TTL })
  return c.json({ ok: true })
})

// ===== 静的ファイル配信 =====
app.use('/static/*', serveStatic({ root: './' }))

// ===== SPA フォールバック（全ルートをindex.htmlへ） =====
app.get('*', serveStatic({ root: './', path: 'index.html' }))

export default app
