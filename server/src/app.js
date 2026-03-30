import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.routes.js';
import { quizRouter } from './routes/quiz.routes.js';
import { sessionRouter } from './routes/session.routes.js';
import { profileRouter } from './routes/profile.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'quiz-backend' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/quizzes', quizRouter);
  app.use('/api/sessions', sessionRouter);
  app.use('/api/profile', profileRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
