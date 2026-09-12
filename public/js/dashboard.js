'use strict';
let _adminTab = 'users', _pendingBanId = null;

async function loadAdmin() {
  const el = document.getElementById('admin-cnt'); if (!el) return;
  el.innerHTML = spinner();
  try {
    const d = await API.adminStats();
    window._adminData = d;
    const scopeNote = d.scope === 'region' ? `<div style="font-size:12px;color:var(--tx4);margin-bottom:10px">📍 Faqat sizning hududingiz ko'rsatilmoqda</div>` : '';
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:19px;font-weight:800;font-family:'Plus Jakarta Sans',sans-serif">🛡️ Boshqaruv paneli</div>
      </div>
      ${scopeNote}
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-n">${fmtNum(d.total_problems)}</div><div class="stat-l">Jami murojaat</div></div>
        <div class="stat-tile"><div class="stat-n">${fmtNum(d.places)}</div><div class="stat-l">Hudud va maktab</div></div>
        <div class="stat-tile"><div class="stat-n">${fmtNum(d.solutions)}</div><div class="stat-l">Yechim taklifi</div></div>
        <div class="stat-tile"><div class="stat-n">${d.resolved_pct}%</div><div class="stat-l">Hal qilingan</div></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Eng dolzarb mavzular</div>
        <div id="cat-chart"></div>
      </div>
      ${d.scope === 'all' ? `<div class="chart-card"><div class="chart-title">Hududlar bo'yicha</div><div id="region-table"></div></div>` : ''}
      ${d.scope === 'all' ? `
      <div style="display:flex;gap:4px;margin-bottom:12px">
        <button class="sort-btn${_adminTab==='users'?' active':''}" onclick="switchAdminTab('users')" style="flex:1">👥 Foydalanuvchilar</button>
        <button class="sort-btn${_adminTab==='reports'?' active':''}" onclick="switchAdminTab('reports')" style="flex:1">🚩 Shikoyatlar (${d.reports.length})</button>
      </div>
      <div id="admin-tab-content"></div>` : ''}
    `;
    renderCategoryChart(d.top_categories);
    if (d.scope === 'all') { renderRegionTable(d.region_breakdown); renderAdminTabContent(d); }
  } catch(e) { el.innerHTML = emptyEl('close','Xatolik',e.message); }
}

/* Gorizontal ustunli diagramma: toifa identiteti o'z rangi bilan, har doim
   ikonka+nom bilan birga (ranggina hech qachon yagona ma'no tashimaydi). */
function renderCategoryChart(rows) {
  const el = document.getElementById('cat-chart'); if (!el) return;
  if (!rows.length) { el.innerHTML = `<div style="color:var(--tx4);font-size:13px;padding:10px 0">Hali ma'lumot yo'q</div>`; return; }
  const max = Math.max(...rows.map(r=>r.cnt), 1);
  el.innerHTML = rows.map(r => {
    const cat = catById(r.id);
    const pct = Math.round((r.cnt/max)*100);
    return `<div class="bar-row">
      <div class="bar-label">${cat.icon} ${esc(r.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${cat.color}"></div></div>
      <div class="bar-value">${fmtNum(r.cnt)}</div>
    </div>`;
  }).join('');
}
function renderRegionTable(rows) {
  const el = document.getElementById('region-table'); if (!el) return;
  if (!rows.length) { el.innerHTML = `<div style="color:var(--tx4);font-size:13px">Ma'lumot yo'q</div>`; return; }
  el.innerHTML = `<table class="region-table"><thead><tr><th>Hudud</th><th>Klaster</th><th>Hal qilingan</th></tr></thead><tbody>
    ${rows.filter(r=>r.cluster_count>0).map(r => `<tr><td>${esc(r.name)}</td><td>${fmtNum(r.cluster_count)}</td><td>${fmtNum(r.resolved_count)} / ${fmtNum(r.cluster_count)}</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--tx4)">Hali murojaat yo\'q</td></tr>'}
  </tbody></table>`;
}

function switchAdminTab(tab) { _adminTab = tab; if (window._adminData) { loadAdmin(); } }
function renderAdminTabContent(d) {
  const el = document.getElementById('admin-tab-content'); if (!el) return;
  if (_adminTab === 'users') {
    el.innerHTML = `<div class="set-card" style="padding:0">
      ${d.users.map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border)">
        <div class="av" style="${avStyle(u,36)};border-radius:50%;font-size:12px;flex-shrink:0">${avHtml(u,36,12)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:5px">${esc(u.name)}
            ${u.role!=='user'?`<span style="font-size:10px;background:var(--gold-soft);color:var(--gold-dk);padding:1px 6px;border-radius:10px">${u.role==='admin'?'👑 Admin':'🧭 Rahbar'}</span>`:''}
            ${u.is_banned?'<span style="font-size:10px;background:rgba(217,64,64,.12);color:var(--red);padding:1px 6px;border-radius:10px">🚫 Bloklangan</span>':''}
          </div>
          <div style="font-size:11px;color:var(--tx4)">@${esc(u.username)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <select class="sel" style="width:auto;padding:4px 6px;font-size:11px" onchange="adminSetRole('${u.id}',this.value)">
            <option value="user" ${u.role==='user'?'selected':''}>Oddiy</option>
            <option value="leader" ${u.role==='leader'?'selected':''}>Rahbar</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
          </select>
          <button class="btn ${u.is_banned?'btn-outline':'btn-danger'}" style="font-size:11px;padding:4px 8px" onclick="adminBanUser('${u.id}',${u.is_banned})">${u.is_banned?'Ochish':'Blok'}</button>
        </div>
      </div>`).join('')}
    </div>`;
  } else {
    el.innerHTML = `<div class="set-card" style="padding:0">
      ${d.reports.length ? d.reports.map(r => `
      <div style="padding:12px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(r.reason)}</div>
        <div style="font-size:11px;color:var(--tx4);margin-bottom:8px">${r.ago}${r.problem_id?` · <span style="cursor:pointer;color:var(--blu)" onclick="API.getProblem('${r.problem_id}').then(p=>p.cluster_id&&openCluster(p.cluster_id))">Murojaatga o'tish</span>`:''}</div>
        <div style="display:flex;gap:6px"><button class="btn btn-ghost" style="padding:5px 12px;font-size:11px" onclick="adminResolveReport('${r.id}','resolved')">✅ Hal qilindi</button><button class="btn btn-danger" style="padding:5px 12px;font-size:11px" onclick="adminResolveReport('${r.id}','dismissed')">❌ Rad etish</button></div>
      </div>`).join('') : `<div style="padding:24px;text-align:center;color:var(--tx4);font-size:13px">Shikoyatlar yo'q 🎉</div>`}
    </div>`;
  }
}

async function adminSetRole(id, role) { try { await API.adminAction({target_id:id, action:'setRole', role}); toast('Rol yangilandi'); loadAdmin(); } catch(e){ toast(e.message); } }
async function adminResolveReport(id, status) { try { await api('POST','/admin/reports/'+id,{status}); toast('Hal qilindi'); loadAdmin(); } catch(e){ toast(e.message); } }
function adminBanUser(id, isBanned) {
  if (isBanned) { api('POST','/admin/action',{target_id:id,action:'unban'}).then(()=>{toast('Ochildi');loadAdmin();}).catch(e=>toast(e.message)); return; }
  _pendingBanId = id; document.getElementById('ban-reason-inp').value=''; document.getElementById('ban-modal').classList.add('open');
}
async function confirmBan() {
  const reason = (document.getElementById('ban-reason-inp').value||'').trim();
  const duration = parseInt(document.getElementById('ban-duration').value)||0;
  if (!reason) { toast('Sabab kiriting'); return; }
  document.getElementById('ban-modal').classList.remove('open');
  try { await API.adminAction({target_id:_pendingBanId,action:'ban',reason,duration}); _pendingBanId=null; toast('Bloklandi'); loadAdmin(); } catch(e){ toast(e.message); }
}
function closeBanModal(){ document.getElementById('ban-modal').classList.remove('open'); _pendingBanId=null; }

window.loadAdmin=loadAdmin; window.switchAdminTab=switchAdminTab; window.adminSetRole=adminSetRole;
window.adminResolveReport=adminResolveReport; window.adminBanUser=adminBanUser; window.confirmBan=confirmBan; window.closeBanModal=closeBanModal;
