// Worker tomonidan foydalanuvchi Durable Object'iga xabar yuborish uchun yupqa qatlam.
// Eski ws.sendTo(userId, obj) / ws.isOnline(userId) o'rnini bosadi.

export async function sendTo(env, userId, payload) {
  if (!userId) return { delivered: 0, online: false };
  try {
    const stub = env.USER_HUB.get(env.USER_HUB.idFromName(userId));
    const res = await stub.fetch('https://user-hub/push', { method: 'POST', body: JSON.stringify(payload) });
    return await res.json();
  } catch (e) {
    console.error('ws.sendTo xatosi:', e.message);
    return { delivered: 0, online: false };
  }
}

export async function isOnline(env, userId) {
  if (!userId) return false;
  try {
    const stub = env.USER_HUB.get(env.USER_HUB.idFromName(userId));
    const res = await stub.fetch('https://user-hub/online');
    return (await res.json()).online;
  } catch { return false; }
}
