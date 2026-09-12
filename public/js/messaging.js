'use strict';
let _chatWith = null, _rendered = new Set();

/* ═══ SUHBATLAR ═══ */
function convLastText(last) {
  if (!last) return '';
  if (last.type === 'image') return '📷 Rasm';
  if (last.type === 'voice') return '🎙️ Ovozli xabar';
  return (last.body || '').slice(0, 42);
}
async function loadConvos() {
  document.querySelector('.msg-wrap')?.classList.remove('chat-open');
  try {
    const convos = await API.messages();
    loadContactsScroll(convos);
    const el = document.getElementById('conv-list'); if (!el) return;
    el.innerHTML = '';
    if (!convos.length) { el.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--tx4)"><div style="font-size:32px;margin-bottom:8px;opacity:.5">💬</div><div style="font-size:13px">Hozircha xabar yo'q.</div></div>`; return; }
    convos.forEach((cv,i) => {
      const o = cv.other;
      const d = document.createElement('div');
      d.className = 'conv' + (_chatWith?.id===o.id?' active':''); d.dataset.uid = o.id;
      d.style.animation = `fadeUp .2s ease ${i*.04}s both`;
      d.onclick = () => openChat(o);
      d.innerHTML = `<div class="av" style="${avStyle(o,40)};border-radius:50%;flex-shrink:0">${avHtml(o,40,14)}</div>
        <div style="flex:1;min-width:0"><div class="conv-name">${esc(o.name||o.username)}</div><div class="conv-prev">${cv.last?esc(convLastText(cv.last)):"Suhbatni boshlang..."}</div></div>
        ${cv.unread>0?'<div class="conv-dot"></div>':''}`;
      el.appendChild(d);
    });
  } catch(e) { console.error('loadConvos:', e); }
}
function loadContactsScroll(convos) {
  const el = document.getElementById('contacts-scroll'); if (!el) return;
  try {
    if (!convos || !convos.length) { el.style.display='none'; return; }
    el.innerHTML = '';
    el.style.display = 'flex';
    convos.slice(0,20).forEach(cv => {
      const o = cv.other;
      const btn = document.createElement('div');
      btn.className = 'contact-bubble';
      btn.onclick = () => openChat(o);
      btn.innerHTML = `
        <div class="contact-av" style="${avStyle(o,46)};border-radius:50%;position:relative;flex-shrink:0">
          ${avHtml(o,46,14)}
          ${cv.unread>0?'<div style="position:absolute;top:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:var(--red);border:2px solid var(--surface)"></div>':''}
        </div>
        <div class="contact-name">${esc((o.name||o.username).split(' ')[0])}</div>`;
      el.appendChild(btn);
    });
  } catch {}
}
function filterConvos(q) {
  document.querySelectorAll('#conv-list .conv').forEach(el => {
    const name = (el.querySelector('.conv-name')?.textContent||'').toLowerCase();
    el.style.display = (!q || name.includes(q.toLowerCase())) ? '' : 'none';
  });
}

async function openChat(user) {
  _chatWith = user; _rendered.clear();
  document.querySelector('.msg-wrap')?.classList.add('chat-open');
  document.getElementById('chat-empty').style.display = 'none';
  const panel = document.getElementById('chat-panel'); panel.classList.add('vis');
  const hd = document.getElementById('chat-hd-inner');
  hd.innerHTML = `
    <button class="msg-back-btn" onclick="closeChatMobile()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg></button>
    <div class="av" style="${avStyle(user,40)};border-radius:50%;flex-shrink:0;cursor:pointer" onclick="openUser('${escJs(user.username)}')">${avHtml(user,40,14)}</div>
    <div style="flex:1;min-width:0;cursor:pointer" onclick="openUser('${escJs(user.username)}')">
      <div style="font-size:14px;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(user.name||user.username)}</div>
      <div style="font-size:11px;color:var(--tx4);display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:${user.online?'var(--grn)':'var(--tx4)'}"></span>${user.online?'Onlayn':'Oflayn'}</div>
    </div>
    <div style="display:flex;gap:6px">
      <div class="chat-hd-btn" onclick="startVoiceCall()" title="Ovozli qo'ng'iroq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></div>
      <div class="chat-hd-btn" onclick="startVideoCall()" title="Video qo'ng'iroq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>
    </div>`;
  document.querySelectorAll('.conv').forEach(r=>r.classList.toggle('active', r.dataset.uid===user.id));
  try {
    const msgs = await API.thread(user.id);
    const b = document.getElementById('chat-msgs'); b.innerHTML=''; _rendered.clear();
    if (!msgs.length) b.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--tx4);font-size:13px">Suhbatni boshlang! 👋</div>`;
    else msgs.forEach(m => addBubble(m, m.from_id===window._me?.id));
    b.scrollTop = b.scrollHeight;
  } catch(e) { console.error('openChat:', e); }
  setTimeout(()=>document.getElementById('chat-inp')?.focus(), 150);
}
function closeChatMobile() { document.querySelector('.msg-wrap')?.classList.remove('chat-open'); document.querySelectorAll('.conv').forEach(r=>r.classList.remove('active')); }

