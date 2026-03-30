import express from 'express';
import { SessionStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateRoomCode, getLeaderboard } from '../services/session.service.js';

export const sessionRouter = express.Router();

sessionRouter.use(requireAuth);

sessionRouter.post('/launch/:quizId', requireRole('ORGANIZER'), async (req, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.quizId },
    include: {
      questions: {
        include: { options: true },
        orderBy: { orderIndex: 'asc' }
      }
    }
  });

  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  if (quiz.createdById !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!quiz.questions.length) {
    return res.status(400).json({ error: 'Quiz has no questions' });
  }

  const roomCode = await generateRoomCode();
  const session = await prisma.quizSession.create({
    data: {
      quizId: quiz.id,
      roomCode,
      createdById: req.user.id,
      status: SessionStatus.WAITING
    }
  });

  return res.status(201).json(session);
});

sessionRouter.post('/join', requireRole('PARTICIPANT'), async (req, res) => {
  const { roomCode } = req.body;
  if (!roomCode) {
    return res.status(400).json({ error: 'roomCode is required' });
  }

  const session = await prisma.quizSession.findUnique({
    where: { roomCode },
    include: {
      quiz: { select: { id: true, title: true, status: true } }
    }
  });

  if (!session) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (session.status === SessionStatus.FINISHED) {
    return res.status(400).json({ error: 'Квиз уже завершен' });
  }

  const activeOtherSession = await prisma.sessionParticipant.findFirst({
    where: {
      userId: req.user.id,
      session: {
        id: { not: session.id },
        status: { in: [SessionStatus.WAITING, SessionStatus.LIVE] }
      }
    },
    include: { session: true }
  });

  if (activeOtherSession) {
    return res.status(400).json({ error: 'Вы уже участвуете в другом активном квизе' });
  }

  const existingParticipant = await prisma.sessionParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: req.user.id
      }
    }
  });

  if (session.status !== SessionStatus.WAITING && !existingParticipant) {
    return res.status(400).json({ error: 'К этой комнате нельзя подключиться: квиз уже запущен или завершен' });
  }

  const participant = await prisma.sessionParticipant.upsert({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: req.user.id
      }
    },
    create: {
      sessionId: session.id,
      userId: req.user.id
    },
    update: {},
    include: {
      user: { select: { id: true, displayName: true, email: true } }
    }
  });

  return res.json({
    session: {
      id: session.id,
      roomCode: session.roomCode,
      status: session.status,
      quiz: session.quiz,
      currentQuestionId: session.currentQuestionId
    },
    participant
  });
});

sessionRouter.post('/:sessionId/leave', requireRole('PARTICIPANT'), async (req, res) => {
  const session = await prisma.quizSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const participant = await prisma.sessionParticipant.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: req.user.id } }
  });

  if (!participant) return res.status(404).json({ error: 'Participant not found in this session' });

  await prisma.sessionParticipant.delete({ where: { id: participant.id } });
  return res.json({ ok: true });
});

sessionRouter.post('/:sessionId/cancel', requireRole('ORGANIZER'), async (req, res) => {
  const session = await prisma.quizSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (session.status !== SessionStatus.WAITING) {
    return res.status(400).json({ error: 'Можно отменить только квиз в ожидании игроков' });
  }

  await prisma.quizSession.update({
    where: { id: session.id },
    data: { status: SessionStatus.FINISHED, finishedAt: new Date(), currentQuestionId: null }
  });
  return res.json({ ok: true });
});

sessionRouter.get('/:sessionId/leaderboard', async (req, res) => {
  const session = await prisma.quizSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const isOwner = session.createdById === req.user.id;
  const isParticipant = await prisma.sessionParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: req.user.id
      }
    }
  });

  if (!isOwner && !isParticipant) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const leaderboard = await getLeaderboard(session.id);
  return res.json({ leaderboard, status: session.status });
});
