'use strict';

/* ═══ IKONKALAR ═══ */
const IC = {
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`,
  cmt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  msg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  cam: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  lightbulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>`,
};

/* ═══ YORDAMCHI ═══ */
function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escJs(s) { return esc(String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")); }
function initials(n) { return (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function fmtNum(n) { if(n==null) return '0'; return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1000?(n/1000).toFixed(1)+'k':String(n); }
function fmtTime(sec) { if(!sec||isNaN(sec)) return '0:00'; const m=Math.floor(sec/60),s=Math.floor(sec%60); return m+':'+(s<10?'0':'')+s; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
function spinner() { return '<div class="spin"></div>'; }
function emptyEl(icon, title, desc='') {
  const ico = IC[icon] || (/^<svg|^[^a-zA-Z]/.test(String(icon||'')) ? icon : IC.bell);
  return `<div class="empty"><div class="empty-icon">${ico}</div><div class="empty-title">${esc(title)}</div>${desc?`<div class="empty-desc">${esc(desc)}</div>`:''}</div>`;
}
function toast(msg, dur=3200) {
  const t = document.getElementById('toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), dur);
}
function avStyle(u, sz=32) { return `width:${sz}px;height:${sz}px;background:${u?.color||'#C8922A'};`; }
function avHtml(u, sz=32, fs=12) {
  return u?.avatar ? `<img src="${esc(u.avatar)}" style="width:100%;height:100%;object-fit:cover" alt="">` : `<span style="font-size:${fs}px;font-weight:800;color:#fff">${initials(u?.name||u?.username)}</span>`;
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    toast('Nusxalandi');
  } catch { toast(text); }
}
function copyLink(path) {
  const url = `${location.origin}${path}`;
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(()=>toast('Havola nusxalandi')).catch(()=>fallbackCopy(url));
  else fallbackCopy(url);
}

/* ═══ TOIFALAR (server ro'yxati yuklanmagunicha zaxira) ═══ */
let CATEGORIES = [
  { id:'talim', name:"Ta'lim infratuzilmasi", color:'#3D7BEB', icon:'🏫' },
  { id:'yol-xavfsizligi', name:"Yo'l xavfsizligi", color:'#D9591F', icon:'🚦' },
  { id:'ekologiya', name:'Ekologiya va tozalik', color:'#238753', icon:'🌱' },
  { id:'ijtimoiy', name:'Ijtimoiy xizmatlar', color:'#8B5CF6', icon:'🤝' },
  { id:'boshqa', name:'Boshqa', color:'#917B5C', icon:'📌' },
];
function catById(id) { return CATEGORIES.find(c=>c.id===id) || CATEGORIES[CATEGORIES.length-1]; }
function catChip(catId) {
  const c = catById(catId);
  return `<span class="cat-chip" style="background:${c.color}18;color:${c.color}">${c.icon} ${esc(c.name)}</span>`;
}
const STATUS_LABEL = { open:"Ochiq", solution_proposed:"Yechim taklif qilindi", resolved:"Hal qilindi", closed:"Yopilgan" };

/* ═══ SECTION ROUTER ═══ */
let _curSec = 'home';
function curSec() { return _curSec; }
function goSec(id) {
  _curSec = id;
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'sec-'+id));
  document.querySelectorAll('.lsb-btn[data-sec]').forEach(b => b.classList.toggle('active', b.dataset.sec === id));
  document.getElementById('layout')?.classList.toggle('msgs-full', id === 'msgs');
  window.scrollTo(0,0);
  const bnMap = { home:'bn-home', notifs:'bn-notifs', user:'bn-profile', search:'bn-search' };
  document.querySelectorAll('.bn-item[id]').forEach(b => b.classList.remove('active'));
  if (bnMap[id]) document.getElementById(bnMap[id])?.classList.add('active');
}

/* ═══ TOKEN ═══ */
const LS_KEY = 'ih_tok';
function tokLoad() { try { return localStorage.getItem(LS_KEY)||null; } catch { return null; } }
function tokSave(t) { try { localStorage.setItem(LS_KEY,t); } catch {} }
function tokClear() { try { localStorage.removeItem(LS_KEY); } catch {} }
const Tok = { get:tokLoad, set:tokSave, clr:tokClear };

/* ═══ API ═══ */
async function api(method, path, body=null, isForm=false) {
  const opts = { method, headers:{} };
  const tok = Tok.get();
  if (tok) opts.headers.Authorization = 'Bearer ' + tok;
  if (body) {
    if (isForm) opts.body = body;
    else { opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
  }
  let res;
  try { res = await fetch('/api'+path, opts); }
  catch { throw new Error("Internetga ulanish yo'q"); }
  if (!res.ok) {
    const e = await res.json().catch(()=>({ error: res.status===413?'Fayl juda katta':res.statusText }));
    throw new Error(e.error||'Xatolik');
  }
  if (res.status === 204) return {};
  return res.json().catch(()=>({}));
}
const API = {
  register:(b) => api('POST','/auth/register',b),
  login:(u,p) => api('POST','/auth/login',{username:u,password:p}),
  sendCode:(u) => api('POST','/auth/send-code',{username:u}),
  verifyCode:(u,c) => api('POST','/auth/verify-code',{username:u,code:c}),
  resetPass:(t,p) => api('POST','/auth/reset',{token:t,new_pass:p}),
  me:() => api('GET','/me'),
  updMe:(b) => api('PUT','/me',b),
  chpass:(o,n) => api('PUT','/me/password',{old_pass:o,new_pass:n}),
  uploadAv:(fd) => api('POST','/me/avatar',fd,true),
  uploadBanner:(fd) => api('POST','/me/banner',fd,true),
  getUser:(p) => api('GET','/users/'+p),
  searchUsers:(q) => api('GET','/users/search?q='+encodeURIComponent(q)),
  regions:() => api('GET','/regions'),
  schools:(regionId) => api('GET','/regions/'+regionId+'/schools'),
  categories:() => api('GET','/categories'),
  createProblem:(b,isForm) => api('POST','/problems',b,isForm),
  myProblems:() => api('GET','/problems/mine'),
  searchProblems:(q) => api('GET','/problems/search?q='+encodeURIComponent(q)),
  getProblem:(id) => api('GET','/problems/'+id),
  delProblem:(id) => api('DELETE','/problems/'+id),
  clusters:(sort,offset,filters={}) => api('GET',`/clusters?sort=${sort}&offset=${offset||0}${filters.region?'&region='+filters.region:''}${filters.category?'&category='+filters.category:''}`),
  getCluster:(id) => api('GET','/clusters/'+id),
  support:(id) => api('POST','/clusters/'+id+'/support'),
  setClusterStatus:(id,status) => api('POST','/clusters/'+id+'/status',{status}),
  addComment:(clusterId,body) => api('POST','/clusters/'+clusterId+'/comments',{body}),
  delComment:(id) => api('DELETE','/comments/'+id),
  addSolution:(clusterId,title,body) => api('POST','/clusters/'+clusterId+'/solutions',{title,body}),
  generateSolutions:(clusterId) => api('POST','/clusters/'+clusterId+'/generate-solutions'),
  voteSolution:(id) => api('POST','/solutions/'+id+'/vote'),
  acceptSolution:(id) => api('POST','/solutions/'+id+'/accept'),
  notifications:() => api('GET','/notifications'),
  notifCount:() => api('GET','/notifications/count'),
  markNotifs:() => api('POST','/notifications/read'),
  messages:() => api('GET','/messages'),
  thread:(uid) => api('GET','/messages/'+uid),
  sendMsg:(toId,body) => api('POST','/messages',{to_id:toId,body}),
  delMsg:(id) => api('DELETE','/messages/'+id),
  sendVoice:(fd) => api('POST','/messages/voice',fd,true),
  sendChatImage:(fd) => api('POST','/messages/image',fd,true),
  callOffer:(toId,callType,offer) => api('POST','/call/offer',{to_id:toId,call_type:callType,offer}),
  callAnswer:(toId,answer) => api('POST','/call/answer',{to_id:toId,answer}),
  callIce:(toId,cand) => api('POST','/call/ice',{to_id:toId,candidate:cand}),
  callEnd:(toId) => api('POST','/call/end',{to_id:toId}),
  callReject:(toId) => api('POST','/call/reject',{to_id:toId}),
  search:(q,type) => api('GET',`/search?q=${encodeURIComponent(q)}&type=${type||'all'}`),
  report:(b) => api('POST','/reports',b),
  adminStats:() => api('GET','/admin/stats'),
  adminAction:(b) => api('POST','/admin/action',b),
};

/* ═══ WEBSOCKET ═══ */
const WS = (() => {
  let ws=null, _cbs={}, _pingInterval=null, _closing=false, _retry=0, _retryTimer=null;
  function connect(tok) {
    if (ws && ws.readyState < 2) return;
    _closing = false;
    const proto = location.protocol==='https:'?'wss:':'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(tok||'')}`);
    ws.onmessage = e => { try { const d = JSON.parse(e.data); (_cbs[d.type]||[]).forEach(fn=>fn(d)); } catch {} };
    ws.onclose = () => {
      clearInterval(_pingInterval);
      if (_closing || !tok) return;
      _retry = Math.min(_retry+1, 6);
      clearTimeout(_retryTimer);
      _retryTimer = setTimeout(()=>connect(tok), Math.min(1000*2**_retry, 30000));
    };
    ws.onopen = () => { _retry = 0; _pingInterval = setInterval(()=>{ try { ws.send('{}'); } catch {} }, 25000); };
    ws.onerror = () => {};
  }
  function on(type, fn) { (_cbs[type]||(_cbs[type]=[])).push(fn); }
  function disconnect() { _closing = true; clearInterval(_pingInterval); clearTimeout(_retryTimer); try { ws?.close(); } catch {} ws=null; }
  return { connect, on, disconnect };
})();

/* ═══ PUSH BILDIRISHNOMALARI ═══ */
function showBrowserNotif(title, body, icon) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, icon: icon || '/favicon.png' });
    setTimeout(()=>n.close(), 8000);
  } catch {}
}

window.IC=IC; window.esc=esc; window.escJs=escJs; window.initials=initials; window.fmtNum=fmtNum; window.fmtTime=fmtTime;
window.debounce=debounce; window.spinner=spinner; window.emptyEl=emptyEl; window.toast=toast;
window.avStyle=avStyle; window.avHtml=avHtml; window.fallbackCopy=fallbackCopy; window.copyLink=copyLink;
window.CATEGORIES=CATEGORIES; window.catById=catById; window.catChip=catChip; window.STATUS_LABEL=STATUS_LABEL;
window.curSec=curSec; window.goSec=goSec; window.Tok=Tok; window.API=API; window.WS=WS; window.api=api;
window.showBrowserNotif=showBrowserNotif;