function addBubble(msg, isMe) {
  if (_rendered.has(msg.id)) return;
  _rendered.add(msg.id);
  const b = document.getElementById('chat-msgs'); if (!b) return;
  b.querySelector('[style*="flex:1"]')?.remove();
  const d = document.createElement('div');
  d.className = 'bubble ' + (isMe?'me':'them'); d.id = 'bbl-'+msg.id;
  let bodyHtml;
  if (msg.type === 'voice') {
    const bars = Array.from({length:18},(_,i)=>`<span style="height:${4+Math.round(Math.abs(Math.sin(i*.8))*13)}px"></span>`).join('');
    bodyHtml = `<div class="voice-msg-bubble"><div class="voice-play-btn" onclick="playVoiceMsg(this,'${escJs(msg.audio_url||'')}')">▶</div><div class="voice-bars">${bars}</div><span style="font-size:11px">${esc(msg.duration||'0:00')}</span></div>`;
  } else if (msg.type === 'image') {
    bodyHtml = `<div class="chat-img-bubble"><img src="${esc(msg.image_url||'')}" onclick="window.open('${escJs(msg.image_url||'')}','_blank')" alt="Rasm"></div>`;
  } else bodyHtml = esc(msg.body);
  const delBtn = isMe ? `<span onclick="deleteMsg('${msg.id}',this.closest('.bubble'))" style="cursor:pointer;margin-left:6px;opacity:.6">🗑</span>` : '';
  d.innerHTML = `${bodyHtml}<div class="b-time">${msg.ago||'Hozir'}${delBtn}</div>`;
  b.appendChild(d);
  b.scrollTo({ top: b.scrollHeight, behavior:'smooth' });
}
async function deleteMsg(msgId, bubbleEl) {
  if (/^(vm|img)-\d+$/.test(String(msgId))) { bubbleEl.remove(); return; } // hali yuklanmagan vaqtinchalik bubble
  try { await API.delMsg(msgId); bubbleEl.style.opacity='0'; setTimeout(()=>bubbleEl.remove(),200); loadConvos(); }
  catch(e) { toast(e.message); }
}
function playVoiceMsg(btn, url) {
  if (!url) { toast('Audio mavjud emas'); return; }
  if (btn._audio) { if (btn._audio.paused) { btn._audio.play(); btn.innerHTML='⏸'; } else { btn._audio.pause(); btn.innerHTML='▶'; } return; }
  document.querySelectorAll('.voice-play-btn[data-playing]').forEach(b=>{ if(b._audio){b._audio.pause();b.innerHTML='▶';b.removeAttribute('data-playing');} });
  const audio = new Audio(url); btn._audio = audio; btn.setAttribute('data-playing','1');
  audio.onended = () => { btn.innerHTML='▶'; btn.removeAttribute('data-playing'); };
  audio.play().then(()=>btn.innerHTML='⏸').catch(()=>toast('Ijro etilmadi'));
}
async function sendMsg() {
  if (!_chatWith) { toast('Avval suhbatdosh tanlang'); return; }
  const inp = document.getElementById('chat-inp'); const body = (inp.value||'').trim(); if (!body) return;
  inp.value = '';
  try { await API.sendMsg(_chatWith.id, body); } catch(e) { inp.value = body; toast(e.message); }
}
async function sendChatImage(inp) {
  if (!inp.files?.[0] || !_chatWith) return;
  const file = inp.files[0]; inp.value = '';
  if (file.size > 10*1024*1024) { toast('Rasm 10MB dan oshmasin'); return; }
  const tempId = 'img-'+Date.now();
  addBubble({ id:tempId, type:'image', image_url:URL.createObjectURL(file), ago:'Hozir' }, true);
  try { const fd = new FormData(); fd.append('image',file); fd.append('to_id',_chatWith.id); await API.sendChatImage(fd); }
  catch(e) { toast(e.message); document.getElementById('bbl-'+tempId)?.remove(); }
}
function initMsgWS() {
  WS.on('del_msg', d => { document.getElementById('bbl-'+d.data?.id)?.remove(); loadConvos(); });
  WS.on('new_msg', d => {
    if (!d.data?.msg) return;
    const body = String(d.data.msg.body||''); const who = d.data.from?.name||d.data.from?.username||'Foydalanuvchi';
    const inThisChat = curSec()==='msgs' && _chatWith?.id===d.data.msg.from_id;
    if (!inThisChat) { toast('💬 '+who+': '+body.slice(0,36)); showBrowserNotif('MindHub — Yangi xabar', who+': '+body.slice(0,60), d.data.from?.avatar); }
    else addBubble({ ...d.data.msg, ago:'Hozir' }, false);
    loadConvos();
  });
  WS.on('msg_sent', d => { if (_chatWith?.id===d.data?.msg?.to_id) addBubble({ ...d.data.msg, ago:'Hozir' }, true); loadConvos(); });
}
async function startChat(username) {
  if (!window._me) { showAuthModal(); return; }
  goSec('msgs');
  try { const u = await API.getUser(username); await loadConvos(); openChat(u); }
  catch(e) { toast(e.message); }
}

