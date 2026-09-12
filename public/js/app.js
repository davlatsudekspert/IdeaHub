'use strict';

/* ═══ AUTH MODAL ═══ */
function showAuthModal(){ document.getElementById('auth-modal').classList.add('open'); loadRegionsInto(['am-reg-region']); }
function closeAuthModal(){ document.getElementById('auth-modal').classList.remove('open'); }
function switchAmTab(t){
  document.querySelectorAll('#auth-modal .auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.t===t));
  document.getElementById('am-login-form').style.display = t==='login'?'block':'none';
  document.getElementById('am-reg-form').style.display = t==='register'?'block':'none';
  document.getElementById('am-forgot-form').style.display = t==='forgot'?'block':'none';
  document.getElementById('am-err').classList.remove('on');
  if (t==='register') loadRegionsInto(['am-reg-region']);
  if (t==='forgot') { document.getElementById('fg-step1').style.display='block'; document.getElementById('fg-step2').style.display='none'; }
}
function requireAuth(cb){ if(window._me){cb&&cb();return true;} showAuthModal(); return false; }

async function doAmLogin(){
  const u=(document.getElementById('am-uname').value||'').trim();
  const p=(document.getElementById('am-pass').value||'').trim();
  const err=document.getElementById('am-err'); err.classList.remove('on');
  if(!u||!p){err.textContent='Login va parolni kiriting';err.classList.add('on');return;}
  const btn=document.getElementById('am-login-btn'); btn.disabled=true;btn.textContent='...';
  try{ const d=await API.login(u,p); tokSave(d.token);Tok.set(d.token);closeAuthModal();await boot(d.user); }
  catch(e){err.textContent=e.message;err.classList.add('on');}
  finally{btn.disabled=false;btn.textContent='Kirish';}
}
async function doAmReg(){
  const name=(document.getElementById('am-reg-name').value||'').trim();
  const username=(document.getElementById('am-reg-user').value||'').trim();
  const email=(document.getElementById('am-reg-email').value||'').trim();
  const password=(document.getElementById('am-reg-pass').value||'').trim();
  const region_id=document.getElementById('am-reg-region').value||null;
  const school_name=(document.getElementById('am-reg-school').value||'').trim();
  const err=document.getElementById('am-err'); err.classList.remove('on');
  if(!name||!username||!email||!password){err.textContent="Barcha majburiy maydonlarni to'ldiring";err.classList.add('on');return;}
  const btn=document.getElementById('am-reg-btn'); btn.disabled=true;btn.textContent='...';
  try{ const d=await API.register({name,username,email,password,region_id,school_name}); tokSave(d.token);Tok.set(d.token);closeAuthModal();await boot(d.user); }
  catch(e){err.textContent=e.message;err.classList.add('on');}
  finally{btn.disabled=false;btn.textContent="Ro'yxatdan o'tish";}
}
async function doSendCode(){
  const uname=(document.getElementById('fg-uname').value||'').trim();
  if(!uname){toast('Username kiriting');return;}
  const btn=document.getElementById('fg-send-btn'); btn.disabled=true;btn.textContent='...';
  try{
    const d=await API.sendCode(uname);
    window._fgUsername=uname;
    document.getElementById('fg-step1').style.display='none';
    document.getElementById('fg-step2').style.display='block';
    toast(d.sent ? `Kod ${d.email} ga yuborildi` : "Email sozlanmagan — kodni server logidan oling (dev rejimi)");
  }catch(e){toast(e.message);}
  finally{btn.disabled=false;btn.textContent='Kod yuborish';}
}
/* ═══ TELEGRAM BILAN KIRISH (Login Widget) ═══
   #tg-login-wrap sukut bo'yicha hidden — bot username sozlanmaguncha shu holicha qoladi.
   Bot ulanganda tegishli joyga telegram-widget.js <script> qo'shilib, hidden olib tashlansa yetarli. */
async function onTelegramAuth(user){
  try{
    const d = await api('POST','/auth/telegram-login', user);
    if (d.needProfile) {
      window._tgTemp = d.tempToken;
      document.getElementById('am-tg-name').value = user.first_name || '';
      document.getElementById('am-tg-user').value = '';
      document.getElementById('am-login-form').style.display = 'none';
      document.getElementById('am-reg-form').style.display = 'none';
      document.getElementById('am-forgot-form').style.display = 'none';
      document.getElementById('am-tg-profile-form').style.display = 'block';
      return;
    }
    tokSave(d.token); Tok.set(d.token); closeAuthModal(); await boot(d.user);
  } catch(e){ toast(e.message || 'Telegram orqali kirishda xatolik'); }
}
async function initTelegramWidget(){
  try {
    const cfg = await API.config();
    if (!cfg.telegramBotName) return;
    const container = document.getElementById('tg-login-container');
    const wrap = document.getElementById('tg-login-wrap');
    if (!container || !wrap || container.childElementCount) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.setAttribute('data-telegram-login', cfg.telegramBotName);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '10');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    s.setAttribute('data-request-access', 'write');
    container.appendChild(s);
    wrap.hidden = false;
  } catch {}
}
async function finishTgReg(){
  const name=(document.getElementById('am-tg-name').value||'').trim();
  const username=(document.getElementById('am-tg-user').value||'').trim();
  const err=document.getElementById('am-tg-err'); err.classList.remove('on');
  if(!name||!username){ err.textContent="Ism va username kiriting"; err.classList.add('on'); return; }
  const btn=document.getElementById('am-tg-btn'); btn.disabled=true; btn.textContent='...';
  try{
    const d = await api('POST','/auth/telegram-finish', { tempToken: window._tgTemp, name, username });
    tokSave(d.token); Tok.set(d.token); closeAuthModal(); await boot(d.user);
  } catch(e){ err.textContent=e.message; err.classList.add('on'); }
  finally{ btn.disabled=false; btn.textContent='Davom etish'; }
}

