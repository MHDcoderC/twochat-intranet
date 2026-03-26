# Two Chat

پیام‌رسان دو نفره سبک برای استفاده در شبکه داخلی (LAN/Intranet) و گفت‌وگوهای شخصی.

## مناسب چه سناریویی است

- گفت‌وگوی دو نفره در شبکه داخلی سازمان یا خانه
- اجرای روی سرور داخلی بدون نیاز به سرویس خارجی
- ارسال پیام متنی، تصویر و صدا با رابط موبایل‌فرست

## امکانات

- پیام متنی، تصویر و صدا
- ارتباط بلادرنگ با `SSE`
- ذخیره‌سازی محلی پیام‌ها در `data/messages.json`
- آپلود امن فایل در `uploads/`
- فشرده‌سازی خودکار تصویر با `sharp`
- ایموجی‌پیکر داخلی بدون CDN خارجی
- احراز هویت سشن‌بیس برای دو کاربر مشخص

## اجرای سریع

```bash
npm install
cp .env.example .env
npm start
```

سرویس به طور پیش‌فرض روی `http://localhost:3000` اجرا می‌شود.

## تنظیمات محیطی

فایل `.env`:

```env
PORT=3000
ALLOWED_USERS=alpha_user,beta_user
SESSION_SECRET=replace-with-a-long-random-secret
MAX_MESSAGES=1000
NODE_ENV=production
TRUST_PROXY=false
```

- `ALLOWED_USERS`: دقیقا ۲ نام کاربری، با کاما جدا شود.
- `SESSION_SECRET`: مقدار طولانی و تصادفی (حداقل 32 کاراکتر).
- `TRUST_PROXY=true`: فقط زمانی فعال شود که پشت reverse proxy هستید.

نمونه استقرار عمومی (بدون اطلاعات شخصی):

```env
PORT=YOUR_INTERNAL_PORT
ALLOWED_USERS=user_a,user_b
NODE_ENV=production
TRUST_PROXY=true
```

## راهنمای استقرار روی سرور داخلی

1. **Node.js LTS** نصب کنید (ترجیحا نسخه 20 یا بالاتر).
2. پروژه را روی سرور داخلی clone کنید.
3. فایل `.env` را با مقادیر واقعی تنظیم کنید.
4. در شبکه داخلی پورت سرویس را فقط برای IPهای مجاز باز کنید.
5. برای اجرا در پس‌زمینه از `pm2` یا سرویس سیستم‌عامل استفاده کنید.

نمونه با `pm2`:

```bash
npm i -g pm2
pm2 start server.js --name two-chat
pm2 save
```

## نکات امنیتی مهم

- این پروژه برای **شبکه داخلی خصوصی** طراحی شده است.
- برای استفاده واقعی، HTTPS داخلی (مثلا با Nginx/Traefik) فعال کنید.
- `SESSION_SECRET` پیش‌فرض را هرگز نگه ندارید.
- فایل `.env` را commit نکنید.
- دسترسی به سرور را با فایروال محدود کنید.
- توصیه‌ها و محدودیت‌های بیشتر در `SECURITY.md` آمده است.

## ساختار پروژه

```text
.
├── server.js
├── public/
│   ├── index.html
│   ├── app.js
│   └── stickers/manifest.json
├── data/messages.json
├── uploads/
├── .env.example
└── SECURITY.md
```

## انتشار در GitHub

قبل از push:

- بررسی کنید `.env` داخل commit نباشد.
- `data/messages.json` و `uploads/` خالی/نادیده گرفته شده باشند.
- در README آدرس داخلی یا اطلاعات حساس ننویسید.

## License

MIT - جزئیات در فایل `LICENSE`.
