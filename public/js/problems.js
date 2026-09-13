'use strict';
let _murojaatSort = 'hot', _feedOffset = 0, _murojaatBusy = false, _feedCategory = null;
let _murojaatRegion = null, _murojaatStatus = null;
let _regionsCache = null;
let _curClusterId = null, _curClusterTab = 'problems';

/* ═══ HUDUD/MAKTAB TANLAGICHLARI ═══ */
async function loadRegionsInto(selectIds) {
  if (!_regionsCache) { try { _regionsCache = await API.regions(); } catch { _regionsCache = []; } }
  selectIds.forEach(id => {
    const sel = document.getElementById(id); if (!sel) return;
    if (sel.dataset.filled) return;
    sel.dataset.filled = '1';
    _regionsCache.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; sel.appendChild(o); });
  });
}

function loadCategoryFilters() {
  const el = document.getElementById('category-filters'); if (!el) return;
  el.innerHTML = `<button class="filter-chip${!_feedCategory?' active':''}" style="${!_feedCategory?'background:var(--tx1);border-color:var(--tx1)':''}" onclick="setFeedCategory(null)">Barchasi</button>` +
    CATEGORIES.map(c => `<button class="filter-chip${_feedCategory===c.id?' active':''}" style="${_feedCategory===c.id?`background:${c.color};border-color:${c.color}`:''};color:${_feedCategory===c.id?'#fff':c.color}" onclick="setFeedCategory('${c.id}')">${c.icon} ${esc(c.name)}</button>`).join('');
}
function setFeedCategory(catId) { _feedCategory = catId; loadCategoryFilters(); loadClusters(true); }
/* Footer "Yo'nalishlar" ustuni — CATEGORIES massividan dinamik chiqariladi
   (REDESIGN 3.0, Task #56). Ilgari bu yerda qattiq yozilgan 4 ta nom bor edi
   va toifalar 8'dan 13'ga kengaytirilganda eskirib qolgan edi — endi manba
   bitta joyda (core.js'dagi CATEGORIES), footer hech qachon undan orqada
   qolmaydi. */
function initFooterCategories() {
  const el = document.getElementById('sf-yonalishlar-links'); if (!el) return;
  const top = CATEGORIES.filter(c => c.id !== 'boshqa').slice(0, 4);
  el.innerHTML = top.map(c => `<a onclick="goSec('murojaat');setFeedCategory('${c.id}')">${esc(c.name)}</a>`).join('');
}
/* Bosh sahifadan (boshqa bo'lim) murojaatlar ro'yxatiga toifa bilan o'tish —
   endi alohida sahifalar (REDESIGN 2.1), shu sabab scrollIntoView o'rniga
   to'g'ridan-to'g'ri navigatsiya qilinadi (goSec sahifa boshiga aylantiradi). */
function goMurojaatlar(catId) { goSec('murojaat'); setFeedCategory(catId); }

/* ═══ FILTR PANELI — hudud + holat (REDESIGN.md §3.3) ═══
   Toifa filtri #category-filters'da (lenta ustida) allaqachon bor — bu yerda
   takrorlanmaydi, faqat u yerda yo'q ikki o'lcham qo'shiladi. */
/* STATUS_LABEL (core.js) dan olinadi — 2 joyda alohida ro'yxat yuritilsa, ular
   vaqt o'tib bir-biridan farqlanib qolishi mumkin (4-status "yechim taklif
   qilindi" shu sababdan filtrsiz qolib ketgan edi, endi tuzatildi). */
