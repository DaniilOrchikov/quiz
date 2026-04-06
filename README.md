# Quiz Platform (server + frontend)

Монорепозиторий с полноценным MVP:

- `server` — API + WebSocket + SQLite (Prisma)
- `frontend` — SPA интерфейс без перезагрузок страницы

## Быстрый старт

### 1) Server

```bash
cd server
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

По умолчанию frontend ожидает backend на `http://localhost:4000`.

## Запуск через Docker Compose

```bash
docker compose up --build
```

Сервисы:
- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`

`docker-compose.yml` автоматически запускает Prisma schema push для SQLite внутри контейнера backend.