/* ═══ OVOZLI XABAR YOZISH ═══ */
let _mediaRecorder=null, _audioChunks=[], _voiceTimer=null, _voiceSeconds=0;
function startVoiceRec() {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Mikrofon mavjud emas'); return; }
  navigator.mediaDevices.getUserMedia({audio:true}).then(stream => {
    _audioChunks = []; _mediaRecorder = new MediaRecorder(stream);
    _mediaRecorder.ondataavailable = e => { if (e.data.size>0) _audioChunks.push(e.data); };
    _mediaRecorder.start(100);
    document.getElementById('chat-inp-row').style.display='none';
    document.getElementById('voice-rec-bar').style.display='flex';
    _voiceSeconds = 0;
    _voiceTimer = setInterval(()=>{ _voiceSeconds++; const m=Math.floor(_voiceSeconds/60),s=_voiceSeconds%60; const el=document.getElementById('voice-rec-timer'); if(el) el.textContent=m+':'+(s<10?'0':'')+s; if(_voiceSeconds>=120) sendVoiceMsg(); },1000);
  }).catch(()=>toast('Mikrofonga ruxsat berilmadi'));
}
function cancelVoice() {
  if (_mediaRecorder?.state!=='inactive') { _mediaRecorder?.stream?.getTracks().forEach(t=>t.stop()); _mediaRecorder?.stop(); }
  clearInterval(_voiceTimer); _audioChunks=[]; _voiceSeconds=0;
  document.getElementById('voice-rec-bar').style.display='none'; document.getElementById('chat-inp-row').style.display='flex';
}
function sendVoiceMsg() {
  if (!_mediaRecorder) return;
  clearInterval(_voiceTimer); const dur = _voiceSeconds;
  _mediaRecorder.onstop = async () => {
    const blob = new Blob(_audioChunks, {type:'audio/webm'}); _audioChunks=[];
    const durStr = Math.floor(dur/60)+':'+(dur%60<10?'0':'')+dur%60;
    const tempId = 'vm-'+Date.now();
    addBubble({ id:tempId, type:'voice', audio_url:URL.createObjectURL(blob), duration:durStr, ago:'Hozir' }, true);
    if (_chatWith) {
      try { const fd=new FormData(); fd.append('voice',blob,'voice.webm'); fd.append('to_id',_chatWith.id); fd.append('duration',durStr); await API.sendVoice(fd); }
      catch(e) { toast(e.message||'Yuborilmadi'); document.getElementById('bbl-'+tempId)?.remove(); }
    }
  };
  if (_mediaRecorder.state!=='inactive') { _mediaRecorder.stream?.getTracks().forEach(t=>t.stop()); _mediaRecorder.stop(); }
  document.getElementById('voice-rec-bar').style.display='none'; document.getElementById('chat-inp-row').style.display='flex'; _voiceSeconds=0;
}

