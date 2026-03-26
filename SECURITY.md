# Security Policy

## Scope

This project is designed for private/internal network use by two trusted users.
It is not a full internet-facing secure messenger.

## Supported Usage

- Internal LAN / intranet deployment
- Short-lived private conversations
- Controlled network perimeter (firewall/VPN)

## Minimum Security Checklist

1. Set a strong `SESSION_SECRET` in `.env`.
2. Change `ALLOWED_USERS` to your real usernames.
3. Do not expose the server publicly without HTTPS and strict firewall rules.
4. Keep `.env` out of Git history.
5. Restrict inbound access to trusted IP ranges only.
6. Keep Node.js and dependencies updated.

## Reverse Proxy and HTTPS

If deploying behind Nginx/Caddy/Traefik with TLS termination:

- Enable HTTPS on the proxy.
- Set `TRUST_PROXY=true` in `.env`.
- Keep `NODE_ENV=production`.

## Current Security Model

- Session-based auth (`express-session`)
- Basic hardening with `helmet`
- Request limiting with `express-rate-limit`
- Upload type and size validation via `multer`

## Known Limitations

- No end-to-end encryption
- No database-level audit trail
- No multi-factor authentication
- Messages are stored locally in plain JSON on server disk

## Reporting Vulnerabilities

If you discover a vulnerability, avoid opening a public issue with exploit details.
Share a private report with reproduction steps and impact details.
