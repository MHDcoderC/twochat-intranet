import { state } from './state.js';
import { DOM } from './dom.js';
import { utils } from './utils.js';
import { api } from './api.js';
import { ui } from './ui.js';
import { REACTIONS, CONFIG, EMOJIS } from './config.js';
import { pwa } from './pwa.js';

let init_chat;
export function setInitChat(fn) { init_chat = fn; }

// --- Read receipts ---
function setupReadObserver() {
    teardownReadObserver();
    if (!DOM.messages) return;
    state.readObserver = new IntersectionObserver((entries) => {
        for (const e of entries) { if (!e.isIntersecting) continue; const el = e.target; if (!el?.dataset?.id || el?.dataset?.sender === state.user) continue; queueMarkRead(el.dataset.id); state.readObserver?.unobserve(el); }
    }, { root: DOM.messages, threshold: 0.05, rootMargin: '0px 0px -5% 0px' });
}
function teardownReadObserver() { if (state.readObserver) state.readObserver.disconnect(); state.readObserver = null; }
function observeIncomingMessage(el) { if (!state.readObserver || !el || el.dataset?.sender === state.user) return; state.readObserver.observe(el); }
function shouldAutoMarkReadNow() { return state.user && document.visibilityState === 'visible' && DOM.chatScreen && !DOM.chatScreen.classList.contains('hidden'); }
function collectUnreadIncomingIds() { if (!state.user) return []; const ids = []; for (const [id, msg] of state.messageMap.entries()) { if (!msg || msg.sender === state.user) continue; if (!(Array.isArray(msg.readBy) ? msg.readBy : []).includes(state.user)) ids.push(id); } return ids; }
function autoMarkReadIfAppropriate() { if (!shouldAutoMarkReadNow()) return; const ids = collectUnreadIncomingIds(); ids.forEach(id => queueMarkRead(id)); if (ids.length) setTimeout(() => flushReadQueue(), 20); }
function queueMarkRead(id) { if (!state.user || !id) return; state.readPendingIds.add(String(id)); if (state.readFlushTimer) return; state.readFlushTimer = setTimeout(() => flushReadQueue(), 250); }
async function flushReadQueue() { if (!state.user) return; const ids = [...state.readPendingIds]; state.readPendingIds.clear(); state.readFlushTimer = null; if (!ids.length) return; try { await api.markRead(ids); } catch {} pwa.updateUnreadBadge(); }

