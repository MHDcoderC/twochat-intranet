# Contributing

## Development Setup

1. Install Node.js LTS.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Run `npm start`.

## Pull Request Rules

- Keep changes focused and small.
- Avoid committing local data (`uploads/`, `data/messages.json`, `.env`).
- Update `README.md` when behavior/config changes.
- Add clear reproduction steps for bug fixes.

## Code Style

- Keep server changes defensive (validate inputs and handle errors).
- Prefer readability over cleverness.
- Maintain mobile-first behavior in UI updates.

## Security Notes

- Never commit credentials or secrets.
- If touching auth/session/upload logic, document security impact in PR description.
