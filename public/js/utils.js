import { DOM } from './dom.js';
import { state } from './state.js';

export const utils = {
    time: (iso) => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    dayKey: (iso) => { const d = new Date(iso || Date.now()); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; },
    dayLabel: (iso) => new Date(iso || Date.now()).toLocaleDateString('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    duration: (sec) => { const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}:${s.toString().padStart(2, '0')}`; },
    escape: (text) => { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; },
    formatBytes: (bytes) => { if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(2) + ' MB'; },
    toast: (msg, duration = 3000) => { DOM.toast.textContent = msg; DOM.toast.classList.remove('hidden'); setTimeout(() => DOM.toast.classList.add('hidden'), duration); },
    banner: (msg, duration = 1800) => { if (!DOM.banner) return; DOM.banner.textContent = msg; DOM.banner.classList.remove('hidden'); if (state.bannerTimer) clearTimeout(state.bannerTimer); state.bannerTimer = setTimeout(() => DOM.banner.classList.add('hidden'), duration); },
    normalize: (str) => str?.trim().replace(/\s+/g, '') || '',
};