// --- Presence ---
function getMyActive() { return document.visibilityState === 'visible'; }
function sendPresence(active) { fetch(`/api/presence?username=${encodeURIComponent(state.user)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }), credentials: 'same-origin', keepalive: true }).catch(() => {}); }
function syncPresence() { if (!state.user) return; const a = getMyActive(); if (state.presenceDebounceTimer) clearTimeout(state.presenceDebounceTimer); state.presenceDebounceTimer = setTimeout(async () => { if (state.user && getMyActive() === a && state.presenceLastSent !== a) { try { sendPresence(a); } catch {} state.presenceLastSent = a; } }, 150); }
function startPresenceTicker() { if (state.presenceTickerTimer) clearInterval(state.presenceTickerTimer); state.presenceTickerTimer = setInterval(() => { if (state.user) syncPresence(); }, 5000); }
function stopPresenceTicker() { if (state.presenceTickerTimer) clearInterval(state.presenceTickerTimer); state.presenceTickerTimer = null; }
function startReadSyncTicker() { stopReadSyncTicker(); state.readSyncTimer = setInterval(async () => { if (!state.user || document.visibilityState !== 'visible' || !DOM.chatScreen || DOM.chatScreen.classList.contains('hidden')) return; try { const { messages } = await api.getMessages(); (messages || []).forEach(msg => { if (!msg?.id) return; state.messageMap.set(msg.id, msg); ui.updateMessageReadReceipt(msg); ui.updateMessageReactions(msg); }); } catch {} }, 2000); }
function stopReadSyncTicker() { if (state.readSyncTimer) clearInterval(state.readSyncTimer); state.readSyncTimer = null; }

// --- Typing ---
function scheduleTypingStop() { if (state.typingStopTimer) clearTimeout(state.typingStopTimer); state.typingStopTimer = setTimeout(() => { if (state.user) api.setTyping(false).catch(() => {}); }, 1800); }
function sendTypingNow(t) { const now = Date.now(); if (t && now - state.lastTypingSentAt < 450) return; state.lastTypingSentAt = now; api.setTyping(Boolean(t)).catch(() => {}); }
function onLocalTyping() { if (!state.user) return; if (state.typingDebounceTimer) clearTimeout(state.typingDebounceTimer); state.typingDebounceTimer = setTimeout(() => { sendTypingNow(true); scheduleTypingStop(); }, 120); }
function handlePresenceUpdate(p) { if (!p || p.username !== state.other) return; ui.updatePresence(Boolean(p.active), p.lastActiveAt); }
function handleTypingUpdate(p) { if (!p || p.username !== state.other) return; ui.updateTyping(Boolean(p.typing)); }

// --- Reply / Edit ---
function setReply(msg) { if (!msg?.id) return; const p = msg.type === 'text' ? (msg.text || '') : msg.type === 'image' ? 'عکس' : msg.type === 'audio' ? 'صدا' : 'پیام'; state.replyTo = { id: msg.id, type: msg.type, sender: msg.sender, text: msg.type === 'text' ? String(msg.text || '') : '' }; DOM.replyBarText.textContent = `${msg.sender}: ${String(p).slice(0, 50)}`; DOM.replyBar?.classList.remove('hidden'); DOM.messageInput.focus(); }
function setReplyById(id) { const msg = state.messageMap.get(id); if (msg) setReply(msg); }
function clearReply() { state.replyTo = null; if (DOM.replyBar) { DOM.replyBarText.textContent = ''; DOM.replyBar.classList.add('hidden'); } }
function setEditById(id) { const msg = state.messageMap.get(id); if (!msg || msg.sender !== state.user || msg.type !== 'text') return; state.editingMessageId = id; if (DOM.editBarText) DOM.editBarText.textContent = String(msg.text || '').slice(0, 80); DOM.editBar?.classList.remove('hidden'); DOM.messageInput.value = String(msg.text || ''); DOM.messageInput.focus(); ui.toggleSendBtn(); }
function clearEdit() { state.editingMessageId = null; if (DOM.editBarText) DOM.editBarText.textContent = ''; DOM.editBar?.classList.add('hidden'); }

// --- Reaction picker ---
function closeReactionPicker() { if (state.reactionPicker) { state.reactionPicker.remove(); state.reactionPicker = null; state.reactionPickerMessageId = null; } }
function openReactionPicker(messageId, anchorEl) {
    closeReactionPicker();
    if (!messageId) return;
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = REACTIONS.map(e => `<button class="reaction-item" type="button" data-react-emoji="${utils.escape(e)}">${e}</button>`).join('');
    document.body.appendChild(picker);
    const rect = anchorEl?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    picker.style.left = `${Math.min(Math.max(10, rect.left + rect.width / 2 - picker.offsetWidth / 2), innerWidth - picker.offsetWidth - 10)}px`;
    picker.style.top = `${Math.min(Math.max(10, rect.top - picker.offsetHeight - 10), innerHeight - picker.offsetHeight - 10)}px`;
    picker.onclick = async (ev) => { const btn = ev.target.closest('[data-react-emoji]'); if (!btn) return; try { const { message } = await api.toggleReaction(messageId, btn.dataset.reactEmoji); state.messageMap.set(message.id, message); ui.updateMessageReactions(message); } catch (err) { utils.toast(err.message); } finally { closeReactionPicker(); } };
    state.reactionPicker = picker;
}

// --- Archive ---
function closeArchive() { DOM.archiveOverlay?.classList.add('hidden'); }
async function showArchive() { if (!state.user) return; try { const { messages } = await api.getMessages(); ui.renderArchive([...(messages || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))); DOM.archiveOverlay?.classList.remove('hidden'); } catch (err) { utils.toast(err.message); } }

// --- Send text ---
async function sendText() {
    const text = DOM.messageInput.value.trim();
    if (!text) return;
    try {
        if (state.editingMessageId) { const { message } = await api.editText(state.editingMessageId, text); state.messageMap.set(message.id, message); ui.updateMessageText(message); clearEdit(); utils.banner('ویرایش شد'); }
        else { await api.sendText(text, state.replyTo); utils.banner('ارسال شد'); }
        api.setTyping(false).catch(() => {});
        DOM.messageInput.value = ''; DOM.messageInput.style.height = 'auto';
        ui.toggleSendBtn(); clearReply();
    } catch (err) { utils.toast(err.message); }
}

// --- Image ---
function showPreview(file) { state.pendingImage = file; DOM.previewThumb.src = URL.createObjectURL(file); DOM.previewName.textContent = file.name; DOM.previewSize.textContent = utils.formatBytes(file.size); DOM.imagePreview.classList.remove('hidden'); DOM.attachMenu.classList.add('hidden'); }
function closePreview() { state.pendingImage = null; DOM.imagePreview.classList.add('hidden'); DOM.previewThumb.src = ''; DOM.fileInput.value = ''; DOM.previewSend.disabled = false; }
async function sendImage() {
    if (!state.pendingImage) return;
    const form = new FormData(); form.append('mediaType', 'image'); form.append('file', state.pendingImage);
    if (state.replyTo) form.append('replyTo', JSON.stringify(state.replyTo));
    DOM.previewSend.disabled = true;
    try { await api.uploadMedia(form); closePreview(); utils.banner('ارسال شد'); clearReply(); } catch (err) { utils.toast(err.message); DOM.previewSend.disabled = false; }
}

// --- Voice ---
async function startRecord() {
    try { state.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return utils.toast('دسترسی به میکروفون نیاز است'); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
    state.recorder = new MediaRecorder(state.stream, { mimeType: mime }); state.chunks = [];
    state.recorder.ondataavailable = e => { if (e.data.size) state.chunks.push(e.data); };
    state.recorder.onstop = finishRecord;
    state.recorder.start(100); state.recording = true; state.recordStart = Date.now();
    DOM.voiceOverlay.classList.remove('hidden');
    state.recordTimer = setInterval(() => { DOM.voiceTimer.textContent = utils.duration((Date.now() - state.recordStart) / 1000); }, 100);
}
async function finishRecord() {
    clearInterval(state.recordTimer); DOM.voiceOverlay.classList.add('hidden'); state.recording = false;
    if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
    if (state.discardRecord || !state.chunks?.length) { state.discardRecord = false; return; }
    const sec = (Date.now() - state.recordStart) / 1000;
    if (sec < 0.5) return utils.toast('صدا خیلی کوتاه بود');
    const blob = new Blob(state.chunks, { type: state.recorder.mimeType });
    const ext = state.recorder.mimeType.includes('mp4') ? '.m4a' : '.webm';
    const file = new File([blob], `voice-${Date.now()}${ext}`, { type: state.recorder.mimeType });
    const form = new FormData(); form.append('mediaType', 'audio'); form.append('file', file);
    if (state.replyTo) form.append('replyTo', JSON.stringify(state.replyTo));
    try { await api.uploadMedia(form); utils.banner('صدا ارسال شد'); clearReply(); } catch (err) { utils.toast(err.message); }
}
function deleteRecord() { state.discardRecord = true; if (state.recorder?.state === 'recording') state.recorder.stop(); }
function playVoice(btn) {
    const wrap = btn.closest('.message-voice'); const audio = wrap.querySelector('audio'); if (!audio) return;
    const fillEl = wrap.querySelector('.voice-bar-fill'); const curEl = wrap.querySelector('.voice-current'); const durEl = wrap.querySelector('.voice-duration');
    const reset = (v) => { v.classList.remove('is-playing'); const f = v.querySelector('.voice-bar-fill'); if (f) f.style.width = '0%'; const c = v.querySelector('.voice-current'); if (c) c.textContent = '0:00'; };
    if (!audio.paused) { audio.pause(); reset(wrap); btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; return; }
    document.querySelectorAll('.message-voice').forEach(v => { const a = v.querySelector('audio'); if (a && a !== audio) { a.pause(); reset(v); } });
    wrap.classList.add('is-playing');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    if (!audio.dataset.voiceEventsBound) {
        audio.dataset.voiceEventsBound = '1';
        audio.addEventListener('loadedmetadata', () => { if (durEl && audio.duration && Number.isFinite(audio.duration) && audio.duration > 0) durEl.textContent = utils.duration(audio.duration); });
        audio.addEventListener('timeupdate', () => { if (!fillEl || !curEl) return; const d = audio.duration || 0; const t = audio.currentTime || 0; if (d > 0) fillEl.style.width = `${Math.max(0, Math.min(1, t / d)) * 100}%`; curEl.textContent = utils.duration(t); });
        audio.addEventListener('ended', () => { reset(wrap); btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; });
    }
    audio.play().catch(() => { reset(wrap); btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; });
}

// --- Emoji ---
function showEmoji() {
    if (!state.emojiPicker) {
        DOM.emojiPicker.innerHTML = EMOJIS.map(e => `<button type="button" class="emoji-item" data-emoji="${e}">${e}</button>`).join('');
        DOM.emojiPicker.classList.add('emoji-grid');
        DOM.emojiPicker.querySelectorAll('[data-emoji]').forEach(item => { item.onclick = () => { DOM.messageInput.value += item.dataset.emoji; ui.toggleSendBtn(); DOM.emojiOverlay.classList.add('hidden'); DOM.messageInput.focus(); }; });
        state.emojiPicker = true;
    }
    DOM.emojiOverlay.classList.remove('hidden');
}

// --- Stickers ---
async function showStickers() {
    DOM.attachMenu.classList.add('hidden');
    if (!state.stickers) { try { const res = await fetch(CONFIG.STICKER_MANIFEST); state.stickers = await res.json(); } catch { state.stickers = { items: [] }; } }
    const items = state.stickers?.items || [];
    if (!items.length) { DOM.stickerGrid.innerHTML = '<div class="sticker-empty">استیکری وجود ندارد</div>'; }
    else { const base = state.stickers?.base || ''; DOM.stickerGrid.innerHTML = items.map(s => `<button class="sticker-item" data-url="${base}${s}"><img src="${base}${s}" loading="lazy" alt=""></button>`).join(''); DOM.stickerGrid.querySelectorAll('.sticker-item').forEach(btn => { btn.onclick = () => sendSticker(btn.dataset.url); }); }
    DOM.stickerOverlay.classList.remove('hidden');
}
async function sendSticker(url) {
    DOM.stickerOverlay.classList.add('hidden');
    try { const res = await fetch(url); const blob = await res.blob(); const file = new File([blob], 'sticker.png', { type: 'image/png' }); const form = new FormData(); form.append('mediaType', 'image'); form.append('file', file); if (state.replyTo) form.append('replyTo', JSON.stringify(state.replyTo)); await api.uploadMedia(form); utils.banner('استیکر ارسال شد'); clearReply(); } catch (err) { utils.toast(err.message); }
}

// --- Auth ---
async function login(e) { e.preventDefault(); const u = utils.normalize(DOM.username.value); if (!u) return utils.toast('نام کاربری را وارد کنید'); if (!state.users.includes(u)) return utils.toast('نام کاربری نامعتبر است.'); localStorage.setItem(CONFIG.STORAGE_KEY, u); await init_chat(u); }
async function logout() {
    try { await api.logout(); } catch {} localStorage.removeItem(CONFIG.STORAGE_KEY);
    state.user = null; state.other = null; state.rendered.clear(); state.messageElMap.clear();
    state.replyTo = null; DOM.replyBar?.classList.add('hidden'); state.messageMap.clear();
    if (state.eventSource) state.eventSource.close();
    teardownReadObserver(); state.readPendingIds.clear();
    if (state.readFlushTimer) clearTimeout(state.readFlushTimer); state.readFlushTimer = null;
    stopReadSyncTicker(); stopPresenceTicker(); closeArchive(); state.lastDayKey = null;
    ui.switchScreen(false);
}

export const handlers = {
    login, logout, sendText, sendImage, showPreview, closePreview,
    startRecord, deleteRecord, playVoice, showEmoji, showStickers, sendSticker,
    setReplyById, clearReply, setEditById, clearEdit,
    openReactionPicker, closeReactionPicker, showArchive, closeArchive,
    onLocalTyping, syncPresence, sendPresence, getMyActive,
    handlePresenceUpdate, handleTypingUpdate,
    setupReadObserver, teardownReadObserver, observeIncomingMessage,
    autoMarkReadIfAppropriate, startPresenceTicker, stopPresenceTicker,
    startReadSyncTicker, stopReadSyncTicker, setInitChat,
};
