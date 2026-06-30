import { state } from './state.js';

export const pwa = {
    async init() { if (!('serviceWorker' in navigator)) return; try { state.swRegistration = await navigator.serviceWorker.register('/sw.js'); } catch {} },
    async showMessageNotification(sender, body) {
        try { if (state.swRegistration?.showNotification) { await state.swRegistration.showNotification(sender, { body, tag: 'chat-new-message', renotify: true, badge: '/icons/chat-icon.svg', icon: '/icons/chat-icon.svg' }); return; } } catch {}
        if ('Notification' in window && Notification.permission === 'granted') new Notification(sender, { body, tag: 'chat-new-message' });
    },
    async updateUnreadBadge() {
        if (!('setAppBadge' in navigator) && !('clearAppBadge' in navigator)) return;
        if (!state.user) return;
        let unread = 0;
        for (const msg of state.messageMap.values()) { if (!msg || msg.sender === state.user) continue; const readBy = Array.isArray(msg.readBy) ? msg.readBy : []; if (!readBy.includes(state.user)) unread++; }
        try { if (unread > 0 && 'setAppBadge' in navigator) await navigator.setAppBadge(unread); else if ('clearAppBadge' in navigator) await navigator.clearAppBadge(); } catch {}
    },
};
