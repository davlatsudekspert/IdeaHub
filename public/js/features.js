'use strict';
/* ═══ POST YOZISH (Reddit-uslub — #sub-overlay, sub-* id'lari) ═══
   Murojaat/AI yozish modali alohida: problems.js'dagi openSubmitProblem/subprob-* */
let _subTab = 'text', _allComs = [];

function openSubmit(comSlug) {
  _subTab = 'text';
  pauseAllVideos();
  document.querySelectorAll('.sub-tab').forEach(b=>b.classList.toggle('active',b.dataset.t==='text'));
  document.querySelectorAll('.sub-form').forEach(f=>f.classList.toggle('active',f.dataset.t==='text'));
  const inp = document.getElementById('sub-com-inp');
  if (inp && comSlug) inp.value = comSlug;
  document.getElementById('sub-title').value='';
  document.getElementById('sub-body').value='';
  resetPollForm();
  resetVidPollForm();
  const vf = document.getElementById('sub-vid-file');
  if (vf) vf.value = '';
  const vp = document.getElementById('sub-vid-preview');
  if (vp) vp.innerHTML = '';
  const vs = document.getElementById('vid-poll-section');
  if (vs) vs.style.display = 'none';
  clearSubImg();
  ['sub-aud-file','sub-link'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const ap=document.getElementById('sub-aud-preview'); if(ap) ap.innerHTML='';
  document.getElementById('sub-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('sub-title')?.focus(),150);
}

function closeSubmit() { document.getElementById('sub-overlay').classList.remove('open'); }

function switchSubTab(t) {
  _subTab = t;
  document.querySelectorAll('.sub-tab').forEach(b=>b.classList.toggle('active',b.dataset.t===t));
  document.querySelectorAll('.sub-form').forEach(f=>f.classList.toggle('active',f.dataset.t===t));
  if (t === 'video') {
    const warn = document.getElementById('vid-warn');
    if (warn) warn.style.display = 'flex';
  }
}

function resetPollForm() {
  const pollOpts = document.getElementById('poll-options');
  if (pollOpts) {
    pollOpts.innerHTML = `
      <input class="inp poll-opt-inp" placeholder="Variant 1" style="margin-bottom:6px">
      <input class="inp poll-opt-inp" placeholder="Variant 2" style="margin-bottom:6px">
      <input class="inp poll-opt-inp" placeholder="Variant 3 (ixtiyoriy)" style="margin-bottom:6px">
      <input class="inp poll-opt-inp" placeholder="Variant 4 (ixtiyoriy)" style="margin-bottom:6px">
      <input class="inp poll-opt-inp" placeholder="Variant 5 (ixtiyoriy)" style="margin-bottom:6px">`;
  }
  const pollQ = document.getElementById('poll-question');
  if (pollQ) pollQ.value = '';
  const pollDays = document.getElementById('poll-days');
  if (pollDays) pollDays.value = '3';
}

function resetVidPollForm() {
  const en = document.getElementById('vid-poll-enable');
  if (en) en.checked = false;
  const fields = document.getElementById('vid-poll-fields');
  if (fields) fields.style.display = 'none';
  const q = document.getElementById('vid-poll-question');
  if (q) q.value = '';
  document.querySelectorAll('#vid-poll-options .poll-opt-inp').forEach(i=>i.value='');
  const d = document.getElementById('vid-poll-days');
  if (d) d.value = '3';
}

async function doSubmitPost() {
  const title   = (document.getElementById('sub-title')?.value||'').trim();
  const community = (document.getElementById('sub-com-inp')?.value||'').trim();
  if (!title)     { toast('Sarlavha kerak'); return; }
  if (!community) { toast('Jamoa tanlang'); return; }
  const btn = document.getElementById('sub-btn');
  if (btn) { btn.disabled=true; btn.innerHTML='<div class="spin" style="width:14px;height:14px;margin:0;border-width:2px"></div>'; }
  try {
    let post;
    if (_subTab === 'image') {
      const fi = document.getElementById('sub-img-file');
      const fd = new FormData();
      fd.append('title',title); fd.append('community',community); fd.append('type','image');
      fd.append('body',document.getElementById('sub-body')?.value||'');
      if (fi?.files?.[0]) fd.append('image',fi.files[0]);
      post = await API.createPost(fd,true);
    } else if (_subTab === 'video') {
      const fv = document.getElementById('sub-vid-file');
      if (!fv?.files?.[0]) { toast("Video fayl tanlang"); return; }
      if (fv.files[0].size > 500*1024*1024) { toast("Video 500MB dan oshmasin"); return; }
      const vidFile = fv.files[0];
      const vidUrl = URL.createObjectURL(vidFile);
      const dur = await new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => { URL.revokeObjectURL(vidUrl); resolve(v.duration); };
        v.onerror = () => { URL.revokeObjectURL(vidUrl); resolve(0); };
        v.src = vidUrl;
      });
      if (dur && dur > 10*60) {
        toast("Video ko'pi bilan 10 daqiqa bo'lishi kerak!");
        return;
      }
      const fd = new FormData();
      fd.append('title',title); fd.append('community',community); fd.append('type','video');
      fd.append('body',document.getElementById('sub-body')?.value||'');
      fd.append('video',fv.files[0]);
      const vidPollEnabled = document.getElementById('vid-poll-enable')?.checked;
      if (vidPollEnabled) {
        const question = (document.getElementById('vid-poll-question')?.value||'').trim();
        const days = parseInt(document.getElementById('vid-poll-days')?.value)||3;
        const optEls = document.querySelectorAll('#vid-poll-options .poll-opt-inp');
        const opts = Array.from(optEls).map(i=>i.value.trim()).filter(Boolean);
        if (!question) { toast("So'rovnoma savolini yozing"); return; }
        if (opts.length < 2) { toast("So'rovnoma uchun kamida 2 ta variant kerak"); return; }
        fd.append('poll_question', question);
        fd.append('poll_options', JSON.stringify(opts.slice(0,5)));
        fd.append('poll_days', days);
      }
      post = await API.createPost(fd,true);
    } else if (_subTab === 'audio') {
      const fa = document.getElementById('sub-aud-file');
      const fd = new FormData();
      fd.append('title',title); fd.append('community',community); fd.append('type','audio');
      if (fa?.files?.[0]) fd.append('audio',fa.files[0]);
      post = await API.createPost(fd,true);
    } else if (_subTab === 'link') {
      post = await API.createPost({title,community,type:'link',link:(document.getElementById('sub-link')?.value||'').trim()});
    } else if (_subTab === 'poll') {
      const fd = new FormData();
      fd.append('title',title); fd.append('community',community); fd.append('type','text');
      fd.append('body',document.getElementById('sub-body')?.value||'');
      appendPollToForm(fd);
      post = await API.createPost(fd,true);
    } else {
      post = await API.createPost({title,community,type:'text',body:(document.getElementById('sub-body')?.value||'').trim()});
    }
    closeSubmit();
    toast('Post nashr qilindi! 🎉');
    openPost(post.id);
  } catch(e) { toast(e.message||'Xatolik yuz berdi'); }
  finally { if(btn){btn.disabled=false;btn.innerHTML=`${IC.send||''} Nashr qilish`;} }
}