const MUROJAAT_STATUS_ICON = { open:'🟡', solution_proposed:'💡', resolved:'✅', closed:'⚪' };
function renderMurojaatStatusFilter() {
  const el = document.getElementById('rsb-status-list'); if (!el) return;
  const statuses = [{ id: null, label: 'Barchasi' }, ...Object.keys(STATUS_LABEL).map(k => ({ id: k, label: `${MUROJAAT_STATUS_ICON[k]||''} ${STATUS_LABEL[k]}` }))];
  el.innerHTML = statuses.map(s => {
    const active = _murojaatStatus === s.id;
    return `<button class="filter-chip${active?' active':''}" style="${active?'background:var(--tx1);border-color:var(--tx1)':''}" onclick="setMurojaatStatus(${s.id ? `'${s.id}'` : 'null'})">${s.label}</button>`;
  }).join('');
  syncFilterClearBtn();
}
function syncFilterClearBtn() {
  const btn = document.getElementById('rsb-clear-btn'); if (!btn) return;
  btn.hidden = !(_murojaatRegion || _murojaatStatus);
}
function setMurojaatRegion(regionId) { _murojaatRegion = regionId || null; syncFilterClearBtn(); loadClusters(true); }
function setMurojaatStatus(status) { _murojaatStatus = status; renderMurojaatStatusFilter(); loadClusters(true); }
function clearMurojaatFilters() {
  _murojaatRegion = null; _murojaatStatus = null;
  const sel = document.getElementById('rsb-region-sel'); if (sel) sel.value = '';
  renderMurojaatStatusFilter();
  loadClusters(true);
}
function initFilterRail() { loadRegionsInto(['rsb-region-sel']); renderMurojaatStatusFilter(); }
/* "Hal qilinganlar" — top-nav/tortmadagi to'g'ridan-to'g'ri havola (Task #55).
   Alohida sahifa emas, Murojaatlar ro'yxatining "hal qilingan" holatiga
   filtrlangan, boshqa filtrlar tozalangan holda ochilishi — har safar bosilganda
   bashorat qilinadigan, "hammasi hal qilingan" ko'rinishini beradi. */
function goResolved() {
  goSec('murojaat');
  _feedCategory = null; _murojaatRegion = null; _murojaatStatus = 'resolved';
  const sel = document.getElementById('rsb-region-sel'); if (sel) sel.value = '';
  loadCategoryFilters();
  renderMurojaatStatusFilter();
  loadClusters(true);
}

/* ═══ BOSH SAHIFA — hero/statistika/Yo'nalishlar/hududlar (REDESIGN.md §3.2) ═══
   Bittasi ishlamasa ham qolganlari ko'rinishi uchun har biri alohida try/catch'da. */
const YONALISH_DESC = {
  'talim': "Maktab, kolej infratuzilmasi",
  'oliy-talim': "Qabul, kontrakt, grant, talabalar turar joyi",
  'ish-kasb': "Birinchi ish o'rni, amaliyot",
  'yol-xavfsizligi': "Transport jadvali/chegirmasi, yo'l holati",
  'xavfsizlik': "Bulling, kiberfiribgarlik, maktab atrofi",
  'ekologiya': "Chiqindi, ifloslanish, ko'kalamzorlashtirish",
  'ijtimoiy': "Nafaqalar, imkoniyati cheklangan yoshlar",
  'sport': "Sport maydonchasi, dam olish maskanlari",
  'sogliq': "Shifoxona, poliklinika, ruhiy salomatlik",
  'raqamlashtirish': "Davlat portallari, internet sifati",
  'uy-joy': "Suv, issiqlik, lift, ipoteka",
  'tadbirkorlik': "Startap kreditlari, biznes ro'yxatga olish",
  'boshqa': "Yuqoridagilarga mos kelmaydigan murojaatlar",
};
/* Platforma haqida sahifasidagi jonli statistika — bosh sahifadagi bilan bir
   xil ochiq /api endpoint, faqat boshqa elementlarga yoziladi (REDESIGN 3.0). */
