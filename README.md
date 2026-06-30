# Two Chat

پیام‌رسان دو نفره سبک برای استفاده در شبکه داخلی (LAN/Intranet) و گفت‌وگوهای شخصی.

## مناسب چه سناریویی است

- گفت‌وگوی دو نفره در شبکه داخلی سازمان یا خانه
- اجرای روی سرور داخلی بدون نیاز به سرویس خارجی
- ارسال پیام متنی، تصویر و صدا با رابط موبایل‌فرست

## امکانات

- پیام متنی، تصویر و صدا
- ارتباط بلادرنگ با SSE (پیام جدید، حضور، خوانده شدن، ویرایش، ری‌اکشن، تایپ)
- ذخیره‌سازی محلی پیام‌ها در `data/messages.json`
- آپلود فایل‌ها در `uploads/`
- فشرده‌سازی خودکار تصویر با `sharp`
- ایموجی‌پیکر و استیکر داخلی
- احراز هویت برای دو کاربر مجاز (`ALLOWED_USERS`)
- ریپلای، ویرایش پیام، ری‌اکشن، نشانگر خوانده‌شدن
- آرشیو رسانه (عکس و ویس)
- PWA با Service Worker

## اجرای سریع

```bash
npm install
cp .env.example .env   # مقادیر واقعی را تنظیم کنید
npm start
```

برای توسعه با auto-reload:

```bash
npm run dev
```

## تنظیمات محیطی

فایل `.env` (نمونه در `.env.example`):

```env
PORT=3000
ALLOWED_USERS=user1,user2
SESSION_SECRET=replace-with-a-long-random-secret
MAX_MESSAGES=1000
NODE_ENV=production
TRUST_PROXY=false
PRESENCE_TTL_MS=20000
```

## ساختار پروژه

```text
.
├── server.js                    # نقطه ورود سرور
├── src/
│   ├── config.js                # تنظیمات محیطی
│   ├── middleware/auth.js        # میان‌افزار احراز هویت
│   ├── routes/
│   │   ├── auth.js              # ورود/خروج
│   │   ├── messages.js          # CRUD پیام‌ها
│   │   ├── media.js             # آپلود رسانه
│   │   ├── presence.js          # وضعیت آنلاین و تایپ
│   │   └── sse.js               # ارتباط بلادرنگ
│   ├── services/
│   │   ├── broadcaster.js       # پخش رویدادها (SSE)
│   │   ├── imageOptimizer.js    # بهینه‌سازی تصویر
│   │   └── messageStore.js      # ذخیره‌سازی پیام‌ها
│   └── utils/helpers.js         # توابع کمکی
├── public/
│   ├── index.html               # صفحه اصلی
│   ├── css/styles.css           # استایل‌ها
│   ├── js/
│   │   ├── app.js               # نقطه ورود کلاینت
│   │   ├── config.js            # ثابت‌ها
│   │   ├── state.js             # وضعیت برنامه
│   │   ├── dom.js               # مراجع DOM
│   │   ├── utils.js             # توابع کمکی
│   │   ├── api.js               # فراخوانی API
│   │   ├── ui.js                # رندر رابط کاربری
│   │   ├── handlers.js          # مدیریت رویدادها
│   │   ├── realtime.js          # اتصال SSE
│   │   ├── notify.js            # اعلان‌ها
│   │   └── pwa.js               # قابلیت‌های PWA
│   ├── sw.js                    # Service Worker
│   ├── manifest.webmanifest     # PWA manifest
│   ├── icons/                   # آیکون‌ها
│   ├── assets/fonts/            # فونت‌های Vazirmatn
│   └── stickers/                # استیکرها
├── .env.example
├── .gitignore
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
└── LICENSE
```

## نکات امنیتی

- این پروژه برای شبکه داخلی خصوصی طراحی شده
- برای استقرار عمومی، HTTPS فعال کنید
- `SESSION_SECRET` پیش‌فرض را تغییر دهید
- فایل `.env` را commit نکنید
- جزئیات بیشتر در `SECURITY.md`

## License

MIT