function appendPollToForm(fd) {
  const question = (document.getElementById('poll-question')?.value||'').trim();
  const days     = parseInt(document.getElementById('poll-days')?.value)||3;
  const optInputs = document.querySelectorAll('.poll-opt-inp');
  const options   = Array.from(optInputs).map(i=>i.value.trim()).filter(Boolean);
  if (question && options.length >= 2) {
    fd.append('poll_question', question);
    fd.append('poll_options',  JSON.stringify(options.slice(0,5)));
    fd.append('poll_days',     days);
  }
}

async function initComPicker() {
  if (!_allComs.length) { try { _allComs = await API.communities(); } catch {} }
  const inp = document.getElementById('sub-com-inp');
  const dd  = document.getElementById('sub-com-dd');
  if (!inp||!dd) return;
  inp.oninput = () => {
    const q = inp.value.toLowerCase();
    const mine = _allComs.filter(c=>c.is_member);
    const matches = (q ? mine.filter(c=>c.slug.includes(q)||c.name.toLowerCase().includes(q)) : mine).slice(0,8);
    dd.innerHTML = '';
    if (!matches.length) { dd.classList.remove('open'); return; }
    if (q && matches.length < 8) {
      const d = document.createElement('div'); d.className='com-dd-item com-dd-hint';
      d.innerHTML = '<span style="opacity:.5;font-size:11px;color:var(--tx3)">Jamoani qidiring yoki quyidagi tanlang</span>';
      dd.appendChild(d);
    }
    matches.forEach(c => {
      const d = document.createElement('div'); d.className='com-dd-item';
      d.innerHTML = c.avatar
        ? `<img src="${esc(c.avatar)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover" alt=""><strong>${esc(c.name||c.slug)}</strong>`
        : `<span class="com-dd-dot" style="background:${esc(c.color||'#C8922A')}"></span><strong>${esc(c.name||c.slug)}</strong>`;
      d.onclick=()=>{ inp.value=c.slug; dd.classList.remove('open'); };
      dd.appendChild(d);
    });
    dd.classList.add('open');
  };
  inp.onfocus = inp.oninput;
  inp.oninput();
  document.addEventListener('click', e=>{ if(!inp.contains(e.target)&&!dd.contains(e.target)) dd.classList.remove('open'); });
}

