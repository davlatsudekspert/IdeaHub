'use strict';
/* Jamoalar (communities) — eski ilovadan tiklangan, Workers API'ga moslashtirilgan. */

let _ccColor = '#C8922A';

async function openCommunity(slug) {
  window._curCom = slug; _curCom = slug;
  goSec('community');
  const hd = document.getElementById('com-hd-area');
  const fd = document.getElementById('com-feed-cnt');
  if (hd) hd.innerHTML = spinner();
  if (fd) fd.innerHTML = spinner();
  try {
    const [com, posts] = await Promise.all([API.getCom(slug), API.comPosts(slug,'hot',0)]);
    const letter = (com.name||com.slug||'?')[0].toUpperCase();
    const color  = com.color || '#C8922A';
    const bannerStyle = com.banner ? `url(${esc(com.banner)}) center/cover` : `linear-gradient(135deg,${color}44,${color}22)`;
    if (hd) hd.innerHTML = `
      <div class="com-page-hd">
        <div class="com-banner" style="background:${bannerStyle}"></div>
        <div class="com-hd-row">
          ${com.avatar
            ? `<img src="${esc(com.avatar)}" style="width:50px;height:50px;border-radius:50%;border:3px solid var(--surface);margin-top:-25px;object-fit:cover;flex-shrink:0" alt="">`
            : `<div class="com-hd-icon" style="background:${color}22;border:2px solid ${color}44;color:${color}">${letter}</div>`}
          <div style="flex:1">
            <div class="com-hd-name">${esc(com.name)} ${com.is_private?'<span style="font-size:11px;background:rgba(232,112,58,.12);color:#E8703A;padding:2px 8px;border-radius:10px;margin-left:6px;font-weight:600">🔒 Maxfiy</span>':''}</div>
            <div class="com-hd-sub">${esc(com.slug)} &middot; ${fmtNum(com.members)} a'zo &middot; 👁 ${fmtNum(com.views||0)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-left:auto">
            ${com.is_owner ? `<button class="btn btn-ghost" style="padding:7px 13px;font-size:12px" onclick="editCom('${escJs(com.slug)}')">⚙ Sozlash</button>
              <button class="btn btn-danger" style="padding:7px 13px;font-size:12px" onclick="openDeleteCom('${escJs(com.slug)}','${escJs(com.name)}')">🗑️ O'chirish</button>` : ''}
            ${com.is_owner ? `<button class="btn btn-ghost" style="padding:7px 13px;font-size:12px" onclick="openComAdmins('${escJs(com.slug)}')">👥 Boshqarish</button>` : ''}
            ${com.is_member ? `<button class="btn btn-outline" id="jb-${esc(com.id)}" onclick="toggleJoin('${escJs(com.slug)}','${escJs(com.id)}',this)">${IC.check} A'zo</button>`
              : com.pending_request ? `<button class="btn btn-ghost" disabled style="padding:7px 13px;font-size:12px">⏳ Kutilmoqda</button>`
              : com.is_private ? `<button class="btn btn-gold" onclick="toggleJoin('${escJs(com.slug)}','${escJs(com.id)}',this)">📩 So'rov yuborish</button>`
              : `<button class="btn btn-gold" id="jb-${esc(com.id)}" onclick="toggleJoin('${escJs(com.slug)}','${escJs(com.id)}',this)">${IC.plus} Qo'shilish</button>`}
          </div>
        </div>
        ${com.description ? `<div style="padding:0 18px 14px;font-size:13px;color:var(--tx3)">${esc(com.description)}</div>` : ''}
        ${com.admins?.length ? `<div style="padding:0 18px 10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--tx4)">
          <span>👑 Adminlar:</span>
          ${com.admins.map(a=>`<span style="color:var(--gold);cursor:pointer" onclick="openUser('${escJs(a.username)}')">@${esc(a.username)}</span>`).join(', ')}
        </div>` : ''}
      </div>`;
    if (fd) {
      fd.innerHTML = '';
      _comOff = 0;
      document.querySelectorAll('#com-sort-bar .sort-btn').forEach(b=>b.classList.toggle('active',b.dataset.sort==='hot'));
      posts.forEach((p,i) => {
        const d=document.createElement('div'); d.innerHTML=buildPost(p);
        const c=d.firstElementChild; c.style.animationDelay=(i*.04)+'s'; fd.appendChild(c);
      });
      if (!posts.length) fd.innerHTML = emptyEl('save',"Hali postlar yo'q","Bu jamoada birinchi post siz bo'ling!");
    }
    buildComRsb(com);
  } catch(e) { if(hd) hd.innerHTML = emptyEl('close','Topilmadi',e.message); }
}

async function toggleJoin(slug, comId, btn) {
  if (!requireAuth()) return;
  try {
    const d = await API.joinCom(slug);
    if (btn) { btn.className=`btn ${d.joined?'btn-outline':'btn-gold'}`; btn.innerHTML=d.joined?`${IC.check} A'zo`:`${IC.plus} Qo'shilish`; }
    toast(d.joined?"Jamoaga qo'shildingiz":'Jamoadan chiqdingiz');
    loadMyComs();
  } catch(e) { toast(e.message); }
}

async function loadMyComs() {
  const el = document.getElementById('my-coms'); if(!el) return;
  if (!window._me) { el.innerHTML = ''; return; }
  try {
    const coms = await API.mineComs();
    el.innerHTML = '';
    const myComs = coms.filter(c => c.is_member !== false).slice(0,10);
    if (!myComs.length) {
      el.innerHTML = `<div style="padding:8px 13px;font-size:12px;color:var(--tx4)">Hali jamoaga qo'shilmadingiz</div>`;
      return;
    }
    myComs.forEach(c => {
      const b = document.createElement('button');
      b.className='com-lsb'; b.onclick=()=>openCommunity(c.slug);
      b.innerHTML = c.avatar
        ? `<img src="${esc(c.avatar)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="">${esc(c.name||c.slug)}`
        : `<span class="com-lsb-dot" style="background:${esc(c.color||'#C8922A')}"></span>${esc(c.name||c.slug)}`;
      el.appendChild(b);
    });
  } catch {}
}

