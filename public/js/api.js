import { state } from './state.js';

function userParam() { return `username=${encodeURIComponent(state.user)}`; }

async function request(path, options = {}) {
    const res = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
    if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'خطا'); }
    const ct = res.headers.get('content-type');
    return ct?.includes('application/json') ? res.json() : null;
}

export const api = {
    getConfig: () => request('/api/public-config'),
    login: (username) => request('/api/login', { method: 'POST', body: JSON.stringify({ username }) }),
    logout: () => request('/api/logout', { method: 'POST' }),
    me: () => request('/api/me'),
    getMessages: () => request(`/api/messages?${userParam()}`),
    sendText: (text, replyTo) => request(`/api/messages?${userParam()}`, { method: 'POST', body: JSON.stringify({ text, replyTo }) }),
    editText: (id, text) => request(`/api/messages/${encodeURIComponent(id)}?${userParam()}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
    toggleReaction: (id, emoji) => request(`/api/messages/${encodeURIComponent(id)}/reactions?${userParam()}`, { method: 'POST', body: JSON.stringify({ emoji }) }),
    markRead: (ids) => request(`/api/messages/read?${userParam()}`, { method: 'POST', body: JSON.stringify({ ids }) }),
    setTyping: (typing) => request(`/api/typing?${userParam()}`, { method: 'POST', body: JSON.stringify({ typing }) }),
    setPresence: (active) => request(`/api/presence?${userParam()}`, { method: 'POST', body: JSON.stringify({ active }) }),
    async uploadMedia(formData) {
        const res = await fetch(`/api/media?${userParam()}`, { method: 'POST', body: formData, credentials: 'same-origin' });
        if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'خطا در ارسال فایل'); }
        return res.json();
    },
};
