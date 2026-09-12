'use strict';

/* ═══ ICONS ═══ */
const IC = {
  up:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`,
  dn:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`,
  cmt:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  save:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
  link:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  plus:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  settings:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  msg:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  follow:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
  cam:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  send:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  sun:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  bell:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  people:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  lightbulb:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>`,
};

/* ═══ UTILS ═══ */
function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
/* onclick="fn('...')" ichiga matn qo'yish uchun: avval JS uchun, keyin HTML uchun qalqon.
   esc() yolg'iz yetarli emas — apostrof ( O'zbekiston ) JS satrini buzadi. */
function escJs(s) { return esc(String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")); }
function initials(n) { return (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function fmtNum(n) { if(n==null) return '0'; return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1000?(n/1000).toFixed(1)+'k':String(n); }
function fmtTime(sec) { if(!sec||isNaN(sec)) return '0:00'; const m=Math.floor(sec/60),s=Math.floor(sec%60); return m+':'+(s<10?'0':'')+s; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
function spinner() { return '<div class="spin"></div>'; }
function emptyEl(icon, title, desc='') {
  // IC[icon] bo'lmasa va oddiy so'z berilsa — xom matn ko'rsatmaslik uchun zaxira ikonka
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
  return u?.avatar ? `<img src="${esc(u.avatar)}" style="width:100%;height:100%;object-fit:cover" alt="">` : `<span style="font-size:${fs}px;font-weight:800;color:#fff;font-family:'Plus Jakarta Sans',sans-serif">${initials(u?.name||u?.username)}</span>`;
}
function copyLink(path) {
  const url = `${location.origin}${path}`;
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(()=>toast('Havola nusxalandi')).catch(()=>fallbackCopy(url));
  else fallbackCopy(url);
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    toast('Nusxalandi');
  } catch { toast(text); }
}

/* ═══ MUROJAAT TOIFALARI (server ro'yxati yuklanmagunicha zaxira) ═══ */
let CATEGORIES = [
  { id:'talim', name:"Ta'lim infratuzilmasi", color:'#3D7BEB', icon:'🏫' },
  { id:'yol-xavfsizligi', name:"Yo'l xavfsizligi", color:'#D9591F', icon:'🚦' },
  { id:'ekologiya', name:'Ekologiya va tozalik', color:'#238753', icon:'🌱' },
  { id:'ijtimoiy', name:'Ijtimoiy xizmatlar', color:'#8B5CF6', icon:'🤝' },
  { id:'sport', name:"Sport va bo'sh vaqt", color:'#D6455D', icon:'⚽' },
  { id:'sogliq', name:"Sog'liqni saqlash", color:'#0F7B8A', icon:'⚕️' },
  { id:'raqamlashtirish', name:'Raqamlashtirish', color:'#5C7A99', icon:'💻' },
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
  pauseAllVideos();
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'sec-'+id));
  document.querySelectorAll('.lsb-btn[data-sec]').forEach(b => b.classList.toggle('active', b.dataset.sec === id));
  // Full-screen messages view (sidebar hidden)
  document.getElementById('layout')?.classList.toggle('msgs-full', id === 'msgs');
  // Close mobile search bar when leaving search section
  if (id !== 'search') { const mb = document.getElementById('mobile-search-bar'); if (mb) mb.classList.remove('open'); }
  window.scrollTo(0,0);
  // Update bottom nav
  const bnMap = { home:'bn-home', murojaat:'bn-murojaat', notifs:'bn-notifs', msgs:'bn-msgs', user:'bn-profile', search:'bn-search' };
  document.querySelectorAll('.bn-item[id]').forEach(b => b.classList.remove('active'));
  const bnId = bnMap[id];
  if (bnId) document.getElementById(bnId)?.classList.add('active');
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
    if (isForm) { opts.body = body; }
    else { opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
  }
  let res;
  try {
    res = await fetch('/api'+path, opts);
  } catch {
    throw new Error('Internetga ulanish yo\'q');
  }
  if (!res.ok) {
    const e = await res.json().catch(()=>({ error: res.status===413 ? 'Fayl juda katta' : res.statusText }));
    throw new Error(e.error||'Xatolik');
  }
  if (res.status === 204) return {};
  return res.json().catch(()=>({}));
}
const API = {
  /* konfiguratsiya */
  config:   ()          => api('GET','/config'),
  publicStats:      ()  => api('GET','/public-stats'),
  publicCategories: ()  => api('GET','/public-categories'),
  publicRegions:    ()  => api('GET','/public-regions'),
  /* auth */
  login:    (u,p)      => api('POST','/auth/login',{username:u,password:p}),
  register: (b)         => api('POST','/auth/register',b),
  sendCode:(u)         => api('POST','/auth/send-code',{username:u}),
  verifyCode:(u,c)     => api('POST','/auth/verify-code',{username:u,code:c}),
  resetPass:(t,p)      => api('POST','/auth/reset',{token:t,new_pass:p}),
  /* profil */
  me:       ()         => api('GET','/me'),
  updMe:    (b)        => api('PUT','/me',b),
  chpass:   (o,n)      => api('PUT','/me/password',{old_pass:o,new_pass:n}),
  uploadAv: (fd)       => api('POST','/me/avatar',fd,true),
  uploadBanner:(fd)    => api('POST','/me/banner',fd,true),
  getUser:  (p)        => api('GET','/users/'+p),
  followUser:(id)      => api('POST','/users/'+id+'/follow'),
  searchUsers:(q)      => api('GET','/users/search?q='+encodeURIComponent(q)),
  /* hudud/maktab/toifa (murojaat uchun) */
  regions:  ()         => api('GET','/regions'),
  schools:  (regionId) => api('GET','/regions/'+regionId+'/schools'),
  categories:()        => api('GET','/categories'),
  /* jamoalar */
  communities:()       => api('GET','/communities'),
  getCom:   (slug)     => api('GET','/communities/'+slug),
  popularComs:()       => api('GET','/communities/popular'),
  mineComs: ()         => window._me ? api('GET','/communities?mine=1') : Promise.resolve([]),
  joinCom:  (slug)     => api('POST','/communities/'+slug+'/join'),
  createCom:(slug,name,desc,color,is_private)=>api('POST','/communities',{slug,name,description:desc,color,is_private}),
  updateCom:(slug,fd,isForm) => api('PUT','/communities/'+slug,fd,isForm),
  delCom:   (slug)     => api('DELETE','/communities/'+slug),
  comAdminAdd:(slug,userId) => api('POST','/communities/'+slug+'/admin',{user_id:userId}),
  comAdminDel:(slug,userId) => api('DELETE','/communities/'+slug+'/admin',{user_id:userId}),
  comRequest:(slug,reqId,action) => api('POST','/communities/'+slug+'/request/'+reqId,{action}),
  comPosts: (slug,sort,off) => api('GET',`/communities/${slug}/posts?sort=${sort}&offset=${off||0}`),
  /* postlar (jamoalar ichida) */
  posts:    (sort,off) => api('GET',`/posts?sort=${sort}&offset=${off||0}`),
  post:     (id)       => api('GET','/posts/'+id),
  createPost:(b,isForm)=> api('POST','/posts',b,isForm),
  vote:     (id,v)     => api('POST','/posts/'+id+'/vote',{vote:v}),
  save:     (id)       => api('POST','/posts/'+id+'/save'),
  savedPosts:()        => api('GET','/posts/saved'),
  delPost:  (id)       => api('DELETE','/posts/'+id),
  comment:  (pid,body,parentId) => api('POST','/posts/'+pid+'/comments',{body,parent_id:parentId||null}),
  voteCmt:  (id,v)     => api('POST','/post-comments/'+id+'/vote',{vote:v}),
  delCmt:   (id)       => api('DELETE','/post-comments/'+id),
  votePoll: (pollId,opt)=> api('POST','/polls/'+pollId+'/vote',{option:opt}),
  /* murojaat -> AI -> klaster -> yechim */
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
  /* xabar/qo'ng'iroq */
  messages: ()         => api('GET','/messages'),
  thread:   (uid)      => api('GET','/messages/'+uid),
  sendMsg:  (toId,body)=> api('POST','/messages',{to_id:toId,body}),
  delMsg:   (id)       => api('DELETE','/messages/'+id),
  sendVoice: (fd)      => api('POST','/messages/voice',fd,true),
  sendChatImage:(fd)   => api('POST','/messages/image',fd,true),
  callOffer:  (toId,callType,offer) => api('POST','/call/offer',{to_id:toId,call_type:callType,offer}),
  callAnswer: (toId,answer) => api('POST','/call/answer',{to_id:toId,answer}),
  callIce:    (toId,cand)   => api('POST','/call/ice',{to_id:toId,candidate:cand}),
  callEnd:    (toId)        => api('POST','/call/end',{to_id:toId}),
  callReject: (toId)        => api('POST','/call/reject',{to_id:toId}),
  /* bildirishnoma / qidiruv / shikoyat */
  notifications:()     => api('GET','/notifications'),
  notifCount:()        => api('GET','/notifications/count'),
  markNotifs:()        => api('POST','/notifications/read'),
  search:   (q,type)   => api('GET',`/search?q=${encodeURIComponent(q)}&type=${type||'all'}`),
  report:   (b)        => api('POST','/reports',b),
  /* boshqaruv paneli */
  adminStats:()        => api('GET','/admin/stats'),
  adminAction:(b)      => api('POST','/admin/action',b),
  adminResolve:(id,s)  => api('POST','/admin/reports/'+id,{status:s}),
};

/* ═══ WEBSOCKET ═══ */
const WS = (() => {
  let ws=null, _cbs={}, _pingInterval=null, _closing=false, _retry=0, _retryTimer=null;
  function connect(tok) {
    if (ws && ws.readyState < 2) return;
    _closing = false;
    const proto = location.protocol==='https:'?'wss:':'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(tok||'')}`);
    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        (_cbs[d.type]||[]).forEach(fn=>fn(d));
      } catch {}
    };
    ws.onclose = () => {
      clearInterval(_pingInterval);
      if (_closing || !tok) return;
      _retry = Math.min(_retry + 1, 6);
      clearTimeout(_retryTimer);
      _retryTimer = setTimeout(()=>connect(tok), Math.min(1000 * 2 ** _retry, 30000));
    };
    ws.onopen = () => {
      _retry = 0;
      _pingInterval = setInterval(()=>{ try { ws.send('{}'); } catch {} }, 25000);
    };
    ws.onerror = () => {};
  }
  function on(type, fn) { (_cbs[type]||(_cbs[type]=[])).push(fn); }
  function disconnect() {
    _closing = true;
    clearInterval(_pingInterval); clearTimeout(_retryTimer);
    try { ws?.close(); } catch {}
    ws = null;
  }
  return { connect, on, disconnect };
})();