async function loadTopComs() {
  try {
    const coms = await API.popularComs();
    const el = document.getElementById('popular-cnt'); if(!el) return;
    el.innerHTML = '';
    if (!coms.length) { el.innerHTML = emptyEl('people',"Hali jamoalar yo'q"); return; }
    coms.slice(0,20).forEach((c,i) => {
      const color = c.color||'#C8922A';
      const letter = (c.name||c.slug||'?')[0].toUpperCase();
      const d = document.createElement('div');
      d.className='com-pop-card'; d.style.animationDelay=(i*.04)+'s';
      d.innerHTML = `
        <div class="com-pop-inner" onclick="openCommunity('${escJs(c.slug)}')">
          <div class="com-pop-rank">${i+1}</div>
          ${c.avatar
            ? `<img src="${esc(c.avatar)}" style="width:42px;height:42px;border-radius:12px;object-fit:cover;border:2px solid ${color}40;flex-shrink:0" alt="">`
            : `<div class="com-pop-icon" style="background:${color}18;border:2px solid ${color}40;color:${color}">${letter}</div>`}
          <div class="com-pop-info">
            <div class="com-pop-name">${esc(c.name||c.slug)} ${c.is_private?'🔒':''}</div>
            <div class="com-pop-sub">${esc(c.slug)} &middot; ${fmtNum(c.members)} a'zo &middot; 👁 ${fmtNum(c.views||0)}</div>
            ${c.description?`<div class="com-pop-desc">${esc(c.description)}</div>`:''}
          </div>
          <button class="com-pop-join${c.is_member?' joined':''}"
            onclick="event.stopPropagation();toggleJoin('${escJs(c.slug)}','${escJs(c.id)}',this)">
            ${c.is_member?"A'zo":"Qo'shilish"}
          </button>
        </div>`;
      el.appendChild(d);
    });
  } catch(e) { console.error(e); }
}

function buildComRsb(com) {
  const el = document.getElementById('rsb-inner'); if(!el) return;
  el.querySelector('.rsb-com-card')?.remove();
  const div = document.createElement('div');
  div.className='rsb-card rsb-com-card';
  const color = com.color||'#C8922A';
  const bannerStyle = com.banner ? `url(${esc(com.banner)}) center/cover` : `linear-gradient(135deg,${color}44,${color}11)`;
  div.innerHTML = `
    <div class="rsb-banner" style="background:${bannerStyle}"></div>
    <div class="rsb-body">
      <div class="rsb-title">${esc(com.name)} ${com.is_private?'🔒':''}</div>
      <div class="rsb-desc">${esc(com.description||'')}</div>
      <div class="rsb-stat"><span>A'zolar</span><strong>${fmtNum(com.members)}</strong></div>
      <div class="rsb-stat"><span>Ko'rishlar</span><strong>${fmtNum(com.views||0)}</strong></div>
      <button class="btn btn-gold" style="width:100%;margin-top:10px" onclick="requireAuth(()=>openSubmit('${escJs(com.slug)}'))">Post qo'shish</button>
    </div>`;
  el.prepend(div);
}

