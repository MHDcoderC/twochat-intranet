"use strict";

/**
 * Two Chat - Refactored Client
 * Mobile-first, clean architecture, emoji/sticker support
 */

// ==================== CONFIG ====================
const CONFIG = {
    STORAGE_KEY: 'twochat_user',
    TITLE: 'Chat',
    MAX_TEXT: 2000,
    MAX_IMAGE_SIZE: 12 * 1024 * 1024, // 12MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    STICKER_MANIFEST: '/stickers/manifest.json'
};
const REACTIONS = ['💕', '❤️', '😍', '👌'];
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🙂','🙃','😉','🤔','😴','😭','😡','👍','👏','🙏','❤️','💔','🔥','🎉','🌹','🤝','✅','❌','💬','📌','🎯','🚀','⭐','⚡'];

// ==================== STATE ====================
const state = {
    user: null,
    other: null,
    users: [],
    messages: [],
    rendered: new Set(),
    messageElMap: new Map(), // Map<messageId, HTMLElement>
    recording: false,
    recorder: null,
    recordStart: 0,
    recordTimer: null,
    stream: null,
    pendingImage: null,
    stickers: null,
    emojiPicker: null,
    eventSource: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    replyTo: null,
    messageMap: new Map(),
    readObserver: null,
    readPendingIds: new Set(),
    readFlushTimer: null,
    otherActive: false,
    otherLastActiveAt: null,
    otherTyping: false,
    typingStopTimer: null,
    typingDebounceTimer: null,
    lastTypingSentAt: 0,
    presenceLastSent: null,
    presenceDebounceTimer: null,
    bannerTimer: null,
    presenceTickerTimer: null,
    readSyncTimer: null
    ,
    editingMessageId: null
    ,
    reactionPicker: null,
    reactionPickerMessageId: null,
    /** YYYY-M-D local; for day separators between messages */
    lastDayKey: null
};

// ==================== DOM ELEMENTS ====================
const $ = id => document.getElementById(id);

const DOM = {
    loginScreen: $('loginScreen'),
    loginForm: $('loginForm'),
    username: $('username'),
    chatScreen: $('chatScreen'),
    chatTitle: $('chatTitle'),
    userInitial: $('userInitial'),
    messages: $('messages'),
    messageInput: $('messageInput'),
    sendBtn: $('sendBtn'),
    voiceBtn: $('voiceBtn'),
    emojiBtn: $('emojiBtn'),
    emojiOverlay: $('emojiOverlay'),
    emojiClose: $('emojiClose'),
    emojiPicker: $('emojiPicker'),
    attachBtn: $('attachBtn'),
    attachMenu: $('attachMenu'),
    attachPhoto: $('attachPhoto'),
    attachSticker: $('attachSticker'),
    stickerOverlay: $('stickerOverlay'),
    stickerGrid: $('stickerGrid'),
    stickerClose: $('stickerClose'),
    imagePreview: $('imagePreview'),
    previewThumb: $('previewThumb'),
    previewName: $('previewName'),
    previewSize: $('previewSize'),
    previewSend: $('previewSend'),
    previewCancel: $('previewCancel'),
    voiceOverlay: $('voiceOverlay'),
    voiceTimer: $('voiceTimer'),
    voiceDelete: $('voiceDelete'),
    voiceSend: $('voiceSend'),
    logoutBtn: $('logoutBtn'),
    fileInput: $('fileInput'),
    replyBar: $('replyBar'),
    replyBarText: $('replyBarText'),
    replyCancel: $('replyCancel'),
    editBar: $('editBar'),
    editBarText: $('editBarText'),
    editCancel: $('editCancel'),
    banner: $('banner'),
    presenceDot: document.querySelector('.online-dot'),
    presenceText: $('presenceText'),
    toast: $('toast'),
    archiveBtn: $('archiveBtn'),
    archiveOverlay: $('archiveOverlay'),
    archiveClose: $('archiveClose'),
    archiveImages: $('archiveImages'),
    archiveVoices: $('archiveVoices')
};