async function doVerifyAndReset(){
  const code=(document.getElementById('fg-code').value||'').trim();
  const newPass=(document.getElementById('fg-new-pass').value||'').trim();
  if(!code||code.length!==6){toast('6 xonali kod kiriting');return;}
  if(newPass.length<6){toast('Parol kamida 6 belgi');return;}
  const btn=document.getElementById('fg-reset-btn'); btn.disabled=true;btn.textContent='...';
  try{
    const v=await API.verifyCode(window._fgUsername,code);
    await API.resetPass(v.reset_token,newPass);
    toast('Parol yangilandi! Endi kirishingiz mumkin.');
    switchAmTab('login');
  }catch(e){toast(e.message);}
  finally{btn.disabled=false;btn.textContent="Parolni o'rnatish";}
}

/* ═══ TOPBAR ═══ */
function syncTopbar(u){
  const av=document.getElementById('tb-av');
  if(av){av.style.cssText=avStyle(u,30)+'border-radius:50%;';av.innerHTML=avHtml(u,30,11);}
  const nm=document.getElementById('tb-av-name'); if(nm) nm.textContent=u.name||u.username;
  document.getElementById('admin-lsb')?.style.setProperty('display',(u.role==='admin'||u.role==='leader')?'flex':'none');
}

/* ═══ BOOT ═══ */
async function boot(initialUser){
  document.getElementById('auth')?.remove();
  document.getElementById('app').classList.add('vis');
  window._me = initialUser || await API.me();
  syncTopbar(window._me);
  if (window._me?.is_banned) showBanBanner(window._me.ban_reason);
  WS.connect(Tok.get());
  initProblemWS(); initMsgWS(); initCallWS();
  loadCategoryFilters();
  await Promise.allSettled([loadFeed(true), loadNotifCount(), loadConvos()]);
  initScrollFeed();
  initMurojaatScrollFeed();
  await initPushPermissionPrompt();
  const urlParams = new URLSearchParams(location.search);
  const clusterId = urlParams.get('cluster');
  if (clusterId) { history.replaceState({},'',location.pathname); openCluster(clusterId); }
}
function showBanBanner(reason){
  const el=document.getElementById('ban-banner'); const rt=document.getElementById('ban-reason-txt');
  if(!el) return; if(reason && rt) rt.textContent=`Sabab: ${reason}`; el.style.display='block';
  const app=document.getElementById('app'); if(app) app.style.paddingTop='48px';
}
async function initPushPermissionPrompt(){
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
}

/* ═══ MAVZU ═══ */
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('ih_theme',next);
  updateThemeBtn();
}
function updateThemeBtn(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const btn=document.getElementById('theme-btn'); if(btn) btn.innerHTML=isDark?IC.sun:IC.moon;
}