function previewSubImg(inp){
  const f=inp.files?.[0];if(!f)return;
  if(f.size>10*1024*1024){toast('Rasm 10MB dan oshmasin');inp.value='';return;}
  const el=document.getElementById('sub-img-preview');if(!el)return;
  const url=URL.createObjectURL(f);
  el.innerHTML=`<div style="position:relative;margin-top:8px">
      <div style="max-height:240px;overflow:hidden;border-radius:var(--r);background:var(--bg2)"><img src="${url}" style="width:100%;object-fit:contain;max-height:240px"></div>
      <button onclick="clearSubImg()" style="position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:14px;line-height:1">✕</button>
    </div>`;
  document.getElementById('sub-img-drop').style.display='none';
}
function clearSubImg(){
  const fi=document.getElementById('sub-img-file'); if(fi) fi.value='';
  const el=document.getElementById('sub-img-preview'); if(el) el.innerHTML='';
  const drop=document.getElementById('sub-img-drop'); if(drop) drop.style.display='';
}
function previewSubVid(inp){
  const f=inp.files?.[0];if(!f)return;
  if(f.size>500*1024*1024){toast('Video 500MB dan oshmasin');inp.value='';return;}
  const url=URL.createObjectURL(f);
  const vid=document.createElement('video');
  vid.preload='metadata';
  vid.onloadedmetadata=()=>{
    const dur=vid.duration;
    const warnEl=document.getElementById('vid-warn');
    const warnTxt=document.getElementById('vid-warn-text');
    if(dur>10*60){
      if(warnEl){warnEl.style.background='rgba(217,64,64,.08)';warnEl.style.borderColor='rgba(217,64,64,.2)';warnEl.style.color='var(--red)';}
      if(warnTxt) warnTxt.textContent='❌ Video '+(Math.floor(dur/60))+':'+(String(Math.floor(dur%60)).padStart(2,'0'))+' — Ko\'pi bilan 10 daqiqa!';
    } else {
      if(warnEl){warnEl.style.background='rgba(46,158,91,.08)';warnEl.style.borderColor='rgba(46,158,91,.2)';warnEl.style.color='var(--grn)';}
      if(warnTxt) warnTxt.textContent='✅ Video '+(Math.floor(dur/60))+':'+(String(Math.floor(dur%60)).padStart(2,'0'))+' — Yaroqli';
    }
    const pollSec=document.getElementById('vid-poll-section');
    if(pollSec) pollSec.style.display='block';
  };
  vid.src=url;
  const el=document.getElementById('sub-vid-preview');if(!el)return;
  el.innerHTML=`<video controls style="width:100%;border-radius:var(--r-lg);max-height:240px;margin-top:8px;background:#000;display:block"></video>`;
  el.querySelector('video').src=url;
}
function previewSubAud(inp){
  const f=inp.files?.[0];if(!f)return;
  if(f.size>20*1024*1024){toast('Audio 20MB dan oshmasin');inp.value='';return;}
  const el=document.getElementById('sub-aud-preview');if(!el)return;
  const url=URL.createObjectURL(f);
  el.innerHTML=`<div style="padding:10px;background:var(--bg2);border-radius:var(--r);margin-top:8px;display:flex;align-items:center;gap:10px"><span style="font-size:20px">🎵</span><span style="font-size:13px;color:var(--tx2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span><audio src="${url}" controls style="height:30px"></audio></div>`;
}

window.openSubmit=openSubmit; window.closeSubmit=closeSubmit; window.switchSubTab=switchSubTab;
window.resetPollForm=resetPollForm; window.resetVidPollForm=resetVidPollForm; window.doSubmitPost=doSubmitPost;
window.appendPollToForm=appendPollToForm; window.initComPicker=initComPicker;
window.previewSubImg=previewSubImg; window.clearSubImg=clearSubImg; window.previewSubVid=previewSubVid; window.previewSubAud=previewSubAud;