/* ── Jamoa boshqaruvi (admin/so'rovlar) ── */
async function openComAdmins(slug) {
  if (!requireAuth()) return;
  try {
    const com = await API.getCom(slug);
    if (!com) return;
    const ov = document.getElementById('com-admin-overlay');
    if (!ov) return;
    const adminsEl = document.getElementById('com-admins-list');
    const reqsEl = document.getElementById('com-requests-list');
    const privateBtn = document.getElementById('com-private-toggle');
    const adminInput = document.getElementById('com-admin-username')?.parentElement;

    if (privateBtn) {
      privateBtn.innerHTML = com.is_private ? "Ommaviyga o'zgartirish" : "Maxfiyga o'zgartirish";
      privateBtn.onclick = () => toggleComPrivate(slug, !com.is_private);
      privateBtn.style.display = com.is_owner ? '' : 'none';
    }
    if (adminInput) adminInput.style.display = com.is_owner ? '' : 'none';

    if (adminsEl) {
      adminsEl.innerHTML = '';
      if (com.admins?.length) {
        com.admins.forEach(a => {
          adminsEl.innerHTML += `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <div class="av" style="${avStyle(a,32)};border-radius:50%;flex-shrink:0">${avHtml(a,32,11)}</div>
              <div style="flex:1"><div style="font-size:13px;font-weight:600">${esc(a.name||a.username)}</div><div style="font-size:11px;color:var(--tx4)">u/${esc(a.username)}</div></div>
              ${com.is_owner ? `<button class="btn btn-danger" style="font-size:11px;padding:4px 10px" onclick="removeComAdmin('${slug}','${a.user_id}')">Olib tashlash</button>` : ''}
            </div>`;
        });
      } else {
        adminsEl.innerHTML = '<div style="color:var(--tx4);font-size:13px;padding:8px 0">Adminlar yo\'q</div>';
      }
    }
    if (reqsEl) {
      reqsEl.innerHTML = '';
      if (com.pending_requests?.length) {
        com.pending_requests.forEach(r => {
          reqsEl.innerHTML += `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <div class="av" style="${avStyle(r,32)};border-radius:50%;flex-shrink:0">${avHtml(r,32,11)}</div>
              <div style="flex:1"><div style="font-size:13px;font-weight:600">${esc(r.name||r.username)}</div><div style="font-size:11px;color:var(--tx4)">u/${esc(r.username)} · ${r.ago || ''}</div></div>
              <button class="btn btn-gold" style="font-size:11px;padding:4px 10px" onclick="handleComRequest('${slug}','${r.id}','approve')">✅</button>
              <button class="btn btn-danger" style="font-size:11px;padding:4px 10px" onclick="handleComRequest('${slug}','${r.id}','reject')">❌</button>
            </div>`;
        });
      } else {
        reqsEl.innerHTML = '<div style="color:var(--tx4);font-size:13px;padding:8px 0">Kutilgan so\'rovlar yo\'q</div>';
      }
    }
    ov.classList.add('open');
  } catch(e) { toast(e.message); }
}

async function addComAdmin(slug) {
  const inp = document.getElementById('com-admin-username');
  const username = (inp?.value || '').trim();
  if (!username) { toast('Username kiriting'); return; }
  try {
    const user = await API.getUser(username);
    if (!user || !user.id) { toast('Foydalanuvchi topilmadi'); return; }
    await API.comAdminAdd(slug, user.id);
    inp.value = '';
    toast("Admin qo'shildi!");
    openComAdmins(slug);
  } catch(e) { toast(e.message || 'Xatolik'); }
}

async function removeComAdmin(slug, userId) {
  if (!confirm('Adminni olib tashlamoqchimisiz?')) return;
  try {
    await API.comAdminDel(slug, userId);
    toast('Admin olib tashlandi');
    openComAdmins(slug);
  } catch(e) { toast(e.message); }
}

async function toggleComPrivate(slug, isPrivate) {
  try {
    await API.updateCom(slug, { is_private: isPrivate });
    toast(isPrivate ? 'Jamoa maxfiy qilindi' : 'Jamoa ommaviy qilindi');
    openComAdmins(slug);
    openCommunity(slug);
  } catch(e) { toast(e.message); }
}

async function handleComRequest(slug, reqId, action) {
  try {
    await API.comRequest(slug, reqId, action);
    toast(action === 'approve' ? 'So\'rov qabul qilindi' : 'So\'rov rad etildi');
    openComAdmins(slug);
    if (action === 'approve') openCommunity(slug);
  } catch(e) { toast(e.message); }
}