/* ═══ CHIQISH ═══ */
function doLogout(){ tokClear();Tok.clr();WS.disconnect();window._me=null;location.reload(); }

/* ═══ PROFIL ═══ */
async function openUser(param){
  if (!param) return;
  goSec('user');
  const el=document.getElementById('user-cnt'); el.innerHTML=spinner();
  try{
    const u=await API.getUser(param);
    const isMe = u.is_me || u.id===window._me?.id;
    el.innerHTML=`
      <div class="prof-card">
        <div class="av prof-av" style="${avStyle(u,72)}" ${isMe?'onclick="document.getElementById(\'av-inp\').click()" style=\"cursor:pointer\"':''}>${avHtml(u,72,24)}</div>
        <div style="flex:1;min-width:0">
          <div class="prof-name">${esc(u.name)}</div>
          <div class="prof-sub">u/${esc(u.username)} ${u.region_name?' · 📍 '+esc(u.region_name):''} ${u.online?'<span style="color:var(--grn)">● Onlayn</span>':''}</div>
          ${u.bio?`<div style="font-size:13px;color:var(--tx3);margin-top:6px">${esc(u.bio)}</div>`:''}
          <div style="display:flex;gap:8px;margin-top:10px">
            ${isMe
              ? `<button class="btn btn-gold" onclick="goSec('settings');loadSettings()">${IC.cam} Sozlamalar</button><input type="file" accept="image/*" id="av-inp" style="display:none" onchange="uploadAvatar(this)">`
              : `<button class="btn btn-gold" onclick="startChat('${escJs(u.username)}')">${IC.msg} Xabar</button>`}
          </div>
        </div>
      </div>
      <div class="sr-hd">Murojaatlari</div>
      <div id="user-problems-cnt"></div>`;
    const pc=document.getElementById('user-problems-cnt');
    if(!u.problems?.length) pc.innerHTML=emptyEl('inbox',"Hali murojaat yo'q");
    else pc.innerHTML = u.problems.map(p=>`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:13px;margin-bottom:8px;cursor:pointer" onclick="${p.cluster_id?`openCluster('${p.cluster_id}')`:''}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">${p.category_id?catChip(p.category_id):''}<span style="font-size:11px;color:var(--tx4)">${p.ago||''}</span></div>
        <div style="font-weight:700;font-size:13.5px">${esc(p.title)}</div>
      </div>`).join('');
  }catch(e){el.innerHTML=emptyEl('close','Topilmadi',e.message);}
}
async function uploadAvatar(inp){
  if(!inp.files[0]) return;
  try{ const fd=new FormData(); fd.append('image',inp.files[0]); const d=await API.uploadAv(fd); if(d.avatar){window._me.avatar=d.avatar;syncTopbar(window._me);} toast('Rasm yangilandi'); openUser(window._me.id); }
  catch(e){toast(e.message);}
}

