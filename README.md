# Quiz backend (MVP)

Серверная часть для приложения квизов с регистрацией, созданием викторин и real-time игрой через WebSocket.

## Стек

- Node.js + Express
- Prisma + SQLite
- Socket.IO (реальное время)
- JWT + bcrypt

## Запуск

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

## Роли

- `ORGANIZER`: создаёт квизы, вопросы, запускает сессии
- `PARTICIPANT`: подключается по коду комнаты и отвечает на вопросы

## REST API

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Quizzes

- `POST /api/quizzes` (organizer)
- `GET /api/quizzes`
- `GET /api/quizzes/:quizId`
- `PATCH /api/quizzes/:quizId` (organizer)
- `POST /api/quizzes/:quizId/questions` (organizer)

### Sessions

- `POST /api/sessions/launch/:quizId` (organizer)
- `POST /api/sessions/join` (participant)
- `GET /api/sessions/:sessionId/leaderboard`

### Profile

- `GET /api/profile/dashboard`

## Socket events

Клиент подключается с `auth.token = JWT`.

### Входящие (client -> server)

- `session:join-room` `{ roomCode }`
- `session:start` `{ sessionId }` (organizer)
- `session:next-question` `{ sessionId }` (organizer)
- `session:submit-answer` `{ sessionId, questionId, optionIds[] }` (participant)

### Исходящие (server -> client)

- `connected`
- `session:participant-joined`
- `session:started`
- `session:question`
- `session:leaderboard-update`
- `session:finished`

## Что реализовано из ТЗ

- Регистрация и авторизация участников/организаторов
- Создание квизов, категории, настройки
- Добавление вопросов с одиночным/множественным выбором, включая `IMAGE` тип
- Запуск сессии по коду комнаты и real-time показ вопросов
- Подсчёт баллов, лидерборд, завершение игры
- Личный кабинет (история участия/проведённых квизов)
