import { state } from './state.js';
import { ui } from './ui.js';
import { notify } from './notify.js';
import { pwa } from './pwa.js';
import { handlers } from './handlers.js';

export const realtime = {
    connect() {
        if (state.eventSource) state.eventSource.close();
        state.eventSource = new EventSource(`/api/events?username=${encodeURIComponent(state.user)}`);
        state.eventSource.onopen = () => { state.reconnectAttempts = 0; if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; } };
        state.eventSource.addEventListener('message:new', (e) => { try { const msg = JSON.parse(e.data); ui.addMessage(msg, true, handlers.observeIncomingMessage); notify.show(msg); pwa.updateUnreadBadge(); if (msg?.sender && msg.sender !== state.user) handlers.autoMarkReadIfAppropriate(); } catch {} });
        state.eventSource.addEventListener('presence:update', (e) => { try { handlers.handlePresenceUpdate(JSON.parse(e.data)); } catch {} });
        state.eventSource.addEventListener('typing:update', (e) => { try { handlers.handleTypingUpdate(JSON.parse(e.data)); } catch {} });
        state.eventSource.addEventListener('message:read', (e) => { try { (JSON.parse(e.data)?.messages || []).forEach(msg => { if (!msg?.id) return; state.messageMap.set(msg.id, msg); ui.updateMessageReadReceipt(msg); }); pwa.updateUnreadBadge(); } catch {} });
        state.eventSource.addEventListener('message:update', (e) => { try { const msg = JSON.parse(e.data); if (!msg?.id) return; state.messageMap.set(msg.id, msg); ui.updateMessageText(msg); ui.updateMessageReactions(msg); } catch {} });
        state.eventSource.onerror = () => { state.eventSource?.close(); const retryIn = Math.min(1000 * (2 ** state.reconnectAttempts), 15000); state.reconnectAttempts++; if (state.reconnectTimer) clearTimeout(state.reconnectTimer); state.reconnectTimer = setTimeout(() => { if (state.user) realtime.connect(); }, retryIn); };
    },
};
