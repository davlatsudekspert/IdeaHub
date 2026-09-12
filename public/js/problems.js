'use strict';
let _feedSort = 'hot', _feedOffset = 0, _feedBusy = false, _feedCategory = null;
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
  if (_feedBusy && !reset) return;
  _feedBusy = true;
  const cnt = document.getElementById('feed-cnt'); if (!cnt) { _feedBusy=false; return; }
  if (reset) { _feedOffset = 0; cnt.innerHTML = spinner(); }
  try {
    const rows = await API.clusters(_feedSort, _feedOffset, { category: _feedCategory });
    if (reset) cnt.innerHTML = '';
    if (!rows.length && reset) { cnt.innerHTML = emptyEl('lightbulb', "Hali murojaat yo'q", "Birinchi murojaatni siz yuboring!"); _feedBusy=false; return; }
    rows.forEach((c,i) => { const d=document.createElement('div'); d.innerHTML=buildClusterCard(c); const el=d.firstElementChild; el.style.animation=`fadeUp .3s ease ${i*.03}s both`; cnt.appendChild(el); });
    _feedOffset += rows.length;
  } catch(e) { if (reset) cnt.innerHTML = emptyEl('close','Xatolik',e.message); }
  finally { _feedBusy = false; }
}
function setFeedSort(sort) {
  _feedSort = sort;
  document.querySelectorAll('#sec-home .sort-btn').forEach(b=>b.classList.toggle('active', b.dataset.sort===sort));
  loadClusters(true);
}
function initScrollFeed() {
  const obs = new IntersectionObserver(entries => {
    if (!entries.some(e=>e.isIntersecting) || _feedBusy) return;
    if (curSec() === 'home') loadClusters(false);
  }, { rootMargin: '200px' });
  const t = document.getElementById('scroll-trigger'); if (t) obs.observe(t);
}