/* ── Jamoani tahrirlash ── */
async function editCom(slug) {
  try {
    const com = await API.getCom(slug);
    const ov = document.getElementById('ec-overlay'); if(!ov) return;
    document.getElementById('ec-slug').value = com.slug;
    document.getElementById('ec-name').value = com.name||'';
    document.getElementById('ec-desc').value = com.description||'';
    document.getElementById('ec-rules').value = com.rules||'';
    const cur = com.color || '#C8922A';
    document.getElementById('ec-color').value = cur;
    markColorOpt('#ec-overlay', cur);
    if (com.banner) { const img=document.getElementById('ec-banner-preview'); if(img){img.src=com.banner;img.style.display='block';} }
    if (com.avatar) { const img=document.getElementById('ec-avatar-preview'); if(img){img.src=com.avatar;img.style.display='block';} }
    ov.classList.add('open');
  } catch(e) { toast(e.message); }
}

async function doEditCom() {
  const slug  = document.getElementById('ec-slug')?.value;
  const name  = (document.getElementById('ec-name')?.value||'').trim();
  const desc  = (document.getElementById('ec-desc')?.value||'').trim();
  const rules = (document.getElementById('ec-rules')?.value||'').trim();
  const color = document.getElementById('ec-color')?.value||'#C8922A';
  const bannerFile = document.getElementById('ec-banner-file')?.files?.[0];
  const avatarFile = document.getElementById('ec-avatar-file')?.files?.[0];
  const btn = document.getElementById('ec-save-btn');
  if (btn) { btn.disabled=true; btn.textContent='Saqlanmoqda...'; }
  try {
    const fd = new FormData();
    fd.append('name',name); fd.append('description',desc);
    fd.append('rules',rules); fd.append('color',color);
    if (bannerFile) fd.append('banner',bannerFile);
    if (avatarFile) fd.append('avatar',avatarFile);
    await API.updateCom(slug,fd,true);
    document.getElementById('ec-overlay')?.classList.remove('open');
    toast('Jamoa yangilandi!');
    openCommunity(slug);
  } catch(e) { toast(e.message); }
  finally { if(btn){btn.disabled=false;btn.textContent='Saqlash';} }
}

