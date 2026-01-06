# AI Infrastructure Hiring Radar (USA) — v2.2

Fixes:
- Prisma relation back-reference (Job.notes)
- No reliance on `@/*` path alias (uses relative imports), but alias is also configured in tsconfig for convenience.

## Quickstart
```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Open http://localhost:3000