async function initAboutStats() {
  try {
    const s = await API.publicStats();
    document.getElementById('about-stat-total').textContent = fmtNum(s.total_problems);
    document.getElementById('about-stat-resolved').textContent = s.resolved_pct + '%';
    document.getElementById('about-stat-solutions').textContent = fmtNum(s.solutions);
    document.getElementById('about-stat-places').textContent = fmtNum(s.places);
  } catch {}
}
async function initHomepageExtras() {
  try {
    const s = await API.publicStats();
    document.getElementById('stat-total').textContent = fmtNum(s.total_problems);
    document.getElementById('stat-resolved').textContent = s.resolved_pct + '%';
    document.getElementById('stat-solutions').textContent = fmtNum(s.solutions);
    document.getElementById('stat-places').textContent = fmtNum(s.places);
  } catch {}

  const chipsEl = document.getElementById('hero-chips');
  if (chipsEl) chipsEl.innerHTML = CATEGORIES.filter(c=>c.id!=='boshqa').slice(0,5)
    .map(c=>`<span class="hc-item" onclick="goMurojaatlar('${c.id}')">${c.icon} ${esc(c.name)}</span>`).join('');

  try {
    const cats = await API.publicCategories();
    const byId = {}; cats.forEach(c => byId[c.id] = c.cnt);
    const grid = document.getElementById('yonalish-grid');
    if (grid) grid.innerHTML = CATEGORIES.map(c => {
      const cnt = byId[c.id] || 0;
      return `<div class="yonalish-card" onclick="goMurojaatlar('${c.id}')">
        <span class="yonalish-count${cnt?' has-items':''}">${fmtNum(cnt)}</span>
        <div class="yonalish-ico">${c.icon}</div>
        <div class="yonalish-name">${esc(c.name)}</div>
        <div class="yonalish-desc">${esc(YONALISH_DESC[c.id]||'')}</div>
      </div>`;
    }).join('');
  } catch {}

  try {
    const [newRows, hotRows] = await Promise.all([API.clusters('new',0,{}), API.clusters('hot',0,{})]);
    const render = rows => rows.slice(0,5).map(c=>`<div class="tc-row" onclick="openCluster('${c.id}')"><span class="tc-title">${esc(c.title)}</span><span class="tc-meta">👍 ${fmtNum(c.support_count)}</span></div>`).join('') || `<div style="padding:10px;color:var(--tx4);font-size:12px">Hali murojaat yo'q</div>`;
    const newEl = document.getElementById('two-col-new'); if (newEl) newEl.innerHTML = render(newRows);
    const hotEl = document.getElementById('two-col-hot'); if (hotEl) hotEl.innerHTML = render(hotRows);
  } catch {}

  try {
    const regions = await API.publicRegions();
    const max = Math.max(...regions.map(r=>r.cluster_count||0), 1);
    const el = document.getElementById('region-block');
    if (el) {
      const sorted = [...regions].sort((a,b)=>b.cluster_count-a.cluster_count);
      el.innerHTML = sorted.map(r => `<div class="region-row"><span class="rg-name">${esc(r.name)}</span><div class="rg-track"><div class="rg-fill" style="width:${Math.round((r.cluster_count/max)*100)}%"></div></div><span class="rg-count">${fmtNum(r.cluster_count)}</span></div>`).join('');
    }
  } catch {}
}

/* ═══ KLASTER KARTASI ═══ */
function buildClusterCard(c) {
  const place = [c.region_name, c.school_name].filter(Boolean).join(' · ');
  return `
<div class="cluster-card" onclick="openCluster('${c.id}')">
  <div class="cl-meta">
    ${catChip(c.category_id)}
    <span class="cl-status ${c.status}">${STATUS_LABEL[c.status]||c.status}</span>
    ${place ? `<span class="cl-place">📍 ${esc(place)}</span>` : ''}
  </div>
  <div class="cl-title">${esc(c.title)}</div>
  ${c.summary ? `<div class="cl-summary">${esc(c.summary)}</div>` : ''}
  <div class="cl-acts" onclick="event.stopPropagation()">
    <button class="support-btn${c.is_supported?' on':''}" id="sp-${c.id}" onclick="toggleSupport('${c.id}',this)">👍 ${c.is_supported?'Qo\'lladingiz':'Menda ham bor'} <span class="sp-count">${fmtNum(c.support_count)}</span></button>
    <span class="cl-stat">📋 ${fmtNum(c.problem_count)} murojaat</span>
    <span class="cl-stat" style="margin-left:auto">${c.ago||''}</span>
  </div>
</div>`;
}