// ==================== UTILS ====================
const utils = {
    time: (iso) => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),

    dayKey: (iso) => {
        const d = new Date(iso || Date.now());
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    },

    dayLabel: (iso) => {
        const d = new Date(iso || Date.now());
        return d.toLocaleDateString('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    },
    
    duration: (sec) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
    
    escape: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    formatBytes: (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    },
    
    toast: (msg, duration = 3000) => {
        DOM.toast.textContent = msg;
        DOM.toast.classList.remove('hidden');
        setTimeout(() => DOM.toast.classList.add('hidden'), duration);
    },

    banner: (msg, duration = 1800) => {
        if (!DOM.banner) return;
        DOM.banner.textContent = msg;
        DOM.banner.classList.remove('hidden');
        if (state.bannerTimer) clearTimeout(state.bannerTimer);
        state.bannerTimer = setTimeout(() => DOM.banner.classList.add('hidden'), duration);
    },
    
    normalize: (str) => str?.trim().replace(/\s+/g, '') || ''
};

// ==================== API ====================
const api = {
    async request(path, options = {}) {
        const res = await fetch(path, {
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'خطا');
        }
        
        const ct = res.headers.get('content-type');
        return ct?.includes('application/json') ? res.json() : null;
    },
    
    getConfig: () => api.request('/api/public-config'),
    login: (username) => api.request('/api/login', { method: 'POST', body: JSON.stringify({ username }) }),
    logout: () => api.request('/api/logout', { method: 'POST' }),
    me: () => api.request('/api/me'),
    getMessages: () => api.request(`/api/messages?username=${encodeURIComponent(state.user)}`),
    sendText: (text, replyTo) => api.request(`/api/messages?username=${encodeURIComponent(state.user)}`, { method: 'POST', body: JSON.stringify({ text, replyTo }) }),
    editText: (id, text) => api.request(`/api/messages/${encodeURIComponent(id)}?username=${encodeURIComponent(state.user)}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
    toggleReaction: (id, emoji) => api.request(`/api/messages/${encodeURIComponent(id)}/reactions?username=${encodeURIComponent(state.user)}`, { method: 'POST', body: JSON.stringify({ emoji }) }),
    markRead: (ids) => api.request(`/api/messages/read?username=${encodeURIComponent(state.user)}`, { method: 'POST', body: JSON.stringify({ ids }) }),
    setTyping: (typing) => api.request(`/api/typing?username=${encodeURIComponent(state.user)}`, { method: 'POST', body: JSON.stringify({ typing }) }),
    async uploadMedia(formData) {
        const res = await fetch(`/api/media?username=${encodeURIComponent(state.user)}`, { method: 'POST', body: formData, credentials: 'same-origin' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'خطا در ارسال فایل');
        }
        return res.json();
    },
    setPresence: (active) => api.request(`/api/presence?username=${encodeURIComponent(state.user)}`, { method: 'POST', body: JSON.stringify({ active }) })
};

// ==================== NOTIFICATIONS ====================
const notify = {
    async init() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'denied') return;
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    },
    
    sound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 900;
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
        } catch {}
    },
    
    show(msg) {
        if (msg.sender === state.user) return;
        
        const text = msg.type === 'text' ? msg.text?.slice(0, 60) : 
                     msg.type === 'image' ? 'عکس' : 'صدا';
        
        notify.sound();
        if ('vibrate' in navigator) navigator.vibrate(30);
        utils.toast(`${msg.sender}: ${text}`);
        
        if (document.hidden && Notification.permission === 'granted') {
            new Notification(msg.sender, { body: text, tag: 'chat' });
        }
    }
};

// ==================== UI COMPONENTS ====================
const ui = {
    statusIcon(sentOrRead) {
        const single = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;

        if (sentOrRead === 'read') {
            return `<span class="ticks ticks-read" aria-label="خوانده شد">
                <span class="tick tick-1">${single}</span>
                <span class="tick tick-2">${single}</span>
            </span>`;
        }

        return `<span class="ticks ticks-sent" aria-label="ارسال شد">
            <span class="tick">${single}</span>
        </span>`;
    },

    switchScreen(isChat) {
        DOM.loginScreen.classList.toggle('hidden', isChat);
        DOM.chatScreen.classList.toggle('hidden', !isChat);
    },
    
    setHeader() {
        DOM.chatTitle.textContent = state.other;
        DOM.userInitial.textContent = state.other?.[0]?.toUpperCase() || '●';
    },
    
    toggleSendBtn() {
        const hasText = DOM.messageInput.value.trim().length > 0;
        DOM.sendBtn.classList.toggle('hidden', !hasText);
        DOM.voiceBtn.classList.toggle('hidden', hasText);
    },
    
    createMessage(msg) {
        const isOut = msg.sender === state.user;
        const el = document.createElement('div');
        el.className = `message ${isOut ? 'outgoing' : 'incoming'}`;
        el.dataset.id = msg.id;
        el.dataset.sender = msg.sender;
        
        let replyBlock = '';
        if (msg.replyTo?.id) {
            const replyType = msg.replyTo.type;
            const preview =
                replyType === 'text' ? (msg.replyTo.text || '') :
                replyType === 'image' ? 'عکس' :
                replyType === 'audio' ? 'صدا' :
                'پیام';

            replyBlock = `
                <div class="reply-in-message">
                    <div class="reply-in-title">ریپلای به ${utils.escape(msg.replyTo.sender || 'کاربر')}</div>
                    <div class="reply-in-text">${utils.escape(String(preview).slice(0, 60))}</div>
                </div>`;
        }

        let content = '';
        if (msg.type === 'text') {
            content = `<div class="message-content">${utils.escape(msg.text)}</div>`;
        } else if (msg.type === 'image') {
            content = `<div class="message-media"><img src="${msg.file.url}" loading="lazy" data-open-image="1" alt="image"></div>`;
        } else if (msg.type === 'audio') {
            const dur = msg.file.duration || 0;
            content = `
                <div class="message-voice">
                    <button class="voice-btn" data-play-voice="1">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <div class="voice-timeline">
                        <div class="voice-wave" aria-hidden="true">${'<span></span>'.repeat(10)}</div>
                        <div class="voice-bar"><div class="voice-bar-fill"></div></div>
                    </div>
                    <div class="voice-times">
                        <span class="voice-current">0:00</span>
                        <span class="voice-duration">${utils.duration(dur)}</span>
                    </div>
                    <audio hidden preload="none" data-voice-audio="1"><source src="${msg.file.url}"></audio>
                </div>`;
        }

        const reactions = msg.reactions && typeof msg.reactions === 'object' ? msg.reactions : {};
        const chips = Object.entries(reactions)
            .filter(([emoji, users]) => REACTIONS.includes(emoji) && Array.isArray(users) && users.length > 0)
            .map(([emoji, users]) => `<span class="reaction-chip" data-react-id="${msg.id}" data-react-emoji="${utils.escape(emoji)}">${emoji} <span class="reaction-count">${users.length}</span></span>`)
            .join('');
        const reactionsBlock = chips ? `<div class="message-reactions">${chips}</div>` : '';
        
        const isRead = isOut && Array.isArray(msg.readBy) && state.other && msg.readBy.includes(state.other);
        const statusClass = isRead ? 'read' : 'sent';
        const statusIcon = ui.statusIcon(isRead ? 'read' : 'sent');

        const editedBadge = msg.editedAt ? `<span class="message-edited" title="ویرایش شده">ویرایش‌شده</span>` : '';
        const editBtn = (isOut && msg.type === 'text')
            ? `<button type="button" class="reply-btn" data-edit-id="${msg.id}" aria-label="ویرایش">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
               </button>`
            : '';

        const reactBtn = `<button type="button" class="reply-btn" data-react-id="${msg.id}" aria-label="ری‌اکشن">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
                    <path d="M8 10h.01M12 10h.01M16 10h.01"/>
                </svg>
            </button>`;

        const meta = `
            <div class="message-meta">
                <button type="button" class="reply-btn" data-reply-id="${msg.id}" aria-label="ریپلای">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 17l-5-5 5-5" />
                        <path d="M4 12h10a6 6 0 0 1 6 6" />
                    </svg>
                </button>
                ${editBtn}
                ${reactBtn}
                ${editedBadge}
                ${isOut ? `
                <span class="message-status ${statusClass}">
                    ${statusIcon}
                </span>` : ''}
                <span class="message-time">${utils.time(msg.createdAt)}</span>
            </div>`;
        
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
    
    addMessage(msg, scroll = true) {
        state.messageMap.set(msg.id, msg);
        if (state.rendered.has(msg.id)) return;
        state.rendered.add(msg.id);
        ui.insertDaySeparatorIfNeeded(msg.createdAt);
        const el = ui.createMessage(msg);
        DOM.messages.appendChild(el);
        state.messageElMap.set(msg.id, el);
        if (msg.sender !== state.user) handlers.observeIncomingMessage(el);
        if (scroll) DOM.messages.scrollTop = DOM.messages.scrollHeight;
    },
    
    renderMessages(msgs) {
        DOM.messages.innerHTML = '';
        state.lastDayKey = null;
        state.rendered.clear();
        state.messageMap.clear();
        state.messageElMap.clear();
        [...msgs].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
                 .forEach(m => ui.addMessage(m, false));
        DOM.messages.scrollTop = DOM.messages.scrollHeight;
    },

    scrollToMessage(messageId) {
        const el = state.messageElMap.get(messageId);
        if (!el || !DOM.messages) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('message-highlight');
        setTimeout(() => el.classList.remove('message-highlight'), 1600);
    },

    renderArchive(messages) {
        const imgs = (messages || []).filter((m) => m && m.type === 'image' && m.file?.url);
        const voices = (messages || []).filter((m) => m && m.type === 'audio' && m.file?.url);
        if (DOM.archiveImages) {
            DOM.archiveImages.innerHTML = imgs.length
                ? imgs.map((m) => `
                    <button type="button" class="archive-thumb" data-archive-msg="${m.id}" aria-label="عکس">
                        <img src="${m.file.url}" loading="lazy" alt="">
                        <span class="archive-thumb-meta">${utils.escape(m.sender)} · ${utils.time(m.createdAt)}</span>
                    </button>`).join('')
                : '<div class="archive-empty">عکسی نیست</div>';
            DOM.archiveImages.querySelectorAll('[data-archive-msg]').forEach((btn) => {
                btn.onclick = () => {
                    handlers.closeArchive();
                    ui.scrollToMessage(btn.dataset.archiveMsg);
                };
            });
        }
        if (DOM.archiveVoices) {
            DOM.archiveVoices.innerHTML = voices.length
                ? voices.map((m) => {
                    const dur = m.file.duration ? utils.duration(m.file.duration) : '';
                    return `
                    <div class="archive-voice-row">
                        <div class="archive-voice-info">
                            <strong>${utils.escape(m.sender)}</strong>
                            <span>${utils.time(m.createdAt)}${dur ? ` · ${dur}` : ''}</span>
                        </div>
                        <div class="archive-voice-actions">
                            <button type="button" class="archive-voice-play" data-archive-play="${encodeURIComponent(m.file.url)}">پخش</button>
                            <button type="button" class="archive-voice-jump" data-archive-msg="${m.id}">در چت</button>
                        </div>
                        <audio class="archive-audio" preload="none" src="${m.file.url}"></audio>
                    </div>`;
                }).join('')
                : '<div class="archive-empty">ویسی نیست</div>';
            DOM.archiveVoices.querySelectorAll('[data-archive-play]').forEach((btn) => {
                btn.onclick = () => {
                    const url = decodeURIComponent(btn.dataset.archivePlay);
                    const row = btn.closest('.archive-voice-row');
                    const a = row?.querySelector('.archive-audio');
                    if (a) {
                        a.play().catch(() => {});
                    } else {
                        new Audio(url).play().catch(() => {});
                    }
                };
            });
            DOM.archiveVoices.querySelectorAll('[data-archive-msg]').forEach((btn) => {
                btn.onclick = () => {
                    handlers.closeArchive();
                    ui.scrollToMessage(btn.dataset.archiveMsg);
                };
            });
        }
    },

    updatePresence(isOtherOnline, lastActiveAt) {
        state.otherActive = Boolean(isOtherOnline);
        state.otherLastActiveAt = lastActiveAt || null;

        if (DOM.presenceDot) {
            DOM.presenceDot.classList.toggle('offline', !state.otherActive);
        }

        if (DOM.presenceText) {
            DOM.presenceText.textContent = state.otherTyping ? 'در حال تایپ…' : (state.otherActive ? 'آنلاین' : 'آفلاین');
        }
    },

    updateTyping(isTyping) {
        state.otherTyping = Boolean(isTyping);
        if (DOM.presenceText) {
            DOM.presenceText.textContent = state.otherTyping ? 'در حال تایپ…' : (state.otherActive ? 'آنلاین' : 'آفلاین');
        }
    },

    updateMessageReadReceipt(msg) {
        if (!msg?.id) return;
        const el = state.messageElMap.get(msg.id);
        if (!el) return;

        // Read receipts only show on outgoing messages.
        if (msg.sender !== state.user) return;

        const isRead = Array.isArray(msg.readBy) && state.other && msg.readBy.includes(state.other);
        const statusEl = el.querySelector('.message-status');
        if (!statusEl) return;

        statusEl.classList.toggle('read', isRead);
        statusEl.classList.toggle('sent', !isRead);
        statusEl.innerHTML = ui.statusIcon(isRead ? 'read' : 'sent');
    },

    updateMessageText(msg) {
        if (!msg?.id) return;
        const el = state.messageElMap.get(msg.id);
        if (!el) return;
        const content = el.querySelector('.message-content');
        if (content && msg.type === 'text') content.innerHTML = utils.escape(msg.text || '');

        let badge = el.querySelector('.message-edited');
        if (msg.editedAt) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'message-edited';
                badge.title = 'ویرایش شده';
                badge.textContent = 'ویرایش‌شده';
                const meta = el.querySelector('.message-meta');
                const time = el.querySelector('.message-time');
                if (meta && time) meta.insertBefore(badge, time);
            }
        } else if (badge) {
            badge.remove();
        }
    },

    updateMessageReactions(msg) {
        if (!msg?.id) return;
        const el = state.messageElMap.get(msg.id);
        if (!el) return;

        const reactions = msg.reactions && typeof msg.reactions === 'object' ? msg.reactions : {};
        const chips = Object.entries(reactions)
            .filter(([emoji, users]) => REACTIONS.includes(emoji) && Array.isArray(users) && users.length > 0)
            .map(([emoji, users]) => `<span class="reaction-chip" data-react-id="${msg.id}" data-react-emoji="${utils.escape(emoji)}">${emoji} <span class="reaction-count">${users.length}</span></span>`)
            .join('');

        let block = el.querySelector('.message-reactions');
        if (!chips) {
            if (block) block.remove();
            return;
        }
        if (!block) {
            block = document.createElement('div');
            block.className = 'message-reactions';
            const meta = el.querySelector('.message-meta');
            if (meta) el.insertBefore(block, meta);
        }
        block.innerHTML = chips;
    },
};

// ==================== HANDLERS ====================
const handlers = {
    async login(e) {
        e.preventDefault();
        const username = utils.normalize(DOM.username.value);
        if (!username) return utils.toast('نام کاربری را وارد کنید');
        
        if (!state.users.includes(username)) {
            return utils.toast('نام کاربری نامعتبر است.');
        }

        localStorage.setItem(CONFIG.STORAGE_KEY, username);
        await init.chat(username);
    },
    
    async logout() {
        try { await api.logout(); } catch {}
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        state.user = null;
        state.other = null;
        state.rendered.clear();
        state.messageElMap.clear();
        state.replyTo = null;
        DOM.replyBar?.classList.add('hidden');
        state.messageMap.clear();
        if (state.eventSource) state.eventSource.close();
        handlers.teardownReadObserver();
        state.readPendingIds.clear();
        if (state.readFlushTimer) clearTimeout(state.readFlushTimer);
        state.readFlushTimer = null;
        handlers.stopReadSyncTicker?.();
        handlers.stopPresenceTicker();
        handlers.closeArchive();
        state.lastDayKey = null;
        ui.switchScreen(false);
    },

    async showArchive() {
        if (!state.user) return;
        try {
            const { messages } = await api.getMessages();
            const media = [...(messages || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            ui.renderArchive(media);
            DOM.archiveOverlay?.classList.remove('hidden');
        } catch (err) {
            utils.toast(err.message);
        }
    },

    closeArchive() {
        DOM.archiveOverlay?.classList.add('hidden');
    },

    getMyActive() {
        // Presence is based on whether the tab is visible.
        // Some mobile browsers may not reliably support `hasFocus()`.
        return document.visibilityState === 'visible';
    },

    sendPresence(active) {
        // Use keepalive so the request is more likely to be delivered on tab close.
        const payload = JSON.stringify({ active });
        fetch(`/api/presence?username=${encodeURIComponent(state.user)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            credentials: 'same-origin',
            keepalive: true,
        }).catch(() => {});
    },

    async syncPresence() {
        if (!state.user) return;
        const active = handlers.getMyActive();

        // Debounce to avoid spamming server during rapid visibility changes.
        if (state.presenceDebounceTimer) clearTimeout(state.presenceDebounceTimer);
        state.presenceDebounceTimer = setTimeout(async () => {
            if (state.user && handlers.getMyActive() === active && state.presenceLastSent !== active) {
                try {
                    handlers.sendPresence(active);
                } catch {
                    // Best-effort; presence is a UI hint, not critical.
                }
                state.presenceLastSent = active;
            }
        }, 150);
    },

    startPresenceTicker() {
        if (state.presenceTickerTimer) clearInterval(state.presenceTickerTimer);
        // Keep presence updated while user is active.
        state.presenceTickerTimer = setInterval(() => {
            if (!state.user) return;
            handlers.syncPresence();
        }, 5000);
    },

    stopPresenceTicker() {
        if (state.presenceTickerTimer) clearInterval(state.presenceTickerTimer);
        state.presenceTickerTimer = null;
    },

    startReadSyncTicker() {
        handlers.stopReadSyncTicker();
        state.readSyncTimer = setInterval(async () => {
            if (!state.user) return;
            if (document.visibilityState !== 'visible') return;
            if (!DOM.chatScreen || DOM.chatScreen.classList.contains('hidden')) return;
            try {
                const { messages } = await api.getMessages();
                (messages || []).forEach((msg) => {
                    if (!msg?.id) return;
                    state.messageMap.set(msg.id, msg);
                    ui.updateMessageReadReceipt(msg);
                    ui.updateMessageReactions(msg);
                });
            } catch {
                // best-effort
            }
        }, 2000);
    },

    stopReadSyncTicker() {
        if (state.readSyncTimer) clearInterval(state.readSyncTimer);
        state.readSyncTimer = null;
    },

    handlePresenceUpdate(payload) {
        if (!payload || payload.username !== state.other) return;
        ui.updatePresence(Boolean(payload.active), payload.lastActiveAt);
    },

    handleTypingUpdate(payload) {
        if (!payload || payload.username !== state.other) return;
        ui.updateTyping(Boolean(payload.typing));
    },

    scheduleTypingStop() {
        if (state.typingStopTimer) clearTimeout(state.typingStopTimer);
        state.typingStopTimer = setTimeout(() => {
            if (!state.user) return;
            api.setTyping(false).catch(() => {});
        }, 1800);
    },

    sendTypingNow(isTyping) {
        const now = Date.now();
        if (isTyping && now - state.lastTypingSentAt < 450) return;
        state.lastTypingSentAt = now;
        api.setTyping(Boolean(isTyping)).catch(() => {});
    },

    onLocalTyping() {
        if (!state.user) return;
        if (state.typingDebounceTimer) clearTimeout(state.typingDebounceTimer);
        state.typingDebounceTimer = setTimeout(() => {
            handlers.sendTypingNow(true);
            handlers.scheduleTypingStop();
        }, 120);
    },

    setupReadObserver() {
        handlers.teardownReadObserver();

        if (!DOM.messages) return;

        state.readObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const el = entry.target;
                    const msgId = el?.dataset?.id;
                    const sender = el?.dataset?.sender;

                    // Only mark incoming messages as read by the current user.
                    if (!msgId || sender === state.user) continue;

                    handlers.queueMarkRead(msgId);
                    state.readObserver?.unobserve(el);
                }
            },
            // Mark as "read" when it's even partially visible.
            // On small/mobile screens threshold too high often prevents receipts.
            { root: DOM.messages, threshold: 0.05, rootMargin: "0px 0px -5% 0px" }
        );
    },

    teardownReadObserver() {
        if (state.readObserver) state.readObserver.disconnect();
        state.readObserver = null;
    },

    observeIncomingMessage(el) {
        if (!state.readObserver || !el) return;
        if (el.dataset?.sender === state.user) return;
        state.readObserver.observe(el);
    },

    shouldAutoMarkReadNow() {
        // If chat screen is visible, mark incoming messages as read.
        // (Mobile viewport/scroll heuristics are unreliable; keep it deterministic.)
        if (!state.user) return false;
        if (document.visibilityState !== 'visible') return false;
        if (!DOM.chatScreen || DOM.chatScreen.classList.contains('hidden')) return false;
        return true;
    },

    collectUnreadIncomingIds() {
        if (!state.user) return [];
        const ids = [];
        for (const [id, msg] of state.messageMap.entries()) {
            if (!msg || msg.sender === state.user) continue;
            const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
            if (!readBy.includes(state.user)) ids.push(id);
        }
        return ids;
    },

    autoMarkReadIfAppropriate() {
        if (!handlers.shouldAutoMarkReadNow()) return;
        const ids = handlers.collectUnreadIncomingIds();
        ids.forEach((id) => handlers.queueMarkRead(id));
        // Flush quickly so sender sees double-check fast.
        if (ids.length) setTimeout(() => handlers.flushReadQueue(), 20);
    },

    queueMarkRead(id) {
        if (!state.user || !id) return;
        state.readPendingIds.add(String(id));

        if (state.readFlushTimer) return;
        state.readFlushTimer = setTimeout(() => handlers.flushReadQueue(), 250);
    },

    async flushReadQueue() {
        if (!state.user) return;
        const ids = [...state.readPendingIds];
        state.readPendingIds.clear();
        state.readFlushTimer = null;

        if (ids.length === 0) return;
        try {
            await api.markRead(ids);
        } catch (_err) {
            // Best-effort: read receipts are UX only.
        }
    },

    setReply(msg) {
        if (!msg || !msg.id) return;
        const replyType = msg.type;
        const preview =
            replyType === 'text' ? (msg.text || '') :
            replyType === 'image' ? 'عکس' :
            replyType === 'audio' ? 'صدا' :
            'پیام';

        state.replyTo = {
            id: msg.id,
            type: replyType,
            sender: msg.sender,
            text: replyType === 'text' ? String(msg.text || '') : ''
        };

        DOM.replyBarText.textContent = `${msg.sender}: ${String(preview).slice(0, 50)}`;
        DOM.replyBar?.classList.remove('hidden');
        DOM.messageInput.focus();
    },

    setReplyById(replyId) {
        const msg = state.messageMap.get(replyId);
        if (msg) handlers.setReply(msg);
    },

    clearReply() {
        state.replyTo = null;
        if (DOM.replyBar) {
            DOM.replyBarText.textContent = '';
            DOM.replyBar.classList.add('hidden');
        }
    },

    setEditById(id) {
        const msg = state.messageMap.get(id);
        if (!msg || msg.sender !== state.user || msg.type !== 'text') return;

        state.editingMessageId = id;
        if (DOM.editBarText) DOM.editBarText.textContent = String(msg.text || '').slice(0, 80);
        DOM.editBar?.classList.remove('hidden');
        DOM.messageInput.value = String(msg.text || '');
        DOM.messageInput.focus();
        ui.toggleSendBtn();
    },

    clearEdit() {
        state.editingMessageId = null;
        if (DOM.editBarText) DOM.editBarText.textContent = '';
        DOM.editBar?.classList.add('hidden');
    },
    
    async sendText() {
        const text = DOM.messageInput.value.trim();
        if (!text) return;
        
        try {
            if (state.editingMessageId) {
                const { message } = await api.editText(state.editingMessageId, text);
                state.messageMap.set(message.id, message);
                ui.updateMessageText(message);
                handlers.clearEdit();
                utils.banner('ویرایش شد');
            } else {
                await api.sendText(text, state.replyTo);
                utils.banner('ارسال شد');
            }
            api.setTyping(false).catch(() => {});
            DOM.messageInput.value = '';
            DOM.messageInput.style.height = 'auto';
            ui.toggleSendBtn();
            handlers.clearReply();
        } catch (err) {
            utils.toast(err.message);
        }
    },

    closeReactionPicker() {
        if (state.reactionPicker) {
            state.reactionPicker.remove();
            state.reactionPicker = null;
            state.reactionPickerMessageId = null;
        }
    },

    openReactionPicker(messageId, anchorEl) {
        handlers.closeReactionPicker();
        if (!messageId) return;

        const picker = document.createElement('div');
        picker.className = 'reaction-picker';
        picker.innerHTML = REACTIONS.map((e) => `<button class="reaction-item" type="button" data-react-emoji="${utils.escape(e)}">${e}</button>`).join('');
        document.body.appendChild(picker);

        const rect = anchorEl?.getBoundingClientRect?.() || { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
        const left = Math.min(Math.max(10, rect.left + rect.width / 2 - picker.offsetWidth / 2), window.innerWidth - picker.offsetWidth - 10);
        const top = Math.min(Math.max(10, rect.top - picker.offsetHeight - 10), window.innerHeight - picker.offsetHeight - 10);
        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;

        picker.onclick = async (ev) => {
            const btn = ev.target.closest('[data-react-emoji]');
            if (!btn) return;
            const emoji = btn.dataset.reactEmoji;
            try {
                const { message } = await api.toggleReaction(messageId, emoji);
                state.messageMap.set(message.id, message);
                ui.updateMessageReactions(message);
            } catch (err) {
                utils.toast(err.message);
            } finally {
                handlers.closeReactionPicker();
            }
        };

        state.reactionPicker = picker;
        state.reactionPickerMessageId = messageId;
    },
    
    async sendImage() {
        if (!state.pendingImage) return;
        
        const form = new FormData();
        form.append('mediaType', 'image');
        form.append('file', state.pendingImage);
        if (state.replyTo) form.append('replyTo', JSON.stringify(state.replyTo));
        
        DOM.previewSend.disabled = true;
        try {
            await api.uploadMedia(form);
            handlers.closePreview();
            utils.banner('ارسال شد');
            handlers.clearReply();
        } catch (err) {
            utils.toast(err.message);
            DOM.previewSend.disabled = false;
        }
    },
    
    showPreview(file) {
        state.pendingImage = file;
        DOM.previewThumb.src = URL.createObjectURL(file);
        DOM.previewName.textContent = file.name;
        DOM.previewSize.textContent = utils.formatBytes(file.size);
        DOM.imagePreview.classList.remove('hidden');
        DOM.attachMenu.classList.add('hidden');
    },
    
    closePreview() {
        state.pendingImage = null;
        DOM.imagePreview.classList.add('hidden');
        DOM.previewThumb.src = '';
        DOM.fileInput.value = '';
        DOM.previewSend.disabled = false;
    },
    
    async startRecord() {
        try {
            state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            return utils.toast('دسترسی به میکروفون نیاز است');
        }
        
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
        const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
        
        state.recorder = new MediaRecorder(state.stream, { mimeType: mime });
        state.chunks = [];
        
        state.recorder.ondataavailable = e => { if (e.data.size) state.chunks.push(e.data); };
        state.recorder.onstop = handlers.finishRecord;
        
        state.recorder.start(100);
        state.recording = true;
        state.recordStart = Date.now();
        DOM.voiceOverlay.classList.remove('hidden');
        
        state.recordTimer = setInterval(() => {
            const sec = (Date.now() - state.recordStart) / 1000;
            DOM.voiceTimer.textContent = utils.duration(sec);
        }, 100);
    },
    
    async finishRecord() {
        clearInterval(state.recordTimer);
        DOM.voiceOverlay.classList.add('hidden');
        state.recording = false;
        
        if (state.stream) {
            state.stream.getTracks().forEach(t => t.stop());
            state.stream = null;
        }
        
        if (state.discardRecord || !state.chunks?.length) {
            state.discardRecord = false;
            return;
        }
        
        const sec = (Date.now() - state.recordStart) / 1000;
        if (sec < 0.5) return utils.toast('صدا خیلی کوتاه بود');
        
        const blob = new Blob(state.chunks, { type: state.recorder.mimeType });
        const ext = state.recorder.mimeType.includes('mp4') ? '.m4a' : '.webm';
        const file = new File([blob], `voice-${Date.now()}${ext}`, { type: state.recorder.mimeType });
        
        const form = new FormData();
        form.append('mediaType', 'audio');
        form.append('file', file);
        if (state.replyTo) form.append('replyTo', JSON.stringify(state.replyTo));
        
        try {
            await api.uploadMedia(form);
            utils.banner('صدا ارسال شد');
            handlers.clearReply();
        } catch (err) {
            utils.toast(err.message);
        }
    },
    
    deleteRecord() {
        state.discardRecord = true;
        if (state.recorder?.state === 'recording') state.recorder.stop();
    },
    
    playVoice(btn) {
        const wrap = btn.closest('.message-voice');
        const audio = wrap.querySelector('audio');
        if (!audio) return;

        const fillEl = wrap.querySelector('.voice-bar-fill');
        const currentEl = wrap.querySelector('.voice-current');
        const durationEl = wrap.querySelector('.voice-duration');

        const resetVoiceUI = (voiceEl) => {
            voiceEl.classList.remove('is-playing');
            const f = voiceEl.querySelector('.voice-bar-fill');
            if (f) f.style.width = '0%';
            const c = voiceEl.querySelector('.voice-current');
            if (c) c.textContent = '0:00';
        };

        const isPlaying = !audio.paused;
        if (isPlaying) {
            audio.pause();
            resetVoiceUI(wrap);
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            return;
        }

        // Pause other voice messages and reset their timelines.
        document.querySelectorAll('.message-voice').forEach((voiceEl) => {
            const a = voiceEl.querySelector('audio');
            if (a && a !== audio) {
                a.pause();
                resetVoiceUI(voiceEl);
            }
        });

        wrap.classList.add('is-playing');
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

        if (!audio.dataset.voiceEventsBound) {
            audio.dataset.voiceEventsBound = '1';

            audio.addEventListener('loadedmetadata', () => {
                const d = audio.duration;
                if (durationEl && d && Number.isFinite(d) && d > 0) {
                    durationEl.textContent = utils.duration(d);
                }
            });

            audio.addEventListener('timeupdate', () => {
                if (!fillEl || !currentEl) return;
                const d = audio.duration || 0;
                const t = audio.currentTime || 0;
                if (d > 0) fillEl.style.width = `${Math.max(0, Math.min(1, t / d)) * 100}%`;
                currentEl.textContent = utils.duration(t);
            });

            audio.addEventListener('ended', () => {
                resetVoiceUI(wrap);
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            });
        }

        audio.play().catch(() => {
            // If autoplay is blocked, keep UI in non-playing state.
            resetVoiceUI(wrap);
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        });
    },
    
    showEmoji() {
        if (!state.emojiPicker) {
            DOM.emojiPicker.innerHTML = EMOJIS.map((emoji) => (
                `<button type="button" class="emoji-item" data-emoji="${emoji}">${emoji}</button>`
            )).join('');
            DOM.emojiPicker.classList.add('emoji-grid');
            DOM.emojiPicker.querySelectorAll('[data-emoji]').forEach((item) => {
                item.onclick = () => {
                    DOM.messageInput.value += item.dataset.emoji;
                    ui.toggleSendBtn();
                    DOM.emojiOverlay.classList.add('hidden');
                    DOM.messageInput.focus();
                };
            });
            state.emojiPicker = true;
        }
        DOM.emojiOverlay.classList.remove('hidden');
    },
    
    async showStickers() {
        DOM.attachMenu.classList.add('hidden');
        
        if (!state.stickers) {
            try {
                const res = await fetch(CONFIG.STICKER_MANIFEST);
                state.stickers = await res.json();
            } catch {
                state.stickers = { items: [] };
            }
        }
        
        const items = state.stickers?.items || [];
        if (items.length === 0) {
            DOM.stickerGrid.innerHTML = '<div class="sticker-empty">استیکری وجود ندارد</div>';
        } else {
            const base = state.stickers?.base || '';
            DOM.stickerGrid.innerHTML = items.map(s => `
                <button class="sticker-item" data-url="${base}${s}">
                    <img src="${base}${s}" loading="lazy" alt="">
                </button>
            `).join('');
            
            DOM.stickerGrid.querySelectorAll('.sticker-item').forEach(btn => {
                btn.onclick = () => handlers.sendSticker(btn.dataset.url);
            });
        }
        
        DOM.stickerOverlay.classList.remove('hidden');
    },
    
    async sendSticker(url) {
        DOM.stickerOverlay.classList.add('hidden');
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const file = new File([blob], 'sticker.png', { type: 'image/png' });
            const form = new FormData();
            form.append('mediaType', 'image');
            form.append('file', file);
            if (state.replyTo) form.append('replyTo', JSON.stringify(state.replyTo));
            await api.uploadMedia(form);
            utils.banner('استیکر ارسال شد');
            handlers.clearReply();
        } catch (err) {
            utils.toast(err.message);
        }
    }
};