/* ── Yangi jamoa yaratish ── */
function openCreateCom(){ resetCreateComForm(); document.getElementById('cc-overlay').classList.add('open'); }
function resetCreateComForm(){
  _ccColor='#C8922A';
  ['nc-slug','nc-name','nc-desc'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['cc-banner-file','cc-avatar-file'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['cc-banner-preview','cc-avatar-preview'].forEach(id=>{const el=document.getElementById(id);if(el){el.src='';el.style.display='none';}});
  ['cc-banner-placeholder','cc-avatar-placeholder'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='';});
  const cc=document.getElementById('cc-color'); if(cc) cc.value='#C8922A';
  const pub=document.querySelector('input[name="cc-priv"][value="0"]'); if(pub) pub.checked=true;
}
function closeCreateCom(){ document.getElementById('cc-overlay').classList.remove('open'); }

function markColorOpt(scope, color) {
  document.querySelectorAll(scope + ' .color-opt').forEach(b => {
    const on = b.dataset.color === color;
    b.style.transform = on ? 'scale(1.15)' : 'scale(1)';
    b.style.border    = on ? '3px solid #fff' : '3px solid transparent';
    b.style.boxShadow = on ? '0 0 0 2px ' + color : 'none';
    b.classList.toggle('active', on);
  });
}
function selectCCColor(color) { _ccColor = color; const inp = document.getElementById('cc-color'); if (inp) inp.value = color; markColorOpt('#cc-overlay', color); }
function selectECColor(color) { const inp = document.getElementById('ec-color'); if (inp) inp.value = color; markColorOpt('#ec-overlay', color); }

function previewImgInto(inp, imgId, phId, maxMb) {
  const f = inp.files?.[0]; if (!f) return;
  if (maxMb && f.size > maxMb * 1024 * 1024) { toast(`Rasm ${maxMb}MB dan oshmasin`); inp.value = ''; return; }
  const img = document.getElementById(imgId);
  const ph  = phId && document.getElementById(phId);
  if (img) { img.src = URL.createObjectURL(f); img.style.display = 'block'; }
  if (ph)  ph.style.display = 'none';
}
function previewCCBanner(inp){ previewImgInto(inp, 'cc-banner-preview', 'cc-banner-placeholder', 5); }
function previewCCAvatar(inp){ previewImgInto(inp, 'cc-avatar-preview', 'cc-avatar-placeholder', 5); }
function previewECBanner(inp){ previewImgInto(inp, 'ec-banner-preview', null, 5); }
function previewECAvatar(inp){ previewImgInto(inp, 'ec-avatar-preview', null, 5); }

async function doCreateCom(){
  const slug=(document.getElementById('nc-slug')?.value||'').trim().toLowerCase().replace(/\s+/g,'-');
  const name=(document.getElementById('nc-name')?.value||'').trim();
  const desc=(document.getElementById('nc-desc')?.value||'').trim();
  if(!slug){toast('Slug kerak');return;}
  if(!name){toast('Nom kerak');return;}
  const isPrivate=document.querySelector('input[name="cc-priv"]:checked')?.value==='1';
  const btn=document.getElementById('cc-create-btn');
  if(btn){btn.disabled=true;btn.textContent='Yaratilmoqda...';}
  try {
    const com = await API.createCom(slug,name,desc,_ccColor,isPrivate?1:0);
    const bannerFile=document.getElementById('cc-banner-file')?.files?.[0];
    const avatarFile=document.getElementById('cc-avatar-file')?.files?.[0];
    if (com?.slug && (bannerFile || avatarFile)) {
      try {
        const fd = new FormData();
        fd.append('name', name); fd.append('description', desc); fd.append('color', _ccColor);
        if (bannerFile) fd.append('banner', bannerFile);
        if (avatarFile) fd.append('avatar', avatarFile);
        await API.updateCom(com.slug, fd, true);
      } catch(e) { toast('Rasm yuklanmadi: ' + (e.message||'')); }
    }
    closeCreateCom(); resetCreateComForm(); toast('Jamoa yaratildi!'); openCommunity(com?.slug||slug); loadMyComs();
  } catch(e){ toast(e.message); }
  finally{ if(btn){btn.disabled=false;btn.textContent='Yaratish';} }
}

/* ── Jamoani o'chirish ── */
let _delComSlug = null;
function openDeleteCom(slug, name) {
  _delComSlug = slug;
  const modal = document.getElementById('com-delete-modal');
  const label = document.getElementById('com-del-slug-label');
  const inp   = document.getElementById('com-del-confirm-inp');
  if (!modal) return;
  if (label) label.textContent = name || slug;
  if (inp)   inp.value = '';
  modal.classList.add('open');
  setTimeout(()=>inp?.focus(), 150);
}
async function doDeleteCom() {
  const slug = _delComSlug; if (!slug) return;
  const inp  = document.getElementById('com-del-confirm-inp');
  const label = document.getElementById('com-del-slug-label')?.textContent || '';
  const val  = (inp?.value||'').trim();
  if (val !== label && val !== slug) { toast('Jamoa nomini to\'g\'ri kiriting'); return; }
  try {
    await API.delCom(slug);
    document.getElementById('com-delete-modal').classList.remove('open');
    toast('Jamoa o\'chirildi');
    _delComSlug = null;
    goSec('home');
    loadFeed(true);
    loadMyComs();
  } catch(e) { toast(e.message || 'Xatolik yuz berdi'); }
}

function setComSort(sort){
  const slug=window._curCom;if(!slug)return;
  _comSort=sort;
  document.querySelectorAll('#com-sort-bar .sort-btn').forEach(b=>b.classList.toggle('active',b.dataset.sort===sort));
  loadComFeed(slug,sort,true);
}

window.openCommunity=openCommunity; window.toggleJoin=toggleJoin; window.loadMyComs=loadMyComs; window.loadTopComs=loadTopComs;
window.buildComRsb=buildComRsb; window.setComSort=setComSort;
window.openComAdmins=openComAdmins; window.addComAdmin=addComAdmin; window.removeComAdmin=removeComAdmin; window.toggleComPrivate=toggleComPrivate; window.handleComRequest=handleComRequest;
window.editCom=editCom; window.doEditCom=doEditCom;
window.openCreateCom=openCreateCom; window.resetCreateComForm=resetCreateComForm; window.closeCreateCom=closeCreateCom;
window.markColorOpt=markColorOpt; window.selectCCColor=selectCCColor; window.selectECColor=selectECColor;
window.previewCCBanner=previewCCBanner; window.previewCCAvatar=previewCCAvatar; window.previewECBanner=previewECBanner; window.previewECAvatar=previewECAvatar;
window.doCreateCom=doCreateCom; window.openDeleteCom=openDeleteCom; window.doDeleteCom=doDeleteCom;