/* ═══ LENTA ═══ */
async function loadClusters(reset=true) {
  if (_murojaatBusy && !reset) return;
  _murojaatBusy = true;
  const cnt = document.getElementById('murojaat-feed-cnt'); if (!cnt) { _murojaatBusy=false; return; }
  if (reset) { _feedOffset = 0; cnt.innerHTML = spinner(); }
  try {
    const rows = await API.clusters(_murojaatSort, _feedOffset, { category: _feedCategory, region: _murojaatRegion, status: _murojaatStatus });
    if (reset) cnt.innerHTML = '';
    if (!rows.length && reset) {
      const filtered = _feedCategory || _murojaatRegion || _murojaatStatus;
      cnt.innerHTML = filtered
        ? emptyEl('search', "Bu filtrlarga mos murojaat topilmadi", "Boshqa hudud yoki holatni tanlab ko'ring.")
        : emptyEl('lightbulb', "Hali murojaat yo'q", "Birinchi murojaatni siz yuboring!");
      _murojaatBusy=false; return;
    }
    rows.forEach((c,i) => { const d=document.createElement('div'); d.innerHTML=buildClusterCard(c); const el=d.firstElementChild; el.style.animation=`fadeUp .3s ease ${i*.03}s both`; cnt.appendChild(el); });
    _feedOffset += rows.length;
  } catch(e) { if (reset) cnt.innerHTML = emptyEl('close','Xatolik',e.message); }
  finally { _murojaatBusy = false; }
}
function setMurojaatSort(sort) {
  _murojaatSort = sort;
  document.querySelectorAll('#sec-murojaat .sort-btn').forEach(b=>b.classList.toggle('active', b.dataset.sort===sort));
  loadClusters(true);
}
function initMurojaatScrollFeed() {
  const obs = new IntersectionObserver(entries => {
    if (!entries.some(e=>e.isIntersecting) || _murojaatBusy) return;
    if (curSec() === 'murojaat') loadClusters(false);
  }, { rootMargin: '200px' });
  const t = document.getElementById('murojaat-scroll-trigger'); if (t) obs.observe(t);
}

/* ═══ KLASTER TAFSILOTI ═══ */
async function openCluster(id) {
  _curClusterId = id; _curClusterTab = 'problems';
  goSec('cluster');
  const path = '/murojaat/'+id;
  if (location.pathname !== path) history.replaceState({ sec:'cluster', id }, '', path);
  const cnt = document.getElementById('cluster-detail-cnt');
  cnt.innerHTML = spinner();
  try {
    const c = await API.getCluster(id);
    renderClusterDetail(c);
  } catch(e) { cnt.innerHTML = emptyEl('close','Topilmadi',e.message); }
}