/* ═══ KLASTER TAFSILOTI ═══ */
async function openCluster(id) {
  _curClusterId = id; _curClusterTab = 'problems';
  goSec('cluster');
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
            <div style="font-size:13px;font-weight:700;margin-bottom:3px">${esc(p.username)} <span style="color:var(--tx4);font-weight:400;font-size:12px">· ${p.ago}</span></div>
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
      <div style="font-size:13px;font-weight:700;margin-bottom:2px">${esc(cm.username)} <span style="color:var(--tx4);font-weight:400;font-size:12px">· ${cm.ago}</span></div>
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
  try { await API.setClusterStatus(id, status); toast('Holat yangilandi'); } catch(e) { toast(e.message); }
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

/* ═══ MUROJAAT YOZISH ═══ */
function openSubmit() {
  document.getElementById('sub-title').value = '';
  document.getElementById('sub-body').value = '';
  document.getElementById('sub-school').value = '';
  clearSubImg();
  loadRegionsInto(['sub-region']);
  if (window._me?.region_id) document.getElementById('sub-region').value = window._me.region_id;
  document.getElementById('sub-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('sub-title')?.focus(), 150);
}
function closeSubmit() { document.getElementById('sub-overlay').classList.remove('open'); }
function previewSubImg(inp) {
  const f = inp.files?.[0]; if (!f) return;
  if (f.size > 10*1024*1024) { toast('Rasm 10MB dan oshmasin'); inp.value=''; return; }
  const el = document.getElementById('sub-img-preview');
  el.innerHTML = `<div style="position:relative;margin-top:8px"><div style="max-height:220px;overflow:hidden;border-radius:var(--r);background:var(--bg2)"><img src="${URL.createObjectURL(f)}" style="width:100%;object-fit:contain;max-height:220px"></div>
    <button onclick="clearSubImg()" style="position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer">✕</button></div>`;
  document.getElementById('sub-img-drop').style.display = 'none';
}
function clearSubImg() {
  const fi = document.getElementById('sub-img-file'); if (fi) fi.value = '';
  const el = document.getElementById('sub-img-preview'); if (el) el.innerHTML = '';
  const drop = document.getElementById('sub-img-drop'); if (drop) drop.style.display = '';
}
async function doSubmitProblem() {
  const title = (document.getElementById('sub-title').value||'').trim();
  const body = (document.getElementById('sub-body').value||'').trim();
  const region_id = document.getElementById('sub-region').value;
  const school_name = (document.getElementById('sub-school').value||'').trim();
  if (!title) { toast('Sarlavha kerak'); return; }
  const btn = document.getElementById('sub-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:14px;height:14px;margin:0;border-width:2px"></div>';
  try {
    const file = document.getElementById('sub-img-file').files?.[0];
    let problem;
    if (file) {
      const fd = new FormData();
      fd.append('title',title); fd.append('body',body); fd.append('region_id',region_id); fd.append('school_name',school_name);
      fd.append('image', file);
      problem = await API.createProblem(fd, true);
    } else {
      problem = await API.createProblem({ title, body, region_id, school_name });
    }
    closeSubmit();
    toast("Murojaat yuborildi! AI tahlil qilmoqda... 🤖");
    if (curSec()==='home') loadClusters(true);
  } catch(e) { toast(e.message||'Xatolik'); }
  finally { btn.disabled = false; btn.innerHTML = 'Yuborish'; }
}

/* ═══ MENING MUROJAATLARIM ═══ */
async function loadMyProblems() {
  const el = document.getElementById('mine-cnt'); if (!el) return;
  el.innerHTML = spinner();
  try {
    const rows = await API.myProblems();
    if (!rows.length) { el.innerHTML = emptyEl('inbox',"Hali murojaat yubormadingiz"); return; }
    el.innerHTML = rows.map(p => `
      <div class="problem-item" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:14px;margin-bottom:8px;cursor:pointer" onclick="${p.cluster_id?`openCluster('${p.cluster_id}')`:''}">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            ${p.category_id?catChip(p.category_id):'<span class="cat-chip" style="background:var(--bg2);color:var(--tx4)">🤖 Tahlil qilinmoqda...</span>'}
            <span style="font-size:11px;color:var(--tx4)">${p.ago||''}</span>
          </div>
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${esc(p.title)}</div>
          <div style="font-size:13px;color:var(--tx3)">${esc((p.body||'').slice(0,120))}</div>
        </div>
      </div>`).join('');
  } catch(e) { el.innerHTML = emptyEl('close','Xatolik',e.message); }
}

/* ═══ AI FON JARAYONI — real vaqtda xabar ═══ */
function initProblemWS() {
  WS.on('problem_processed', d => {
    const cat = catById(d.data.category_id);
    toast(`🤖 Murojaatingiz tahlil qilindi: ${cat.icon} ${cat.name}`);
    if (curSec() === 'home') loadClusters(true);
    if (curSec() === 'mine') loadMyProblems();
  });
}

/* ═══ SHIKOYAT ═══ */
let _reportTarget = null, _reportType = null;
function openReport(targetId, type) {
  if (!requireAuth()) return;
  _reportTarget = targetId; _reportType = type;
  document.getElementById('report-reason-text').value = '';
  document.getElementById('report-overlay').classList.add('open');
}
function closeReport() { document.getElementById('report-overlay').classList.remove('open'); _reportTarget = null; }
async function submitReport() {
  const reason = (document.getElementById('report-reason-text').value||'').trim();
  if (!reason) { toast('Sabab kiriting'); return; }
  try {
    const body = { reason };
    if (_reportType === 'problem') body.problem_id = _reportTarget; else body.comment_id = _reportTarget;
    await API.report(body);
    closeReport(); toast('Shikoyat yuborildi. Rahmat!');
  } catch(e) { toast(e.message); }
}

window.loadRegionsInto=loadRegionsInto; window.loadCategoryFilters=loadCategoryFilters; window.setFeedCategory=setFeedCategory;
window.buildClusterCard=buildClusterCard; window.loadClusters=loadClusters; window.setFeedSort=setFeedSort; window.initScrollFeed=initScrollFeed;
window.openCluster=openCluster; window.switchClusterTab=switchClusterTab; window.toggleSupport=toggleSupport; window.changeClusterStatus=changeClusterStatus;
window.submitComment=submitComment; window.promptSolution=promptSolution; window.doGenerateSolutions=doGenerateSolutions;
window.voteSolutionBtn=voteSolutionBtn; window.acceptSolutionBtn=acceptSolutionBtn;
window.openSubmit=openSubmit; window.closeSubmit=closeSubmit; window.previewSubImg=previewSubImg; window.clearSubImg=clearSubImg; window.doSubmitProblem=doSubmitProblem;
window.loadMyProblems=loadMyProblems; window.initProblemWS=initProblemWS;
window.openReport=openReport; window.closeReport=closeReport; window.submitReport=submitReport;
