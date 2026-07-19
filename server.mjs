/**
 * Node.js APIサーバー（ローカル開発/Novitaサンドボックス用）
 * wrangler pages devの代わりにHono + @hono/node-serverで起動する。
 * KVはメモリで代替。静的ファイルはdist/から配信。
 */
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ========== KVメモリ代替 ==========
const kvStore = new Map()
const kvTTL  = new Map()

const ROOMS_KV = {
  get: async (key) => {
    const exp = kvTTL.get(key)
    if (exp && Date.now() > exp) { kvStore.delete(key); kvTTL.delete(key); return null }
    return kvStore.get(key) ?? null
  },
  put: async (key, value, opts) => {
    kvStore.set(key, value)
    if (opts?.expirationTtl) kvTTL.set(key, Date.now() + opts.expirationTtl * 1000)
  },
}

const ROOM_TTL = 60 * 60 * 3

// ========== Honoアプリ ==========
const app = new Hono()

// CORS（全ルート）
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))

// OPTIONSプリフライト（全ルートに明示応答）
app.options('/*', (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  c.header('Access-Control-Max-Age', '86400')
  return c.body(null, 204)
})

// ===== ルーム取得 =====
app.get('/api/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId').toUpperCase()
  const raw = await ROOMS_KV.get(roomId)
  if (!raw) return c.json({ error: 'NOT_FOUND' }, 404)
  try { return c.json(JSON.parse(raw)) } catch { return c.json({ error: 'PARSE_ERROR' }, 500) }
})

// ===== ルーム作成 =====
app.post('/api/rooms', async (c) => {
  const body = await c.req.json()
  const roomId = body.roomId
  if (!roomId) return c.json({ error: 'NO_ROOM_ID' }, 400)
  await ROOMS_KV.put(roomId, JSON.stringify(body), { expirationTtl: ROOM_TTL })
  return c.json({ ok: true, roomId })
})

// ===== ルーム更新（部分更新） =====
app.patch('/api/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId').toUpperCase()
  const raw = await ROOMS_KV.get(roomId)
  if (!raw) return c.json({ error: 'NOT_FOUND' }, 404)
  const current = JSON.parse(raw)
  const patch = await c.req.json()

  const applyDotPatch = (obj, patches) => {
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
  await ROOMS_KV.put(roomId, JSON.stringify(updated), { expirationTtl: ROOM_TTL })
  return c.json({ ok: true })
})

// ===== AI クイズ生成 =====
app.post('/api/quiz/generate', async (c) => {
  const { type, difficulty } = await c.req.json()

  // APIキーを.dev.varsファイルから優先取得（環境変数より新鮮なトークンが入っている場合のため）
  let apiKey = ''
  let baseUrl = 'https://www.genspark.ai/api/llm_proxy/v1'

  // まず.dev.varsファイルから読み込み
  try {
    const devVarsPath = path.join(__dirname, '.dev.vars')
    const content = fs.readFileSync(devVarsPath, 'utf-8')
    for (const line of content.split('\n')) {
      const [k, ...v] = line.split('=')
      if (k?.trim() === 'OPENAI_API_KEY') apiKey = v.join('=').trim()
      if (k?.trim() === 'OPENAI_BASE_URL') baseUrl = v.join('=').trim()
    }
  } catch {}

  // .dev.varsにない場合は環境変数にフォールバック
  if (!apiKey) apiKey = process.env.OPENAI_API_KEY || ''
  if (baseUrl === 'https://www.genspark.ai/api/llm_proxy/v1' && process.env.OPENAI_BASE_URL) {
    baseUrl = process.env.OPENAI_BASE_URL
  }

  if (!apiKey) return c.json({ error: 'NO_API_KEY' }, 500)

  const difficultyList = Array.isArray(difficulty) && difficulty.length > 0 ? difficulty : ['medium']
  const diffMap = { easy: 'やさしい（小学生レベル）', medium: 'ふつう（中学生レベル）', hard: 'むずかしい（高校生レベル）', expert: '激ムズ（大学〜マニア）' }
  const diffDesc = difficultyList.map(d => diffMap[d] ?? d).join('・')
  const diffInstruction = `難易度は「${diffDesc}」の問題を混ぜて出題してください。`

  const prompts = {
    kanji_quiz: `日本語の漢字・読み仮名・熟語に関する問題を5問生成してください。${diffInstruction}
各問題はJSON配列で返してください。形式:
[{"q":"問題文","choices":["A","B","C","D"],"answer":0}]
answerは正解インデックス(0-3)。choices[answer]が正解。選択肢をシャッフルしてください。JSONのみ返答。`,
    math_quiz: `計算・数学の問題を5問生成してください。${diffInstruction}
各問題はJSON配列で返してください。形式:
[{"q":"問題文","choices":["A","B","C","D"],"answer":0}]
answerは正解インデックス(0-3)。選択肢をシャッフルしてください。JSONのみ返答。`,
    english_quiz: `英単語・英語表現の日本語意味を問う問題を5問生成してください。${diffInstruction}
各問題はJSON配列で返してください。形式:
[{"q":"「単語」の意味は？","choices":["A","B","C","D"],"answer":0}]
answerは正解インデックス(0-3)。選択肢をシャッフルしてください。JSONのみ返答。`,
  }

  const prompt = prompts[type]
  if (!prompt) return c.json({ error: 'INVALID_TYPE' }, 400)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: 'あなたはゲーム用クイズ問題生成AIです。指定された形式の厳密なJSONのみを返してください。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.9,
        max_tokens: 1000,
      })
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')
    const questions = JSON.parse(jsonMatch[0])
    return c.json({ questions })
  } catch (e) {
    return c.json({ questions: null, error: e.message })
  }
})

// ===== 静的ファイル配信（dist/フォルダ） =====
app.use('/*', serveStatic({ root: './dist' }))

// ===== SPAフォールバック =====
app.get('*', (c) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html')
  if (fs.existsSync(indexPath)) {
    return c.html(fs.readFileSync(indexPath, 'utf-8'))
  }
  return c.text('Not Found', 404)
})

const port = parseInt(process.env.PORT || '3000')
console.log(`🚀 Server running on http://0.0.0.0:${port}`)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