function renderClusterDetail(c) {
  const cnt = document.getElementById('cluster-detail-cnt');
  const place = [c.region_name, c.school_name].filter(Boolean).join(' · ');
  const isAdmin = window._me?.role === 'admin' || window._me?.role === 'leader';
  // Joylashuv — birlashtirilgan murojaatlar orasidan birinchi ma'lumotli
  // (GPS yoki manzil) yozuvni ko'rsatamiz (REDESIGN 3.0).
  const locProblem = (c.problems||[]).find(p => (p.lat != null && p.lng != null) || p.address);
  const locParts = [];
  if (locProblem?.address) locParts.push(esc(locProblem.address));
  if (locProblem?.lat != null && locProblem?.lng != null) {
    locParts.push(`<a href="https://www.openstreetmap.org/?mlat=${locProblem.lat}&mlon=${locProblem.lng}#map=17/${locProblem.lat}/${locProblem.lng}" target="_blank" rel="noopener" style="color:var(--gold-dk);text-decoration:underline">Xaritada ko'rish ↗</a>`);
  }
  const locRow = locParts.length ? `<div class="detail-meta-row">📍 <strong>Manzil:</strong> ${locParts.join(' &nbsp;·&nbsp; ')}</div>` : '';
  cnt.innerHTML = `
    <div class="cl-detail-hd">
      <div class="cl-meta">${catChip(c.category_id)}<span class="cl-status ${c.status}">${STATUS_LABEL[c.status]||c.status}</span>${place?`<span class="cl-place">📍 ${esc(place)}</span>`:''}</div>
      <div class="cl-detail-title">${esc(c.title)}</div>
      ${c.summary?`<div style="color:var(--tx3);font-size:14px;line-height:1.6;margin-bottom:14px">${esc(c.summary)}</div>`:''}
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="support-btn${c.is_supported?' on':''}" id="sp-detail-${c.id}" onclick="toggleSupport('${c.id}',this,true)">👍 ${c.is_supported?"Qo'lladingiz":'Menda ham bor'} <span class="sp-count">${fmtNum(c.support_count)}</span></button>
        <span class="cl-stat">📋 ${fmtNum(c.problem_count)} murojaat birlashtirilgan</span>
        <button class="btn btn-ghost" style="padding:7px 12px;font-size:12px;margin-left:auto" onclick="copyLink('/?cluster=${c.id}')">🔗 Ulashish</button>
        ${isAdmin ? `<select class="sel" style="width:auto;padding:7px 10px;font-size:12px" onchange="changeClusterStatus('${c.id}',this.value)">
          ${Object.entries(STATUS_LABEL).map(([k,v])=>`<option value="${k}" ${k===c.status?'selected':''}>${v}</option>`).join('')}
        </select>` : ''}
      </div>
    </div>
    <div class="detail-meta-card">
      <div class="detail-meta-row">🏷️ <strong>Biriktiruv:</strong> Hali rasmiy idora yoki mas'ul shaxsga biriktirilmagan.</div>
      ${locRow}
      <div class="detail-meta-row">🕐 <strong>Yuborildi:</strong> ${fmtDate(c.created_at)}${c.resolved_at ? ` &nbsp;·&nbsp; <strong>Hal qilindi:</strong> ${fmtDate(c.resolved_at)}` : ' &nbsp;·&nbsp; Hal qilinishi kutilmoqda'}</div>
    </div>
    <div class="tabs-row">
      <button class="tab-btn${_curClusterTab==='problems'?' active':''}" onclick="switchClusterTab('problems')">Murojaatlar (${c.problems.length})</button>
      <button class="tab-btn${_curClusterTab==='solutions'?' active':''}" onclick="switchClusterTab('solutions')">Yechimlar (${c.solutions.length})</button>
      <button class="tab-btn${_curClusterTab==='comments'?' active':''}" onclick="switchClusterTab('comments')">Muhokama (${c.comments.length})</button>
    </div>
    <div class="tab-pane${_curClusterTab==='problems'?' active':''}" id="tab-problems">
      ${c.problems.map(p => `
        <div class="problem-item">
          <div class="av" style="${avStyle(p,32)};border-radius:50%;flex-shrink:0">${avHtml(p,32,11)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;margin-bottom:3px">${esc(p.uname||p.username)} <span style="color:var(--tx4);font-weight:400;font-size:12px">· ${p.ago}</span></div>
            <div class="problem-body">${esc(p.body || p.title)}</div>
            ${p.image?`<div class="problem-img"><img src="${esc(p.image)}" alt="" loading="lazy"></div>`:''}
            <button class="btn btn-ghost" style="margin-top:6px;padding:4px 10px;font-size:11px" onclick="openReport('${p.id}','problem')">🚩 Shikoyat</button>
          </div>
        </div>`).join('') || emptyEl('inbox',"Murojaat yo'q")}
    </div>
    <div class="tab-pane${_curClusterTab==='solutions'?' active':''}" id="tab-solutions">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn btn-outline" style="flex:1" onclick="requireAuth(()=>promptSolution('${c.id}'))">✍️ O'z yechimingizni taklif qiling</button>
        <button class="btn btn-ghost" onclick="requireAuth(()=>doGenerateSolutions('${c.id}'))">🤖 AI yechim so'rash</button>
      </div>
      ${c.solutions.map(s => `
        <div class="solution-card${s.is_accepted?' accepted':''}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span class="sol-badge${s.source==='user'?' user':''}">${s.source==='ai'?'🤖 AI taklifi':'👤 '+esc(s.username||'Foydalanuvchi')}</span>
            ${s.is_accepted?'<span class="sol-badge" style="background:rgba(46,158,91,.15);color:var(--grn)">✅ Qabul qilingan</span>':''}
          </div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">${esc(s.title)}</div>
          ${s.body?`<div style="font-size:13px;color:var(--tx3);line-height:1.6;margin-bottom:8px">${esc(s.body)}</div>`:''}
          <div style="display:flex;align-items:center;gap:8px">
            <button class="sol-vote-btn${s.my_vote?' on':''}" onclick="voteSolutionBtn('${s.id}',this)">${IC.up} <span>${fmtNum(s.votes)}</span></button>
            ${isAdmin && !s.is_accepted ? `<button class="btn btn-outline" style="padding:5px 11px;font-size:11.5px" onclick="acceptSolutionBtn('${s.id}','${c.id}')">Qabul qilish</button>` : ''}
          </div>
        </div>`).join('') || emptyEl('lightbulb',"Hali yechim yo'q","Birinchi yechimni siz taklif qiling!")}
    </div>
    <div class="tab-pane${_curClusterTab==='comments'?' active':''}" id="tab-comments">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input class="inp" id="comment-inp-${c.id}" placeholder="Fikr bildiring..." onkeydown="if(event.key==='Enter')submitComment('${c.id}')">
        <button class="btn btn-gold" onclick="submitComment('${c.id}')">Yuborish</button>
      </div>
      <div id="comments-list-${c.id}">
        ${c.comments.map(cm => buildCommentHtml(cm)).join('') || emptyEl('cmt',"Hali fikr yo'q")}
      </div>
    </div>`;
}

function buildCommentHtml(cm) {
  return `<div class="comment-item" id="cmt-${cm.id}">
    <div class="av" style="${avStyle(cm,30)};border-radius:50%;flex-shrink:0">${avHtml(cm,30,11)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700;margin-bottom:2px">${esc(cm.uname||cm.username)} <span style="color:var(--tx4);font-weight:400;font-size:12px">· ${cm.ago}</span></div>
      <div class="comment-body">${esc(cm.body)}</div>
    </div>
  </div>`;
}
function switchClusterTab(tab) {
  _curClusterTab = tab;
  document.querySelectorAll('.tabs-row .tab-btn').forEach((b,i)=>b.classList.toggle('active', ['problems','solutions','comments'][i]===tab));
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.getElementById('tab-'+tab)?.classList.add('active');
}

async function toggleSupport(id, btn, isDetail=false) {
  if (!requireAuth()) return;
  try {
    const d = await API.support(id);
    document.querySelectorAll(`#sp-${id}, #sp-detail-${id}`).forEach(b => {
      b.classList.toggle('on', d.supported);
      b.innerHTML = `👍 ${d.supported?"Qo'lladingiz":'Menda ham bor'} <span class="sp-count">${fmtNum(d.support_count)}</span>`;
    });
  } catch(e) { toast(e.message); }
}
async function changeClusterStatus(id, status) {
  try { await API.setClusterStatus(id, status); toast('Holat yangilandi'); openCluster(id); }
  catch(e) { toast(e.message); }
}
async function submitComment(clusterId) {
  if (!requireAuth()) return;
  const inp = document.getElementById('comment-inp-'+clusterId);
  const body = (inp?.value||'').trim(); if (!body) return;
  try {
    const cm = await API.addComment(clusterId, body);
    inp.value = '';
    const list = document.getElementById('comments-list-'+clusterId);
    if (list) { const empty = list.querySelector('.empty'); if (empty) empty.remove(); list.insertAdjacentHTML('beforeend', buildCommentHtml(cm)); }
  } catch(e) { toast(e.message); }
}
function promptSolution(clusterId) {
  const title = prompt("Yechim sarlavhasi (masalan: 'Svetofor o'rnatish'):"); if (!title?.trim()) return;
  const body = prompt("Qisqa tushuntirish (ixtiyoriy):") || '';
  addSolutionSubmit(clusterId, title.trim(), body.trim());
}
async function addSolutionSubmit(clusterId, title, body) {
  try { await API.addSolution(clusterId, title, body); toast('Yechim taklifi yuborildi!'); openCluster(clusterId); }
  catch(e) { toast(e.message); }
}
async function doGenerateSolutions(clusterId) {
  toast('AI yechim variantlarini tayyorlayapti...');
  try { await API.generateSolutions(clusterId); toast('Yangi yechimlar qo\'shildi!'); openCluster(clusterId); }
  catch(e) { toast(e.message); }
}
async function voteSolutionBtn(id, btn) {
  if (!requireAuth()) return;
  try {
    const d = await API.voteSolution(id);
    btn.classList.toggle('on', d.voted);
    btn.querySelector('span').textContent = fmtNum(d.votes);
  } catch(e) { toast(e.message); }
}
async function acceptSolutionBtn(id, clusterId) {
  if (!confirm("Shu yechimni qabul qilingan deb belgilaysizmi? Klaster 'Hal qilindi' holatiga o'tadi.")) return;
  try { await API.acceptSolution(id); toast('Yechim qabul qilindi!'); openCluster(clusterId); } catch(e) { toast(e.message); }
}

/* ═══ MUROJAAT YOZISH (Postdan alohida — subprob-* id'lari) ═══ */
function openSubmitProblem() {
  document.getElementById('subprob-title').value = '';
  document.getElementById('subprob-body').value = '';
  document.getElementById('subprob-school').value = '';
  document.getElementById('subprob-address').value = '';
  clearSubProbImg();
  resetSubProbLocation();
  loadRegionsInto(['subprob-region']);
  if (window._me?.region_id) document.getElementById('subprob-region').value = window._me.region_id;
  document.getElementById('subprob-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('subprob-title')?.focus(), 150);
}
function closeSubmitProblem() { document.getElementById('subprob-overlay').classList.remove('open'); }
function previewSubProbImg(inp) {
  const f = inp.files?.[0]; if (!f) return;
  if (f.size > 10*1024*1024) { toast('Rasm 10MB dan oshmasin'); inp.value=''; return; }
  const el = document.getElementById('subprob-img-preview');
  el.innerHTML = `<div style="position:relative;margin-top:8px"><div style="max-height:220px;overflow:hidden;border-radius:var(--r);background:var(--bg2)"><img src="${URL.createObjectURL(f)}" style="width:100%;object-fit:contain;max-height:220px"></div>
    <button onclick="clearSubProbImg()" style="position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer">✕</button></div>`;
  document.getElementById('subprob-img-drop').style.display = 'none';
}
function clearSubProbImg() {
  const fi = document.getElementById('subprob-img-file'); if (fi) fi.value = '';
  const el = document.getElementById('subprob-img-preview'); if (el) el.innerHTML = '';
  const drop = document.getElementById('subprob-img-drop'); if (drop) drop.style.display = '';
}
/* ═══ MUROJAAT JOYLASHUVI ═══ — GPS (brauzer geolokatsiyasi) YOKI qo'lda
   yozilgan manzil, kamida bittasi majburiy (backend ham tekshiradi). */
let _subProbGeo = null;
function resetSubProbLocation() {
  _subProbGeo = null;
  const statusEl = document.getElementById('subprob-geo-status'); if (statusEl) statusEl.textContent = '';
  const btn = document.getElementById('subprob-geo-btn'); if (btn) { btn.disabled = false; btn.innerHTML = '📍 Joriy joylashuvni aniqlash'; }
}
function captureSubProbLocation() {
  const statusEl = document.getElementById('subprob-geo-status');
  const btn = document.getElementById('subprob-geo-btn');
  if (!navigator.geolocation) { if (statusEl) { statusEl.style.color = 'var(--red)'; statusEl.textContent = "Brauzeringiz geolokatsiyani qo'llab-quvvatlamaydi — manzilni qo'lda yozing."; } return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:13px;height:13px;margin:0;border-width:2px;display:inline-block"></div> Aniqlanmoqda...'; }
  if (statusEl) { statusEl.style.color = 'var(--tx4)'; statusEl.textContent = ''; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      _subProbGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (statusEl) { statusEl.style.color = 'var(--grn)'; statusEl.textContent = `✅ Joylashuv aniqlandi (${_subProbGeo.lat.toFixed(5)}, ${_subProbGeo.lng.toFixed(5)})`; }
      if (btn) { btn.disabled = false; btn.innerHTML = '📍 Qayta aniqlash'; }
    },
    err => {
      _subProbGeo = null;
      if (statusEl) { statusEl.style.color = 'var(--red)'; statusEl.textContent = err.code === err.PERMISSION_DENIED ? "Joylashuvga ruxsat berilmadi — manzilni qo'lda yozing." : "Joylashuvni aniqlab bo'lmadi — manzilni qo'lda yozing."; }
      if (btn) { btn.disabled = false; btn.innerHTML = '📍 Joriy joylashuvni aniqlash'; }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
async function doSubmitProblem() {
  const title = (document.getElementById('subprob-title').value||'').trim();
  const body = (document.getElementById('subprob-body').value||'').trim();
  const region_id = document.getElementById('subprob-region').value;
  const school_name = (document.getElementById('subprob-school').value||'').trim();
  const address = (document.getElementById('subprob-address').value||'').trim();
  if (!title) { toast('Sarlavha kerak'); return; }
  if (!_subProbGeo && !address) { toast("Joylashuvni ko'rsating: GPS orqali aniqlang yoki manzilni yozing"); return; }
  const btn = document.getElementById('subprob-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:14px;height:14px;margin:0;border-width:2px"></div>';
  try {
    const file = document.getElementById('subprob-img-file').files?.[0];
    const loc = { lat: _subProbGeo?.lat ?? '', lng: _subProbGeo?.lng ?? '', address };
    let problem;
    if (file) {
      const fd = new FormData();
      fd.append('title',title); fd.append('body',body); fd.append('region_id',region_id); fd.append('school_name',school_name);
      fd.append('lat',loc.lat); fd.append('lng',loc.lng); fd.append('address',loc.address);
      fd.append('image', file);
      problem = await API.createProblem(fd, true);
    } else {
      problem = await API.createProblem({ title, body, region_id, school_name, ...loc });
    }
    closeSubmitProblem();
    toast("Murojaat yuborildi! AI tahlil qilmoqda... 🤖");
    if (curSec()==='murojaat') loadClusters(true);
  } catch(e) { toast(e.message||'Xatolik'); }
  finally { btn.disabled = false; btn.innerHTML = 'Yuborish'; }
}

/* "Mening murojaatlarim" endi shaxsiy kabinetning (openUser, app.js) o'zida —
   holat belgisi bilan birga — ko'rsatiladi, alohida bo'lim sifatida emas. */

/* ═══ AI FON JARAYONI — real vaqtda xabar ═══ */
function initProblemWS() {
  WS.on('problem_processed', d => {
    const cat = catById(d.data.category_id);
    toast(`🤖 Murojaatingiz tahlil qilindi: ${cat.icon} ${cat.name}`);
    if (curSec() === 'murojaat') loadClusters(true);
    // Kabinetda o'z profilini ko'rib turgan bo'lsa — holatni jonli yangilaymiz
    if (curSec() === 'user' && window._curProfileId === window._me?.id) openUser(window._me.id);
  });
}
/* Shikoyat (report) uchun umumiy modal core.js'da — bu yerda takror aniqlanmaydi,
   openReport('id','problem') core.js'dagi bitta unified modalni chaqiradi. */

window.loadRegionsInto=loadRegionsInto; window.loadCategoryFilters=loadCategoryFilters; window.setFeedCategory=setFeedCategory; window.goMurojaatlar=goMurojaatlar; window.goResolved=goResolved; window.initHomepageExtras=initHomepageExtras; window.initAboutStats=initAboutStats;
window.buildClusterCard=buildClusterCard; window.loadClusters=loadClusters; window.setMurojaatSort=setMurojaatSort; window.initMurojaatScrollFeed=initMurojaatScrollFeed;
window.openCluster=openCluster; window.switchClusterTab=switchClusterTab; window.toggleSupport=toggleSupport; window.changeClusterStatus=changeClusterStatus;
window.submitComment=submitComment; window.promptSolution=promptSolution; window.doGenerateSolutions=doGenerateSolutions;
window.voteSolutionBtn=voteSolutionBtn; window.acceptSolutionBtn=acceptSolutionBtn;
window.openSubmitProblem=openSubmitProblem; window.closeSubmitProblem=closeSubmitProblem; window.previewSubProbImg=previewSubProbImg; window.clearSubProbImg=clearSubProbImg; window.doSubmitProblem=doSubmitProblem;
window.captureSubProbLocation=captureSubProbLocation; window.resetSubProbLocation=resetSubProbLocation;
window.initProblemWS=initProblemWS;
window.setMurojaatRegion=setMurojaatRegion; window.setMurojaatStatus=setMurojaatStatus; window.clearMurojaatFilters=clearMurojaatFilters; window.initFilterRail=initFilterRail;
