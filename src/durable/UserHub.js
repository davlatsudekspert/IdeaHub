// Har bir foydalanuvchi uchun BITTA Durable Object (env.USER_HUB.idFromName(userId)).
// Eski ws.js'dagi xotiradagi Map<userId,Set<socket>> o'rnini bosadi — lekin to'g'ri:
// eski usul faqat BITTA Node jarayonida ishlagan bo'lardi, Workers'da esa har so'rov
// alohida bo'lishi mumkin. Durable Object — shu userId uchun yagona, doimiy manzil.
//
// Hibernation API ishlatiladi (state.acceptWebSocket / getWebSockets): ulanish ochiq
// qolsa ham, DO hodisalar orasida xotiradan chiqarilishi mumkin — ko'p foydalanuvchi,
// ko'pincha bo'sh turadigan ulanishlar uchun narx deyarli nolga yaqin bo'ladi.

export class UserHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Worker'ning o'zidan ichki so'rov — shu foydalanuvchining barcha jonli
    // ulanishlariga xabar yetkazish (bildirishnoma, yangi xabar, qo'ng'iroq signali).
    if (url.pathname === '/push') {
      const payload = await request.text();
      const sockets = this.state.getWebSockets();
      let delivered = 0;
      for (const ws of sockets) {
        try { ws.send(payload); delivered++; } catch { /* o'lik socket — e'tiborsiz */ }
      }
      return Response.json({ delivered, online: sockets.length > 0 });
    }

    if (url.pathname === '/online') {
      return Response.json({ online: this.state.getWebSockets().length > 0 });
    }

    // Aks holda — WebSocket ulanishini o'rnatish
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Mijozdan kelgan xabarlar: faqat keepalive ping kutiladi ('{}').
  // WebRTC signalizatsiyasi va xabar yuborish REST (/api/...) orqali keladi —
  // eski frontend JS'i ham aynan shu yo'ldan foydalangan (signalizatsiya uchun
  // ws.send emas, fetch() ishlatilgan), shuning uchun bu yerda qo'shimcha
  // marshrutlashga hojat yo'q.
  async webSocketMessage(ws, message) {
    if (message === '{}' || message === 'ping') { try { ws.send('{}'); } catch {} }
  }

  async webSocketClose(ws, code, reason, wasClean) { /* hibernation o'zi tozalaydi */ }
  async webSocketError(ws, error) { /* jim o'tkazib yuboriladi */ }
}