/* ═══ SOZLAMALAR ═══ */
async function loadSettings(){
  const el=document.getElementById('settings-cnt'); if(!el) return;
  el.innerHTML=spinner();
  try{
    const u=await API.me();
    el.innerHTML=`
      <div class="set-card">
        <div class="set-title">👤 Profil</div>
        <div class="av-upload">
          <div class="av av-big" onclick="document.getElementById('av-file2').click()">${avHtml(u,68,24)}</div>
          <div><p style="font-size:13px;font-weight:600">Profil rasmi</p><label class="btn btn-ghost" style="margin-top:6px;font-size:12px">${IC.cam} O'zgartirish<input type="file" accept="image/*" id="av-file2" style="display:none" onchange="uploadAvatar(this)"></label></div>
        </div>
        <div class="form-row"><label class="form-lbl">Ism</label><input class="inp" id="st-name" value="${esc(u.name||'')}"></div>
        <div class="form-row"><label class="form-lbl">Bio</label><textarea class="inp" id="st-bio" rows="3">${esc(u.bio||'')}</textarea></div>
        <div class="form-row"><label class="form-lbl">Email</label><input class="inp" id="st-email" type="email" value="${esc(u.email||'')}"></div>
        <button class="btn btn-gold" onclick="saveProfile()">Saqlash</button>
      </div>
      <div class="set-card">
        <div class="set-title">🔒 Parolni o'zgartirish</div>
        <div class="form-row"><input class="inp" id="cp-old" type="password" placeholder="Eski parol"></div>
        <div class="form-row"><input class="inp" id="cp-new" type="password" placeholder="Yangi parol"></div>
        <div class="form-row"><input class="inp" id="cp-conf" type="password" placeholder="Tasdiqlash"></div>
        <button class="btn btn-gold" onclick="doChpass()">O'zgartirish</button>
      </div>
      <div class="set-card">
        <div class="set-title">🌙 Ko'rinish</div>
        <button class="btn btn-ghost" onclick="toggleTheme()">Mavzuni almashtirish</button>
      </div>
      <div class="set-card">
        <div class="set-title">🚪 Chiqish</div>
        <button class="btn btn-danger" onclick="doLogout()">Hisobdan chiqish</button>
      </div>`;
  }catch(e){el.innerHTML=emptyEl('close','Xatolik',e.message);}
}
async function saveProfile(){
  const name=(document.getElementById('st-name')?.value||'').trim();
  const bio=(document.getElementById('st-bio')?.value||'').trim();
  const email=(document.getElementById('st-email')?.value||'').trim();
  if(!name){toast('Ism bo\'sh bo\'lmasin');return;}
  try{ const u=await api('PUT','/me',{name,bio,email}); window._me={...window._me,...u}; syncTopbar(window._me); toast('Saqlandi'); }
  catch(e){toast(e.message);}
}
async function doChpass(){
  const o=document.getElementById('cp-old').value,n=document.getElementById('cp-new').value,c=document.getElementById('cp-conf').value;
  if(!o||!n){toast('Parollarni kiriting');return;}
  if(n.length<6){toast('Yangi parol kamida 6 belgi');return;}
  if(n!==c){toast('Parollar mos emas');return;}
  try{ await API.chpass(o,n); toast("O'zgartirildi"); ['cp-old','cp-new','cp-conf'].forEach(id=>document.getElementById(id).value=''); }
  catch(e){toast(e.message);}
}

/* ═══ BILDIRISHNOMALAR ═══ */
let _nUnread = 0;
function updNotifDot(){
  document.getElementById('notif-dot')?.classList.toggle('on', _nUnread>0);
  const badge = document.getElementById('bn-notif-badge');
  if (badge) { badge.textContent = _nUnread>99?'99+':String(_nUnread); badge.classList.toggle('on', _nUnread>0); }
}
async function loadNotifCount(){ try{ const d=await API.notifCount(); _nUnread=d.count; updNotifDot(); }catch{} }
async function loadNotifs(){
  const el=document.getElementById('notifs-list'); if(!el) return;
  el.innerHTML=spinner();
  try{
    const notifs=await API.notifications();
    if(!notifs.length){el.innerHTML=emptyEl('bell',"Hozircha bildirishnoma yo'q");return;}
    el.innerHTML = notifs.map(n=>`
      <div style="display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;background:${n.is_read?'none':'rgba(200,146,42,.04)'}" onclick="n.cluster_id&&openCluster('${n.cluster_id}')">
        <div class="av" style="${avStyle({color:n.fc},34)};border-radius:9px;flex-shrink:0">${n.fa?`<img src="${esc(n.fa)}" style="width:100%;height:100%;object-fit:cover">`:'🔔'}</div>
        <div style="flex:1"><div style="font-size:13px;color:var(--tx2)">${esc(n.msg)}</div><div style="font-size:11px;color:var(--tx4);margin-top:2px">${n.ago||''}</div></div>
      </div>`).join('');
  }catch(e){el.innerHTML=emptyEl('close','Xatolik',e.message);}
}
async function markNotifs(){ try{ await API.markNotifs(); _nUnread=0; updNotifDot(); }catch{} }

