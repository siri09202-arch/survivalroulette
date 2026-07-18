import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// ===== 型定義 =====
type Bindings = {
  ROOMS_KV: KVNamespace
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
}

// ルームの有効期限（秒）: 3時間
const ROOM_TTL = 60 * 60 * 3

const app = new Hono<{ Bindings: Bindings }>()

// CORSミドルウェア: OPTIONSプリフライトを含む全リクエストに対応
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))

// OPTIONSプリフライトを明示的に処理（wrangler pages dev 405対策）
// app.all でOPTIONSを捕捉して204を返す（app.useより後に登録）
app.all('/api/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    c.header('Access-Control-Max-Age', '86400')
    return c.body(null, 204)
  }
  await next()
})

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

// ===== AI クイズ生成エンドポイント =====
app.post('/api/quiz/generate', async (c) => {
  const { type, difficulty } = await c.req.json()
  const apiKey = c.env.OPENAI_API_KEY || ''
  const baseUrl = c.env.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

  if (!apiKey) {
    return c.json({ error: 'NO_API_KEY' }, 500)
  }

  // 難易度の説明を生成
  const difficultyList: string[] = Array.isArray(difficulty) && difficulty.length > 0 ? difficulty : ['medium']
  const diffMap: Record<string, string> = {
    easy:   'やさしい（小学生レベル、基本的な内容）',
    medium: 'ふつう（中学生レベル、標準的な内容）',
    hard:   'むずかしい（高校生レベル、応用的な内容）',
    expert: '激ムズ（大学生〜マニアレベル、かなり難しい内容）',
  }
  const diffDesc = difficultyList.map(d => diffMap[d] ?? d).join('・')
  const diffInstruction = `難易度は「${diffDesc}」の問題を混ぜて出題してください（選択した難易度からランダムに選ぶイメージ）。`

  const prompts: Record<string, string> = {
    kanji_quiz: `日本語の漢字・読み仮名・熟語に関する問題を5問生成してください。${diffInstruction}
各問題はJSON配列で返してください。形式:
[{"q":"問題文","choices":["選択肢A","選択肢B","選択肢C","選択肢D"],"answer":0}]
answerは正解の選択肢のインデックス（0〜3）。必ず正解はchoices[answer]と一致させてください。
選択肢はシャッフルし、正解の位置をランダムにしてください。
JSONのみを返し、説明文は不要です。`,
    math_quiz: `計算・数学の問題を5問生成してください。${diffInstruction}
（やさしい: 足し算・引き算, ふつう: 四則演算・分数, むずかしい: 方程式・割合・比, 激ムズ: 二次方程式・確率・数列など）
各問題はJSON配列で返してください。形式:
[{"q":"計算式や問題文","choices":["答え1","答え2","答え3","答え4"],"answer":0}]
answerは正解の選択肢のインデックス（0〜3）。正解はchoices[answer]と一致させてください。
選択肢はシャッフルし、正解の位置をランダムにしてください。
JSONのみを返し、説明文は不要です。`,
    english_quiz: `英単語・英語表現の日本語意味を問う問題を5問生成してください。${diffInstruction}
（やさしい: 基本単語, ふつう: 中学英語, むずかしい: 高校英語, 激ムズ: TOEIC上級・難関大学レベル）
各問題はJSON配列で返してください。形式:
[{"q":"「単語」の意味は？","choices":["意味A","意味B","意味C","意味D"],"answer":0}]
answerは正解の選択肢のインデックス（0〜3）。正解はchoices[answer]と一致させてください。
選択肢はシャッフルし、正解の位置をランダムにしてください。
JSONのみを返し、説明文は不要です。`,
  }

  const prompt = prompts[type]
  if (!prompt) return c.json({ error: 'INVALID_TYPE' }, 400)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
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

    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`)
    const data: any = await res.json()
    const content = data.choices?.[0]?.message?.content || ''

    // JSONを抽出してパース
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in response')
    const questions = JSON.parse(jsonMatch[0])

    return c.json({ questions })
  } catch (e: any) {
    // AI生成失敗時はフォールバック問題を返す
    return c.json({ questions: null, error: e.message })
  }
})

// ===== SPA フォールバック（全ルートをindex.htmlへ） =====
app.get('*', serveStatic({ root: './', path: 'index.html' }))

export default app
