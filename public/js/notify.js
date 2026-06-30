import { state } from './state.js';
import { utils } from './utils.js';
import { pwa } from './pwa.js';

export const notify = {
    async init() { if (!('Notification' in window)) return; if (Notification.permission === 'denied') return; if (Notification.permission === 'default') await Notification.requestPermission(); },
    sound() { try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 900; gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1); } catch {} },
    show(msg) {
        if (msg.sender === state.user) return;
        const text = msg.type === 'text' ? msg.text?.slice(0, 60) : msg.type === 'image' ? 'عکس' : 'صدا';
        notify.sound();
        if ('vibrate' in navigator) navigator.vibrate(30);
        utils.toast(`${msg.sender}: ${text}`);
        if (document.hidden && Notification.permission === 'granted') pwa.showMessageNotification(msg.sender, text);
    },
};