/* ═══ WEBRTC QO'NG'IROQLAR ═══ */
let _pc=null, _localStream=null, _callType=null, _callWith=null, _callTimerInterval=null, _callSecs=0, _pendingOffer=null;
const STUN = { iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'}] };
function startVideoCall(){ if(!_chatWith){toast('Avval suhbatdosh tanlang');return;} initiateCall('video',_chatWith); }
function startVoiceCall(){ if(!_chatWith){toast('Avval suhbatdosh tanlang');return;} initiateCall('audio',_chatWith); }
async function initiateCall(type,user) {
  _callType=type; _callWith=user;
  try { _localStream = await navigator.mediaDevices.getUserMedia(type==='video'?{video:true,audio:true}:{audio:true}); }
  catch { toast('Mikrofon/kameraga ruxsat berilmadi'); return; }
  _pc = new RTCPeerConnection(STUN);
  _localStream.getTracks().forEach(t=>_pc.addTrack(t,_localStream));
  _pc.onicecandidate = e=>{ if(e.candidate) API.callIce(user.id,e.candidate).catch(()=>{}); };
  _pc.ontrack = e=>_attachRemoteStream(e.streams[0]);
  _pc.onconnectionstatechange = ()=>{ if(_pc?.connectionState==='connected') _startCallTimer(); };
  showCallUI(type,user,'calling');
  if (type==='video') { const lv=document.getElementById('call-local-vid'); if(lv) lv.srcObject=_localStream; }
  try { const offer=await _pc.createOffer(); await _pc.setLocalDescription(offer); await API.callOffer(user.id,type,offer); }
  catch { endCall(); toast("Qo'ng'iroq boshlanmadi"); }
}
async function acceptCall() {
  const data=_pendingOffer; if(!data) return; _pendingOffer=null;
  _callType=data.call_type||'audio'; _callWith={id:data.from_id,name:data.from_name,username:data.from_username,avatar:data.from_avatar,color:data.from_color};
  stopRingtone();
  try { _localStream = await navigator.mediaDevices.getUserMedia(_callType==='video'?{video:true,audio:true}:{audio:true}); }
  catch { toast('Ruxsat berilmadi'); API.callReject(data.from_id).catch(()=>{}); removeCallUI(); return; }
  _pc = new RTCPeerConnection(STUN);
  _localStream.getTracks().forEach(t=>_pc.addTrack(t,_localStream));
  _pc.onicecandidate = e=>{ if(e.candidate) API.callIce(data.from_id,e.candidate).catch(()=>{}); };
  _pc.ontrack = e=>_attachRemoteStream(e.streams[0]);
  _pc.onconnectionstatechange = ()=>{ if(_pc?.connectionState==='connected') _startCallTimer(); };
  showCallUI(_callType,_callWith,'connected');
  if (_callType==='video') { const lv=document.getElementById('call-local-vid'); if(lv) lv.srcObject=_localStream; }
  try { await _pc.setRemoteDescription(new RTCSessionDescription(data.offer)); const answer=await _pc.createAnswer(); await _pc.setLocalDescription(answer); await API.callAnswer(data.from_id,answer); }
  catch { endCall(); }
}
async function rejectCall(fromId) { stopRingtone(); _pendingOffer=null; removeCallUI(); if(fromId) await API.callReject(fromId).catch(()=>{}); }
function endCall() {
  clearInterval(_callTimerInterval); _callTimerInterval=null; _callSecs=0;
  if (_localStream) { _localStream.getTracks().forEach(t=>t.stop()); _localStream=null; }
  if (_pc) { try{_pc.close();}catch{} _pc=null; }
  stopRingtone();
  if (_callWith) API.callEnd(_callWith.id).catch(()=>{});
  _callWith=null; _callType=null; _pendingOffer=null; removeCallUI();
}
function _attachRemoteStream(stream) {
  const rv=document.getElementById('call-remote-vid'); const ra=document.getElementById('call-remote-aud');
  if (rv&&stream) { rv.srcObject=stream; rv.style.display='block'; document.getElementById('call-no-cam')?.style.setProperty('display','none'); }
  if (ra&&stream) { ra.srcObject=stream; ra.play().catch(()=>{}); }
}
function _startCallTimer() {
  _callSecs=0; clearInterval(_callTimerInterval);
  _callTimerInterval = setInterval(()=>{ _callSecs++; const m=Math.floor(_callSecs/60),s=_callSecs%60; const el=document.getElementById('call-timer'); if(el) el.textContent=m+':'+(s<10?'0':'')+s; const st=document.getElementById('call-status'); if(st) st.textContent='Ulandi ✓'; },1000);
}
function toggleCallMic(){ if(!_localStream)return; const t=_localStream.getAudioTracks()[0]; if(!t)return; t.enabled=!t.enabled; document.getElementById('call-mic-btn')?.classList.toggle('off',!t.enabled); }
function toggleCallCam(){ if(!_localStream)return; const t=_localStream.getVideoTracks()[0]; if(!t)return; t.enabled=!t.enabled; document.getElementById('call-cam-btn')?.classList.toggle('off',!t.enabled); }
function toggleSpeaker(){ const a=document.getElementById('call-remote-aud'); if(!a)return; a.muted=!a.muted; document.getElementById('call-spk-btn')?.classList.toggle('off',a.muted); }
let _ringtoneCtx=null,_ringtoneTimer=null;
function playRingtone() {
  stopRingtone(); const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx) return;
  try {
    _ringtoneCtx = new Ctx(); const ctx=_ringtoneCtx;
    const play=(f,t)=>{ const o=ctx.createOscillator(),g=ctx.createGain(); o.connect(g);g.connect(ctx.destination); o.frequency.value=f; g.gain.value=.08; o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+.2); };
    const loop=()=>{ if(_ringtoneCtx!==ctx||ctx.state==='closed') return; try{play(880,0);play(660,.25);}catch{return;} _ringtoneTimer=setTimeout(loop,2000); };
    loop();
  } catch {}
}
function stopRingtone(){ clearTimeout(_ringtoneTimer); _ringtoneTimer=null; const c=_ringtoneCtx; _ringtoneCtx=null; try{c?.close();}catch{} }
function removeCallUI(){ const ui=document.getElementById('call-ui'); if(ui){ui.style.opacity='0';setTimeout(()=>ui.remove(),200);} }
function showCallUI(type,user,state) {
  removeCallUI();
  const color=user.color||'#C8922A', av=initials(user.name||user.username);
  const statusTxt = state==='calling'?'Chaqirilmoqda...':'Ulandi ✓';
  const avatarHtml = user.avatar ? '<img src="'+esc(user.avatar)+'" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '<div style="width:100%;height:100%;border-radius:50%;background:'+color+';display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#fff">'+av+'</div>';
  const div=document.createElement('div'); div.id='call-ui'; div.className='call-overlay';
  if (type==='video') {
    div.innerHTML='<div class="call-card" style="width:min(560px,96vw);border-radius:22px"><div style="position:relative;aspect-ratio:16/10;background:#05060d">'+
      '<div id="call-no-cam" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0b0d16,#151a2c)"><div style="width:88px;height:88px;border-radius:50%;overflow:hidden">'+avatarHtml+'</div></div>'+
      '<video id="call-remote-vid" autoplay playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none"></video>'+
      '<video id="call-local-vid" autoplay playsinline muted style="position:absolute;bottom:14px;right:14px;width:110px;height:82px;object-fit:cover;border-radius:14px;border:2px solid rgba(255,255,255,.22);background:#000;z-index:2"></video>'+
      '<div style="position:absolute;top:0;left:0;right:0;padding:14px 18px;display:flex;gap:10px;background:linear-gradient(rgba(0,0,0,.6),transparent)"><div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:700;color:#fff">'+esc(user.name||user.username)+'</div><div style="font-size:12px;color:rgba(255,255,255,.55)"><span id="call-status">'+statusTxt+'</span></div></div><div id="call-timer" style="font-size:13px;font-weight:700;color:#fff;background:rgba(0,0,0,.4);padding:5px 12px;border-radius:99px"></div></div>'+
      '<div style="position:absolute;bottom:0;left:0;right:0;padding:20px 18px;display:flex;justify-content:center;gap:18px;background:linear-gradient(transparent,rgba(0,0,0,.62))">'+
        '<button id="call-mic-btn" class="call-ctl" onclick="toggleCallMic()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg></button>'+
        '<button id="call-cam-btn" class="call-ctl" onclick="toggleCallCam()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></button>'+
        '<button class="call-ctl call-ctl-primary call-ctl-end" onclick="endCall()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="26"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6z"/></svg></button>'+
      '</div></div></div>';
  } else {
    div.innerHTML='<div class="call-card" style="width:min(340px,92vw);padding:46px 24px 34px;display:flex;flex-direction:column;align-items:center;gap:22px">'+
      '<div class="call-avatar-wrap"><div class="call-ring" style="border-color:'+color+'"></div><div class="call-ring" style="border-color:'+color+'"></div><div style="width:96px;height:96px;border-radius:50%;overflow:hidden;position:relative;z-index:1">'+avatarHtml+'</div></div>'+
      '<div style="text-align:center"><div style="font-size:22px;font-weight:800;color:#fff">'+esc(user.name||user.username)+'</div><div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:6px"><span id="call-status">'+statusTxt+'</span></div><div style="font-size:14px;font-weight:700;color:'+color+';margin-top:5px" id="call-timer"></div></div>'+
      '<audio id="call-remote-aud" autoplay style="display:none"></audio>'+
      '<div style="display:flex;gap:18px"><button id="call-mic-btn" class="call-ctl" onclick="toggleCallMic()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg></button>'+
      '<button class="call-ctl call-ctl-primary call-ctl-end" onclick="endCall()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="26"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6z"/></svg></button>'+
      '<button id="call-spk-btn" class="call-ctl" onclick="toggleSpeaker()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg></button></div></div>';
  }
  document.body.appendChild(div);
}
function showIncomingCallUI(data) {
  removeCallUI();
  const color=data.from_color||'#C8922A', av=initials(data.from_name||data.from_username||'?');
  const label = data.call_type==='video'?"📹 Video qo'ng'iroq":"📞 Ovozli qo'ng'iroq";
  const avatarHtml = data.from_avatar ? '<img src="'+esc(data.from_avatar)+'" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '<div style="width:100%;height:100%;border-radius:50%;background:'+color+';display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#fff">'+av+'</div>';
  const div=document.createElement('div'); div.id='call-ui'; div.className='call-overlay';
  div.innerHTML='<div class="call-card" style="width:min(360px,92vw);padding:44px 26px 36px;display:flex;flex-direction:column;align-items:center;gap:22px">'+
    '<div class="call-avatar-wrap"><div class="call-ring" style="border-color:'+color+'"></div><div class="call-ring" style="border-color:'+color+'"></div><div style="width:100px;height:100px;border-radius:50%;overflow:hidden;position:relative;z-index:1">'+avatarHtml+'</div></div>'+
    '<div style="text-align:center"><div style="font-size:23px;font-weight:800;color:#fff">'+esc(data.from_name||data.from_username)+'</div><div style="font-size:14px;font-weight:600;color:'+color+';margin-top:7px">'+label+'</div></div>'+
    '<div style="display:flex;gap:34px;margin-top:14px"><button class="call-ctl call-ctl-primary call-ctl-end" onclick="rejectCall(\''+escJs(data.from_id)+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="26"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'+
    '<button class="call-ctl call-ctl-primary call-ctl-ok" onclick="acceptCall()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="26"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6z"/></svg></button></div></div>';
  document.body.appendChild(div);
  playRingtone();
  showBrowserNotif(label, (data.from_name||data.from_username)+" sizga qo'ng'iroq qilyapti", data.from_avatar);
}
function initCallWS() {
  WS.on('call_offer', d => { _pendingOffer = d.data||d; showIncomingCallUI(_pendingOffer); });
  WS.on('call_answer', async d => { const data=d.data||d; if(!_pc) return; try{ await _pc.setRemoteDescription(new RTCSessionDescription(data.answer)); }catch{} });
  WS.on('ice_candidate', async d => { const data=d.data||d; if(!_pc||!data.candidate) return; try{ await _pc.addIceCandidate(new RTCIceCandidate(data.candidate)); }catch{} });
  WS.on('call_ended', () => { toast("📞 Qo'ng'iroq tugadi"); endCall(); });
  WS.on('call_rejected', () => { toast("📞 Qo'ng'iroq rad etildi"); endCall(); });
}

window.loadConvos=loadConvos; window.loadContactsScroll=loadContactsScroll; window.filterConvos=filterConvos; window.openChat=openChat; window.closeChatMobile=closeChatMobile;
window.addBubble=addBubble; window.deleteMsg=deleteMsg; window.playVoiceMsg=playVoiceMsg; window.sendMsg=sendMsg; window.sendChatImage=sendChatImage;
window.initMsgWS=initMsgWS; window.startChat=startChat;
window.startVoiceRec=startVoiceRec; window.cancelVoice=cancelVoice; window.sendVoiceMsg=sendVoiceMsg;
window.startVideoCall=startVideoCall; window.startVoiceCall=startVoiceCall; window.acceptCall=acceptCall; window.rejectCall=rejectCall; window.endCall=endCall;
window.toggleCallMic=toggleCallMic; window.toggleCallCam=toggleCallCam; window.toggleSpeaker=toggleSpeaker; window.initCallWS=initCallWS;