// ==================== EVENT SOURCE ====================
const realtime = {
    connect() {
        if (state.eventSource) state.eventSource.close();

        state.eventSource = new EventSource(`/api/events?username=${encodeURIComponent(state.user)}`);
        state.eventSource.onopen = () => {
            state.reconnectAttempts = 0;
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }
        };
        state.eventSource.addEventListener('message:new', (e) => {
            try {
                const msg = JSON.parse(e.data);
                ui.addMessage(msg);
                notify.show(msg);
                // Fallback for mobile: if user is viewing chat, mark incoming as read immediately.
                if (msg?.sender && msg.sender !== state.user) {
                    handlers.autoMarkReadIfAppropriate();
                }
            } catch {}
        });

        state.eventSource.addEventListener('presence:update', (e) => {
            try {
                const payload = JSON.parse(e.data);
                handlers.handlePresenceUpdate(payload);
            } catch {}
        });

        state.eventSource.addEventListener('typing:update', (e) => {
            try {
                const payload = JSON.parse(e.data);
                handlers.handleTypingUpdate(payload);
            } catch {}
        });

        state.eventSource.addEventListener('message:read', (e) => {
            try {
                const payload = JSON.parse(e.data);
                const updated = payload?.messages || [];
                updated.forEach((msg) => {
                    if (!msg?.id) return;
                    state.messageMap.set(msg.id, msg);
                    ui.updateMessageReadReceipt(msg);
                });
            } catch {}
        });

        state.eventSource.addEventListener('message:update', (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (!msg?.id) return;
                state.messageMap.set(msg.id, msg);
                ui.updateMessageText(msg);
                ui.updateMessageReactions(msg);
            } catch {}
        });
        state.eventSource.onerror = () => {
            state.eventSource?.close();
            const retryIn = Math.min(1000 * (2 ** state.reconnectAttempts), 15000);
            state.reconnectAttempts += 1;
            if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
            state.reconnectTimer = setTimeout(() => {
                if (state.user) realtime.connect();
            }, retryIn);
        };
    }
};

