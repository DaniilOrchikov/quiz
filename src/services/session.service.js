import { SessionStatus } from '@prisma/client';
import { prisma } from '../db.js';

export async function generateRoomCode() {
  const symbols = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 20; i += 1) {
    const roomCode = Array.from({ length: 6 }, () => symbols[Math.floor(Math.random() * symbols.length)]).join('');
    const exists = await prisma.quizSession.findUnique({ where: { roomCode } });
    if (!exists) {
      return roomCode;
    }
  }
  throw new Error('Could not generate unique room code');
}

function sortedIds(ids) {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export async function evaluateAnswer({ sessionId, userId, questionId, optionIds }) {
  const sessionParticipant = await prisma.sessionParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId
      }
    }
  });

  if (!sessionParticipant) {
    throw new Error('Participant is not connected to this session');
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { options: true }
  });

  if (!question) {
    throw new Error('Question not found');
  }

  const selectedOptions = question.options.filter((option) => optionIds.includes(option.id));
  const selectedIds = sortedIds(selectedOptions.map((option) => option.id));
  const correctIds = sortedIds(question.options.filter((option) => option.isCorrect).map((option) => option.id));

  const isCorrect = selectedIds.length === correctIds.length
    && selectedIds.every((id, index) => id === correctIds[index]);

  const earnedPoints = isCorrect ? question.points : 0;

  const answer = await prisma.$transaction(async (tx) => {
    const created = await tx.answer.create({
      data: {
        sessionId,
        questionId,
        participantId: sessionParticipant.id,
        isCorrect,
        earnedPoints,
        selected: {
          create: selectedOptions.map((option) => ({ optionId: option.id }))
        }
      },
      include: { selected: true }
    });

    await tx.sessionParticipant.update({
      where: { id: sessionParticipant.id },
      data: { totalScore: { increment: earnedPoints } }
    });

    return created;
  });

  return { answer, earnedPoints, isCorrect };
}

export async function getLeaderboard(sessionId) {
  return prisma.sessionParticipant.findMany({
    where: { sessionId },
    select: {
      id: true,
      totalScore: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      }
    },
    orderBy: [{ totalScore: 'desc' }, { joinedAt: 'asc' }]
  });
}

export function assertSessionLive(session) {
  if (session.status !== SessionStatus.LIVE) {
    throw new Error('Session is not live');
  }
}
