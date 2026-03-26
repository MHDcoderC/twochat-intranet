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
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🙂','🙃','😉','🤔','😴','😭','😡','👍','👏','🙏','❤️','💔','🔥','🎉','🌹','🤝','✅','❌','💬','📌','🎯','🚀','⭐','⚡'];

// ==================== STATE ====================
const state = {
    user: null,
    other: null,
    users: [],
    messages: [],
    rendered: new Set(),
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
    messageMap: new Map()
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
    toast: $('toast')
};

// ==================== UTILS ====================
const utils = {
    time: (iso) => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    
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
    getMessages: () => api.request('/api/messages'),
    sendText: (text, replyTo) => api.request('/api/messages', { method: 'POST', body: JSON.stringify({ text, replyTo }) }),
    async uploadMedia(formData) {
        const res = await fetch('/api/media', { method: 'POST', body: formData, credentials: 'same-origin' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'خطا در ارسال فایل');
        }
        return res.json();
    }
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
        
        const meta = `
            <div class="message-meta">
                <button type="button" class="reply-btn" data-reply-id="${msg.id}" aria-label="ریپلای">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 17l-5-5 5-5" />
                        <path d="M4 12h10a6 6 0 0 1 6 6" />
                    </svg>
                </button>
                ${isOut ? `
                <span class="message-status">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                        <polyline points="22 8 11 19 6 14" opacity="0.6"></polyline>
                    </svg>
                </span>` : ''}
                <span class="message-time">${utils.time(msg.createdAt)}</span>
            </div>`;
        
        el.innerHTML = replyBlock + content + meta;
        return el;
    },
    
    addMessage(msg, scroll = true) {
        state.messageMap.set(msg.id, msg);
        if (state.rendered.has(msg.id)) return;
        state.rendered.add(msg.id);
        DOM.messages.appendChild(ui.createMessage(msg));
        if (scroll) DOM.messages.scrollTop = DOM.messages.scrollHeight;
    },
    
    renderMessages(msgs) {
        DOM.messages.innerHTML = `<div class="date-separator"><span>گفتگو</span></div>`;
        state.rendered.clear();
        state.messageMap.clear();
        [...msgs].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
                 .forEach(m => ui.addMessage(m, false));
        DOM.messages.scrollTop = DOM.messages.scrollHeight;
    }
};

// ==================== HANDLERS ====================
const handlers = {
    async login(e) {
        e.preventDefault();
        const username = utils.normalize(DOM.username.value);
        if (!username) return utils.toast('نام کاربری را وارد کنید');
        
        try {
            await api.login(username);
            localStorage.setItem(CONFIG.STORAGE_KEY, username);
            await init.chat(username);
        } catch (err) {
            utils.toast(err.message);
        }
    },
    
    async logout() {
        try { await api.logout(); } catch {}
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        state.user = null;
        state.other = null;
        state.rendered.clear();
        state.replyTo = null;
        DOM.replyBar?.classList.add('hidden');
        state.messageMap.clear();
        if (state.eventSource) state.eventSource.close();
        ui.switchScreen(false);
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
    
    async sendText() {
        const text = DOM.messageInput.value.trim();
        if (!text) return;
        
        try {
            await api.sendText(text, state.replyTo);
            DOM.messageInput.value = '';
            DOM.messageInput.style.height = 'auto';
            ui.toggleSendBtn();
            handlers.clearReply();
        } catch (err) {
            utils.toast(err.message);
        }
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
            utils.toast('ارسال شد');
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
            utils.toast('صدا ارسال شد');
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
            utils.toast('استیکر ارسال شد');
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

        state.eventSource = new EventSource('/api/events');
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
        notify.init();
        
        const { messages } = await api.getMessages();
        ui.renderMessages(messages);
        realtime.connect();
        
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
            const me = await api.me();
            if (me.username) {
                await init.chat(me.username);
            } else {
                await api.login(saved);
                await init.chat(saved);
            }
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
        
        DOM.messageInput.oninput = () => {
            if (DOM.messageInput.value.length > CONFIG.MAX_TEXT) {
                DOM.messageInput.value = DOM.messageInput.value.slice(0, CONFIG.MAX_TEXT);
                utils.toast('حداکثر طول پیام ۲۰۰۰ کاراکتر است');
            }
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
            if (!DOM.attachMenu.contains(e.target) && !DOM.attachBtn.contains(e.target)) {
                DOM.attachMenu.classList.add('hidden');
            }
        };
        
        document.onvisibilitychange = () => {
            if (!document.hidden && state.user) realtime.connect();
        };
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
