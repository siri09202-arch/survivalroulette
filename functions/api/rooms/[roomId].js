// GET /api/rooms/:roomId - ルーム取得
// PATCH /api/rooms/:roomId - ルーム部分更新
export async function onRequestGet(context) {
  const { params, env } = context;
  const roomId = params.roomId.toUpperCase();
  const raw = await env.ROOMS_KV.get(roomId);
  if (!raw) {
    return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPatch(context) {
  const { request, params, env } = context;
  const roomId = params.roomId.toUpperCase();
  const raw = await env.ROOMS_KV.get(roomId);
  if (!raw) {
    return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  const current = JSON.parse(raw);
  const patch = await request.json();

  // ドット記法キー（例: "gameState.turn"）の再帰適用
  const applyDotPatch = (obj, patches) => {
    const result = JSON.parse(JSON.stringify(obj));
    for (const [key, value] of Object.entries(patches)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let cur = result;
        for (let i = 0; i < parts.length - 1; i++) {
          if (cur[parts[i]] === undefined || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = value;
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  const updated = applyDotPatch(current, patch);
  await env.ROOMS_KV.put(roomId, JSON.stringify(updated), { expirationTtl: 10800 });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