/* ═══ QIDIRUV ═══ */
const debouncedSearch = debounce(q => { if(q.length>1) doSearch(q); }, 400);
function onTopSearch(e){
  const q = (e.target.value||'').trim();
  if (q.length > 1) {
    if (curSec() !== 'search') goSec('search');
    debouncedSearch(q);
  } else {
    const el = document.getElementById('search-res'); if (el) el.innerHTML = '';
  }
}
function openMobileSearch(){
  const mb = document.getElementById('mobile-search-bar');
  if (mb) { mb.classList.add('open'); setTimeout(()=>document.getElementById('mobile-search-inp')?.focus(), 150); }
}
async function doSearch(q){
  const el=document.getElementById('search-res'); if(!el) return;
  el.innerHTML=spinner();
  try{
    const d=await API.search(q,'all');
    el.innerHTML='';
    let has=false;
    if(d.users?.length){ has=true; el.innerHTML+=`<div class="sr-hd">Foydalanuvchilar</div>`; d.users.forEach(u=>{ el.innerHTML+=`<div class="sr-user" onclick="openUser('${escJs(u.username)}')"><div class="av" style="${avStyle(u,40)};border-radius:50%">${avHtml(u,40,14)}</div><div><div class="sr-user-name">${esc(u.name||u.username)}</div><div class="sr-user-sub">u/${esc(u.username)}</div></div></div>`; }); }
    if(d.problems?.length){ has=true; el.innerHTML+=`<div class="sr-hd">Murojaatlar</div>`; d.problems.forEach(p=>{ el.innerHTML+=`<div class="sr-user" onclick="${p.cluster_id?`openCluster('${p.cluster_id}')`:''}"><div style="flex:1"><div class="sr-user-name">${esc(p.title)}</div><div class="sr-user-sub">${p.ago||''}</div></div></div>`; }); }
    if(!has) el.innerHTML=emptyEl('search',`"${q}" bo'yicha hech narsa topilmadi`);
  }catch(e){el.innerHTML=emptyEl('close','Xatolik',e.message);}
}
function setBnActive(id){ document.querySelectorAll('.bn-item[id]').forEach(b=>b.classList.toggle('active',b.id===id)); }

/* ═══ SAQLANGAN POSTLAR ═══ */
async function loadSavedPosts(){
  const el=document.getElementById('saved-cnt'); if(!el) return;
  el.innerHTML=spinner();
  try{
    const posts=await API.savedPosts();
    if(!posts.length){ el.innerHTML=emptyEl('save',"Hali saqlangan post yo'q"); return; }
    el.innerHTML='';
    posts.forEach((p,i)=>{ const d=document.createElement('div'); d.innerHTML=buildPost(p); const c=d.firstElementChild; c.style.animationDelay=(i*.04)+'s'; el.appendChild(c); });
  }catch(e){ el.innerHTML=emptyEl('close','Xatolik',e.message); }
}

/* ═══ INIT ═══ */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('search-res') && (document.getElementById('search-res').innerHTML = `
    <div class="form-row" style="margin-bottom:16px"><input class="inp" id="search-page-inp" placeholder="Qidirish: murojaat, foydalanuvchi..." oninput="debouncedSearch(this.value)"></div>`);
  const savedTheme = localStorage.getItem('ih_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeBtn();
  const tok = tokLoad();
  if (tok) {
    Tok.set(tok);
    try { const user = await API.me(); await boot(user); }
    catch { tokClear(); document.getElementById('auth').style.display='flex'; initTelegramWidget(); }
  } else {
    document.getElementById('auth').style.display = 'flex';
    initTelegramWidget();
  }
});

window.showAuthModal=showAuthModal; window.closeAuthModal=closeAuthModal; window.switchAmTab=switchAmTab; window.requireAuth=requireAuth;
window.doAmLogin=doAmLogin; window.doAmReg=doAmReg; window.doSendCode=doSendCode; window.doVerifyAndReset=doVerifyAndReset;
window.onTelegramAuth=onTelegramAuth; window.finishTgReg=finishTgReg; window.initTelegramWidget=initTelegramWidget;
window.syncTopbar=syncTopbar; window.boot=boot; window.toggleTheme=toggleTheme; window.doLogout=doLogout;
window.openUser=openUser; window.uploadAvatar=uploadAvatar; window.loadSettings=loadSettings; window.saveProfile=saveProfile; window.doChpass=doChpass;
window.loadNotifCount=loadNotifCount; window.loadNotifs=loadNotifs; window.markNotifs=markNotifs;
window.doSearch=doSearch; window.debouncedSearch=debouncedSearch; window.onTopSearch=onTopSearch; window.openMobileSearch=openMobileSearch;
window.setBnActive=setBnActive; window.showBanBanner=showBanBanner; window.loadSavedPosts=loadSavedPosts;
