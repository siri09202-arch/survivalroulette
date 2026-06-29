// POST /api/rooms - ルーム作成
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const roomId = body.roomId;
    if (!roomId) {
      return new Response(JSON.stringify({ error: 'NO_ROOM_ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    await env.ROOMS_KV.put(roomId, JSON.stringify(body), { expirationTtl: 10800 });
    return new Response(JSON.stringify({ ok: true, roomId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
