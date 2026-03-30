import express from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const profileRouter = express.Router();

profileRouter.use(requireAuth);

profileRouter.get('/dashboard', async (req, res) => {
  if (req.user.role === 'ORGANIZER') {
    const quizzes = await prisma.quiz.findMany({
      where: { createdById: req.user.id },
      include: {
        _count: { select: { questions: true, sessions: true } },
        sessions: {
          select: {
            id: true,
            roomCode: true,
            status: true,
            createdAt: true,
            startedAt: true,
            finishedAt: true,
            _count: { select: { participants: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ role: req.user.role, quizzes });
  }

  const participations = await prisma.sessionParticipant.findMany({
    where: { userId: req.user.id },
    include: {
      session: {
        select: {
          id: true,
          roomCode: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          quiz: { select: { id: true, title: true } }
        }
      }
    },
    orderBy: { joinedAt: 'desc' }
  });

  return res.json({ role: req.user.role, participations });
});