/* ═══ HELPERS ═══ */
/* debouncedSearch — app.js'da e'lon qilinadi (doSearch shu yerda joylashgan, ikki marta e'lon qilish SyntaxError beradi) */
function toggleReplyForm(cid) { document.getElementById('rf-'+cid)?.classList.toggle('open'); }

/* ═══ CUSTOM PLAYERS (post ichidagi video/audio) ═══ */
function cvpToggle(btn) {
  const video = btn.closest('.custom-video-player')?.querySelector('video'); if(!video) return;
  if (video.paused) {
    video.play();
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  } else {
    video.pause();
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }
  if (!video._timeListenerAdded) {
    video._timeListenerAdded = true;
    video.addEventListener('timeupdate', () => {
      const fill = video.closest('.custom-video-player')?.querySelector('.player-progress-fill');
      const time = video.closest('.custom-video-player')?.querySelector('.player-time');
      if (fill && video.duration) fill.style.width = (video.currentTime/video.duration*100)+'%';
      if (time) time.textContent = fmtTime(video.currentTime);
    });
    video.addEventListener('ended', () => {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    });
  }
}
function cvpSeek(bar, e) {
  const video = bar.closest('.custom-video-player')?.querySelector('video'); if(!video||!video.duration) return;
  const rect = bar.getBoundingClientRect();
  video.currentTime = ((e.clientX-rect.left)/rect.width)*video.duration;
}
function cvpMute(btn) {
  const video = btn.closest('.custom-video-player')?.querySelector('video'); if(!video) return;
  video.muted = !video.muted;
  btn.style.opacity = video.muted ? '.4' : '1';
}
function cvpFullscreen(btn) {
  const player = btn.closest('.custom-video-player'); if(!player) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else player.requestFullscreen?.();
}
function pauseAllVideos() {
  document.querySelectorAll('video').forEach(video => {
    if (video.id === 'call-remote-vid' || video.id === 'call-local-vid') return;
    if (video.paused) return;
    video.pause();
    const btn = video.closest('.custom-video-player')?.querySelector('.play-btn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  });
}
function capToggle(id) {
  const audio = document.getElementById(id+'-audio');
  const btn   = document.querySelector('#'+id+' .play-btn');
  if (!audio) return;
  if (audio.paused) {
    audio.play();
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  } else {
    audio.pause();
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }
}
function capSeek(id, bar, e) {
  const audio = document.getElementById(id+'-audio'); if(!audio||!audio.duration) return;
  const rect = bar.getBoundingClientRect();
  audio.currentTime = ((e.clientX-rect.left)/rect.width)*audio.duration;
}
function setupAudioPlayer(id) {
  const audio = document.getElementById(id+'-audio'); if(!audio) return;
  audio.addEventListener('timeupdate', () => {
    const pct = audio.duration ? audio.currentTime/audio.duration : 0;
    const prog = document.getElementById(id+'-prog');
    if (prog) prog.style.width = (pct*100)+'%';
    const timeEl = document.getElementById(id+'-time');
    if (timeEl) timeEl.textContent = fmtTime(audio.currentTime);
    const barsEl = document.getElementById(id+'-bars');
    if (barsEl) {
      const active = Math.round(pct*barsEl.children.length);
      Array.from(barsEl.children).forEach((b,i)=>{ b.style.background = i<active?'var(--gold)':'var(--border2)'; });
    }
  });
  audio.addEventListener('ended', () => {
    const btn = document.querySelector('#'+id+' .play-btn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    const barsEl = document.getElementById(id+'-bars');
    if (barsEl) Array.from(barsEl.children).forEach(b=>b.style.background='var(--border2)');
  });
}

/* ═══ SHIKOYAT (post, murojaat — umumiy) ═══ */
let _reportTarget = null, _reportType = null, _reportReason = '';

function openReport(targetId, type) {
  if (!requireAuth()) return;
  _reportTarget = targetId;
  _reportType = type;
  _reportReason = '';
  const ta = document.getElementById('report-reason-text'); if (ta) ta.value = '';
  document.querySelectorAll('.report-reason-btn').forEach(b => {
    b.style.borderColor = 'var(--border2)';
    b.style.background = 'var(--surface)';
  });
  document.getElementById('report-overlay')?.classList.add('open');
}
function closeReport() {
  document.getElementById('report-overlay')?.classList.remove('open');
  _reportTarget = null;
}
function selectReportReason(btn) {
  document.querySelectorAll('.report-reason-btn').forEach(b => {
    b.style.borderColor = 'var(--border2)';
    b.style.background = 'var(--surface)';
  });
  btn.style.borderColor = 'var(--gold)';
  btn.style.background = 'var(--gold-soft)';
  _reportReason = btn.textContent.trim();
  const ta = document.getElementById('report-reason-text'); if (ta) ta.value = _reportReason;
}
async function submitReport() {
  if (!_reportTarget) return;
  const reason = (document.getElementById('report-reason-text')?.value || '').trim() || _reportReason;
  if (!reason) { toast('Sabab kiriting'); return; }
  const btn = document.getElementById('report-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const body = { reason };
    if (_reportType === 'post') body.post_id = _reportTarget;
    else if (_reportType === 'problem') body.problem_id = _reportTarget;
    else body.comment_id = _reportTarget;
    await API.report(body);
    closeReport();
    toast("Shikoyat yuborildi. Rahmat!");
  } catch(e) { toast(e.message || 'Xatolik'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Yuborish'; } }
}

/* ═══ BROWSER BILDIRISHNOMASI ═══ */
function showBrowserNotif(title, body, icon, onClick) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, icon: icon || '/favicon.png', badge: '/favicon.png' });
    if (onClick) n.onclick = onClick;
    setTimeout(()=>n.close(), 8000);
  } catch {}
}
/* initPushPermissionPrompt — app.js'da e'lon qilinadi (boot() shu yerda, ikki marta kerak emas) */

window.IC=IC; window.esc=esc; window.escJs=escJs; window.initials=initials; window.fmtNum=fmtNum; window.fmtTime=fmtTime;
window.debounce=debounce; window.spinner=spinner; window.emptyEl=emptyEl; window.toast=toast;
window.avStyle=avStyle; window.avHtml=avHtml; window.copyLink=copyLink; window.fallbackCopy=fallbackCopy;
window.CATEGORIES=CATEGORIES; window.catById=catById; window.catChip=catChip; window.STATUS_LABEL=STATUS_LABEL;
window.curSec=curSec; window.goSec=goSec;
window.Tok=Tok; window.API=API; window.WS=WS; window.api=api;
window.toggleReplyForm=toggleReplyForm;
window.cvpToggle=cvpToggle; window.cvpSeek=cvpSeek; window.cvpMute=cvpMute; window.cvpFullscreen=cvpFullscreen;
window.pauseAllVideos=pauseAllVideos;
window.capToggle=capToggle; window.capSeek=capSeek; window.setupAudioPlayer=setupAudioPlayer;
window.openReport=openReport; window.closeReport=closeReport; window.selectReportReason=selectReportReason; window.submitReport=submitReport;
window.showBrowserNotif=showBrowserNotif;
