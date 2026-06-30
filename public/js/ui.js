import { state } from './state.js';
import { DOM } from './dom.js';
import { utils } from './utils.js';
import { REACTIONS } from './config.js';
import { pwa } from './pwa.js';

function statusIcon(s) {
    const svg = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    return s === 'read'
        ? `<span class="ticks ticks-read" aria-label="خوانده شد"><span class="tick tick-1">${svg}</span><span class="tick tick-2">${svg}</span></span>`
        : `<span class="ticks ticks-sent" aria-label="ارسال شد"><span class="tick">${svg}</span></span>`;
}

export const ui = {
    switchScreen(isChat) { DOM.loginScreen.classList.toggle('hidden', isChat); DOM.chatScreen.classList.toggle('hidden', !isChat); },
    setHeader() { DOM.chatTitle.textContent = state.other; DOM.userInitial.textContent = state.other?.[0]?.toUpperCase() || '●'; },
    toggleSendBtn() { const has = DOM.messageInput.value.trim().length > 0; DOM.sendBtn.classList.toggle('hidden', !has); DOM.voiceBtn.classList.toggle('hidden', has); },

    createMessage(msg) {
        const isOut = msg.sender === state.user;
        const el = document.createElement('div');
        el.className = `message ${isOut ? 'outgoing' : 'incoming'}`;
        el.dataset.id = msg.id;
        el.dataset.sender = msg.sender;

        let replyBlock = '';
        if (msg.replyTo?.id) {
            const p = msg.replyTo.type === 'text' ? (msg.replyTo.text || '') : msg.replyTo.type === 'image' ? 'عکس' : msg.replyTo.type === 'audio' ? 'صدا' : 'پیام';
            replyBlock = `<div class="reply-in-message"><div class="reply-in-title">ریپلای به ${utils.escape(msg.replyTo.sender || 'کاربر')}</div><div class="reply-in-text">${utils.escape(String(p).slice(0, 60))}</div></div>`;
        }

        let content = '';
        if (msg.type === 'text') content = `<div class="message-content">${utils.escape(msg.text)}</div>`;
        else if (msg.type === 'image') content = `<div class="message-media"><img src="${msg.file.url}" loading="lazy" data-open-image="1" alt="image"></div>`;
        else if (msg.type === 'audio') {
            content = `<div class="message-voice"><button class="voice-btn" data-play-voice="1"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button><div class="voice-timeline"><div class="voice-wave" aria-hidden="true">${'<span></span>'.repeat(10)}</div><div class="voice-bar"><div class="voice-bar-fill"></div></div></div><div class="voice-times"><span class="voice-current">0:00</span><span class="voice-duration">${utils.duration(msg.file.duration || 0)}</span></div><audio hidden preload="none" data-voice-audio="1"><source src="${msg.file.url}"></audio></div>`;
        }

        const reactions = msg.reactions && typeof msg.reactions === 'object' ? msg.reactions : {};
        const chips = Object.entries(reactions).filter(([e, u]) => REACTIONS.includes(e) && Array.isArray(u) && u.length > 0).map(([e, u]) => `<span class="reaction-chip" data-react-id="${msg.id}" data-react-emoji="${utils.escape(e)}">${e} <span class="reaction-count">${u.length}</span></span>`).join('');
        const reactionsBlock = chips ? `<div class="message-reactions">${chips}</div>` : '';

        const isRead = isOut && Array.isArray(msg.readBy) && state.other && msg.readBy.includes(state.other);
        const editedBadge = msg.editedAt ? `<span class="message-edited" title="ویرایش شده">ویرایش‌شده</span>` : '';
        const editBtn = (isOut && msg.type === 'text') ? `<button type="button" class="reply-btn" data-edit-id="${msg.id}" aria-label="ویرایش"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>` : '';
        const reactBtn = `<button type="button" class="reply-btn" data-react-id="${msg.id}" aria-label="ری‌اکشن"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></svg></button>`;
        const meta = `<div class="message-meta"><button type="button" class="reply-btn" data-reply-id="${msg.id}" aria-label="ریپلای"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></svg></button>${editBtn}${reactBtn}${editedBadge}${isOut ? `<span class="message-status ${isRead ? 'read' : 'sent'}">${statusIcon(isRead ? 'read' : 'sent')}</span>` : ''}<span class="message-time">${utils.time(msg.createdAt)}</span></div>`;

        el.innerHTML = replyBlock + content + reactionsBlock + meta;
        return el;
    },

    insertDaySeparatorIfNeeded(iso) {
        if (!DOM.messages) return;
        const key = utils.dayKey(iso);
        if (state.lastDayKey === key) return;
        state.lastDayKey = key;
        const wrap = document.createElement('div');
        wrap.className = 'date-separator day-separator';
        wrap.innerHTML = `<span>${utils.escape(utils.dayLabel(iso))}</span>`;
        DOM.messages.appendChild(wrap);
    },

    addMessage(msg, scroll = true, observeCb) {
        state.messageMap.set(msg.id, msg);
        if (state.rendered.has(msg.id)) return;
        state.rendered.add(msg.id);
        ui.insertDaySeparatorIfNeeded(msg.createdAt);
        const el = ui.createMessage(msg);
        DOM.messages.appendChild(el);
        state.messageElMap.set(msg.id, el);
        if (msg.sender !== state.user && observeCb) observeCb(el);
        if (scroll) DOM.messages.scrollTop = DOM.messages.scrollHeight;
    },

    renderMessages(msgs) {
        DOM.messages.innerHTML = '';
        state.lastDayKey = null;
        state.rendered.clear();
        state.messageMap.clear();
        state.messageElMap.clear();
        [...msgs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(m => ui.addMessage(m, false));
        DOM.messages.scrollTop = DOM.messages.scrollHeight;
        pwa.updateUnreadBadge();
    },

    scrollToMessage(id) {
        const el = state.messageElMap.get(id);
        if (!el || !DOM.messages) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('message-highlight');
        setTimeout(() => el.classList.remove('message-highlight'), 1600);
    },

    renderArchive(messages) {
        const imgs = (messages || []).filter(m => m?.type === 'image' && m.file?.url);
        const voices = (messages || []).filter(m => m?.type === 'audio' && m.file?.url);
        if (DOM.archiveImages) {
            DOM.archiveImages.innerHTML = imgs.length ? imgs.map(m => `<button type="button" class="archive-thumb" data-archive-msg="${m.id}" aria-label="عکس"><img src="${m.file.url}" loading="lazy" alt=""><span class="archive-thumb-meta">${utils.escape(m.sender)} · ${utils.time(m.createdAt)}</span></button>`).join('') : '<div class="archive-empty">عکسی نیست</div>';
            DOM.archiveImages.querySelectorAll('[data-archive-msg]').forEach(btn => { btn.onclick = () => ui.scrollToMessage(btn.dataset.archiveMsg); });
        }
        if (DOM.archiveVoices) {
            DOM.archiveVoices.innerHTML = voices.length ? voices.map(m => { const dur = m.file.duration ? utils.duration(m.file.duration) : ''; return `<div class="archive-voice-row"><div class="archive-voice-info"><strong>${utils.escape(m.sender)}</strong><span>${utils.time(m.createdAt)}${dur ? ` · ${dur}` : ''}</span></div><div class="archive-voice-actions"><button type="button" class="archive-voice-play" data-archive-play="${encodeURIComponent(m.file.url)}">پخش</button><button type="button" class="archive-voice-jump" data-archive-msg="${m.id}">در چت</button></div><audio class="archive-audio" preload="none" src="${m.file.url}"></audio></div>`; }).join('') : '<div class="archive-empty">ویسی نیست</div>';
            DOM.archiveVoices.querySelectorAll('[data-archive-play]').forEach(btn => { btn.onclick = () => { const a = btn.closest('.archive-voice-row')?.querySelector('.archive-audio'); if (a) a.play().catch(() => {}); else new Audio(decodeURIComponent(btn.dataset.archivePlay)).play().catch(() => {}); }; });
            DOM.archiveVoices.querySelectorAll('[data-archive-msg]').forEach(btn => { btn.onclick = () => ui.scrollToMessage(btn.dataset.archiveMsg); });
        }
    },

    updatePresence(online, at) { state.otherActive = Boolean(online); state.otherLastActiveAt = at || null; if (DOM.presenceDot) DOM.presenceDot.classList.toggle('offline', !state.otherActive); if (DOM.presenceText) DOM.presenceText.textContent = state.otherTyping ? 'در حال تایپ…' : (state.otherActive ? 'آنلاین' : 'آفلاین'); },
    updateTyping(t) { state.otherTyping = Boolean(t); if (DOM.presenceText) DOM.presenceText.textContent = state.otherTyping ? 'در حال تایپ…' : (state.otherActive ? 'آنلاین' : 'آفلاین'); },

    updateMessageReadReceipt(msg) {
        if (!msg?.id) return;
        const el = state.messageElMap.get(msg.id);
        if (!el || msg.sender !== state.user) return;
        const isRead = Array.isArray(msg.readBy) && state.other && msg.readBy.includes(state.other);
        const s = el.querySelector('.message-status');
        if (!s) return;
        s.classList.toggle('read', isRead); s.classList.toggle('sent', !isRead);
        s.innerHTML = statusIcon(isRead ? 'read' : 'sent');
    },

    updateMessageText(msg) {
        if (!msg?.id) return;
        const el = state.messageElMap.get(msg.id);
        if (!el) return;
        const c = el.querySelector('.message-content');
        if (c && msg.type === 'text') c.innerHTML = utils.escape(msg.text || '');
        let b = el.querySelector('.message-edited');
        if (msg.editedAt) { if (!b) { b = document.createElement('span'); b.className = 'message-edited'; b.title = 'ویرایش شده'; b.textContent = 'ویرایش‌شده'; const m = el.querySelector('.message-meta'); const t = el.querySelector('.message-time'); if (m && t) m.insertBefore(b, t); } }
        else if (b) b.remove();
    },

    updateMessageReactions(msg) {
        if (!msg?.id) return;
        const el = state.messageElMap.get(msg.id);
        if (!el) return;
        const r = msg.reactions && typeof msg.reactions === 'object' ? msg.reactions : {};
        const chips = Object.entries(r).filter(([e, u]) => REACTIONS.includes(e) && Array.isArray(u) && u.length > 0).map(([e, u]) => `<span class="reaction-chip" data-react-id="${msg.id}" data-react-emoji="${utils.escape(e)}">${e} <span class="reaction-count">${u.length}</span></span>`).join('');
        let block = el.querySelector('.message-reactions');
        if (!chips) { if (block) block.remove(); return; }
        if (!block) { block = document.createElement('div'); block.className = 'message-reactions'; const m = el.querySelector('.message-meta'); if (m) el.insertBefore(block, m); }
        block.innerHTML = chips;
    },
};