// ==================== INITIALIZATION ====================
const init = {
    async config() {
        const cfg = await api.getConfig();
        state.users = cfg.allowedUsers;
    },
    
    async chat(username) {
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
        realtime.connect();

        // On first load, when chat is open, mark incoming messages as read.
        setTimeout(() => handlers.autoMarkReadIfAppropriate(), 60);
        
        DOM.messageInput.focus();
    },
    
    restore() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) DOM.username.value = saved;
    },
    
    async autoLogin() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!saved || !state.users.includes(saved)) return;
        
        try {
            await init.chat(saved);
        } catch {
            localStorage.removeItem(CONFIG.STORAGE_KEY);
        }
    },
    
    events() {
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
        
        DOM.attachBtn.onclick = (e) => {
            e.stopPropagation();
            DOM.attachMenu.classList.toggle('hidden');
        };
        
        DOM.attachPhoto.onclick = () => {
            DOM.fileInput.click();
            DOM.attachMenu.classList.add('hidden');
        };
        
        DOM.attachSticker.onclick = () => {
            handlers.showStickers();
            DOM.attachMenu.classList.add('hidden');
        };
        
        DOM.fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) return utils.toast('فرمت پشتیبانی نمی‌شود');
            if (file.size > CONFIG.MAX_IMAGE_SIZE) return utils.toast('حجم فایل زیاد است');
            handlers.showPreview(file);
        };
        
        DOM.previewSend.onclick = handlers.sendImage;
        DOM.previewCancel.onclick = handlers.closePreview;
        DOM.stickerClose.onclick = () => DOM.stickerOverlay.classList.add('hidden');
        DOM.stickerOverlay.onclick = (e) => { if (e.target === DOM.stickerOverlay) DOM.stickerOverlay.classList.add('hidden'); };

        if (DOM.archiveBtn) DOM.archiveBtn.onclick = () => handlers.showArchive();
        if (DOM.archiveClose) DOM.archiveClose.onclick = () => handlers.closeArchive();
        if (DOM.archiveOverlay) {
            DOM.archiveOverlay.onclick = (e) => {
                if (e.target === DOM.archiveOverlay) handlers.closeArchive();
            };
        }
        
        DOM.messageInput.oninput = () => {
            if (DOM.messageInput.value.length > CONFIG.MAX_TEXT) {
                DOM.messageInput.value = DOM.messageInput.value.slice(0, CONFIG.MAX_TEXT);
                utils.toast('حداکثر طول پیام ۲۰۰۰ کاراکتر است');
            }
            handlers.onLocalTyping();
            ui.toggleSendBtn();
            DOM.messageInput.style.height = 'auto';
            DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 120) + 'px';
        };
        
        DOM.messageInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlers.sendText();
            }
        };
        
        document.onclick = (e) => {
            const replyBtn = e.target.closest('[data-reply-id]');
            if (replyBtn) {
                handlers.setReplyById(replyBtn.dataset.replyId);
                return;
            }

            const editBtn = e.target.closest('[data-edit-id]');
            if (editBtn) {
                handlers.setEditById(editBtn.dataset.editId);
                return;
            }

            const reactBtn = e.target.closest('[data-react-id]');
            if (reactBtn) {
                const id = reactBtn.dataset.reactId;
                handlers.openReactionPicker(id, reactBtn);
                return;
            }

            const voiceBtn = e.target.closest('[data-play-voice]');
            if (voiceBtn) {
                handlers.playVoice(voiceBtn);
                return;
            }
            const image = e.target.closest('[data-open-image]');
            if (image?.src) {
                window.open(image.src, '_blank', 'noopener,noreferrer');
                return;
            }
            // Clicking elsewhere closes reaction picker.
            if (state.reactionPicker && !e.target.closest('.reaction-picker')) {
                handlers.closeReactionPicker();
            }
            if (!DOM.attachMenu.contains(e.target) && !DOM.attachBtn.contains(e.target)) {
                DOM.attachMenu.classList.add('hidden');
            }
        };

        // Mark as read when user scrolls through messages.
        DOM.messages?.addEventListener('scroll', () => {
            if (!state.user) return;
            handlers.autoMarkReadIfAppropriate();
        }, { passive: true });
        
        const presenceFromVisibility = () => handlers.getMyActive();

        document.addEventListener('visibilitychange', () => {
            if (!state.user) return;
            handlers.sendPresence(presenceFromVisibility());
            handlers.syncPresence();
            if (!document.hidden) realtime.connect();
            if (!document.hidden) handlers.autoMarkReadIfAppropriate();
        });

        window.addEventListener('focus', () => {
            if (!state.user) return;
            handlers.sendPresence(true);
            handlers.syncPresence();
            handlers.autoMarkReadIfAppropriate();
        });

        window.addEventListener('blur', () => {
            if (!state.user) return;
            handlers.sendPresence(false);
            handlers.syncPresence();
            api.setTyping(false).catch(() => {});
        });

        window.addEventListener('beforeunload', () => {
            if (!state.user) return;
            handlers.sendPresence(false);
            api.setTyping(false).catch(() => {});
        });
    },
    
    async start() {
        await init.config();
        init.restore();
        init.events();
        await init.autoLogin();
    }
};

// Start
init.start();
