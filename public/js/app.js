import { CONFIG } from './config.js';
import { state } from './state.js';
import { DOM } from './dom.js';
import { api } from './api.js';
import { ui } from './ui.js';
import { handlers } from './handlers.js';
import { realtime } from './realtime.js';
import { pwa } from './pwa.js';
import { notify } from './notify.js';

handlers.setInitChat(chat);

async function config() {
    const cfg = await api.getConfig();
    state.users = cfg.allowedUsers;
}

async function chat(username) {
    state.user = username;
    state.other = state.users.find(u => u !== username);
    ui.setHeader();
    ui.switchScreen(true);
    state.readPendingIds.clear();
    handlers.setupReadObserver();
    handlers.startReadSyncTicker();
    notify.init();
    ui.updatePresence(false, null);
    ui.updateTyping(false);
    handlers.syncPresence();
    handlers.startPresenceTicker();
    const { messages } = await api.getMessages();
    ui.renderMessages(messages);
    state.messageElMap.forEach((el, id) => {
        const msg = state.messageMap.get(id);
        if (msg && msg.sender !== state.user) handlers.observeIncomingMessage(el);
    });
    realtime.connect();
    setTimeout(() => handlers.autoMarkReadIfAppropriate(), 60);
    DOM.messageInput.focus();
}

function restore() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) DOM.username.value = saved;
}

async function autoLogin() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!saved || !state.users.includes(saved)) return;
    try { await chat(saved); } catch { localStorage.removeItem(CONFIG.STORAGE_KEY); }
}

function events() {
    DOM.loginForm.onsubmit = handlers.login;
    DOM.logoutBtn.onclick = handlers.logout;
    DOM.sendBtn.onclick = handlers.sendText;
    DOM.voiceBtn.onclick = handlers.startRecord;
    DOM.voiceDelete.onclick = handlers.deleteRecord;
    DOM.voiceSend.onclick = () => state.recorder?.stop();
    DOM.replyCancel.onclick = handlers.clearReply;
    DOM.editCancel.onclick = () => handlers.clearEdit();
    DOM.emojiBtn.onclick = handlers.showEmoji;
    DOM.emojiClose.onclick = () => DOM.emojiOverlay.classList.add('hidden');
    DOM.emojiOverlay.onclick = (e) => { if (e.target === DOM.emojiOverlay) DOM.emojiOverlay.classList.add('hidden'); };
    DOM.attachBtn.onclick = (e) => { e.stopPropagation(); DOM.attachMenu.classList.toggle('hidden'); };
    DOM.attachPhoto.onclick = () => { DOM.fileInput.click(); DOM.attachMenu.classList.add('hidden'); };
    DOM.attachSticker.onclick = () => { handlers.showStickers(); DOM.attachMenu.classList.add('hidden'); };
    DOM.fileInput.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (!CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) return DOM.toast.textContent = 'فرمت پشتیبانی نمی‌شود', DOM.toast.classList.remove('hidden'), setTimeout(() => DOM.toast.classList.add('hidden'), 3000);
        if (file.size > CONFIG.MAX_IMAGE_SIZE) return DOM.toast.textContent = 'حجم فایل زیاد است', DOM.toast.classList.remove('hidden'), setTimeout(() => DOM.toast.classList.add('hidden'), 3000);
        handlers.showPreview(file);
    };
    DOM.previewSend.onclick = handlers.sendImage;
    DOM.previewCancel.onclick = handlers.closePreview;
    DOM.stickerClose.onclick = () => DOM.stickerOverlay.classList.add('hidden');
    DOM.stickerOverlay.onclick = (e) => { if (e.target === DOM.stickerOverlay) DOM.stickerOverlay.classList.add('hidden'); };
    if (DOM.archiveBtn) DOM.archiveBtn.onclick = () => handlers.showArchive();
    if (DOM.archiveClose) DOM.archiveClose.onclick = () => handlers.closeArchive();
    if (DOM.archiveOverlay) DOM.archiveOverlay.onclick = (e) => { if (e.target === DOM.archiveOverlay) handlers.closeArchive(); };

    DOM.messageInput.oninput = () => {
        if (DOM.messageInput.value.length > CONFIG.MAX_TEXT) {
            DOM.messageInput.value = DOM.messageInput.value.slice(0, CONFIG.MAX_TEXT);
            DOM.toast.textContent = 'حداکثر طول پیام ۲۰۰۰ کاراکتر است';
            DOM.toast.classList.remove('hidden');
            setTimeout(() => DOM.toast.classList.add('hidden'), 3000);
        }
        handlers.onLocalTyping();
        ui.toggleSendBtn();
        DOM.messageInput.style.height = 'auto';
        DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 120) + 'px';
    };
    DOM.messageInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlers.sendText(); } };

    document.onclick = (e) => {
        const r = e.target.closest('[data-reply-id]'); if (r) { handlers.setReplyById(r.dataset.replyId); return; }
        const ed = e.target.closest('[data-edit-id]'); if (ed) { handlers.setEditById(ed.dataset.editId); return; }
        const rc = e.target.closest('[data-react-id]'); if (rc) { handlers.openReactionPicker(rc.dataset.reactId, rc); return; }
        const v = e.target.closest('[data-play-voice]'); if (v) { handlers.playVoice(v); return; }
        const img = e.target.closest('[data-open-image]'); if (img?.src) { window.open(img.src, '_blank', 'noopener,noreferrer'); return; }
        if (state.reactionPicker && !e.target.closest('.reaction-picker')) handlers.closeReactionPicker();
        if (!DOM.attachMenu.contains(e.target) && !DOM.attachBtn.contains(e.target)) DOM.attachMenu.classList.add('hidden');
    };

    DOM.messages?.addEventListener('scroll', () => { if (state.user) handlers.autoMarkReadIfAppropriate(); }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (!state.user) return;
        handlers.sendPresence(handlers.getMyActive()); handlers.syncPresence();
        if (!document.hidden) { realtime.connect(); handlers.autoMarkReadIfAppropriate(); }
        pwa.updateUnreadBadge();
    });
    window.addEventListener('focus', () => { if (!state.user) return; handlers.sendPresence(true); handlers.syncPresence(); handlers.autoMarkReadIfAppropriate(); });
    window.addEventListener('blur', () => { if (!state.user) return; handlers.sendPresence(false); handlers.syncPresence(); api.setTyping(false).catch(() => {}); });
    window.addEventListener('beforeunload', () => { if (!state.user) return; handlers.sendPresence(false); api.setTyping(false).catch(() => {}); });
}

async function start() {
    await pwa.init();
    await config();
    restore();
    events();
    await autoLogin();
}

start();
