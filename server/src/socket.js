import { Server } from 'socket.io';
import { SessionStatus } from '@prisma/client';
import { config } from './config.js';
import { prisma } from './db.js';
import { verifyToken } from './utils/jwt.js';
import { assertSessionLive, evaluateAnswer, getLeaderboard } from './services/session.service.js';

const roomName = (sessionId) => `session:${sessionId}`;
const sessionTimers = new Map();
const questionRuntime = new Map();

async function getSessionWithQuiz(sessionId) {
  return prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: { include: { options: true }, orderBy: { orderIndex: 'asc' } }
        }
      },
      participants: true
    }
  });
}

function getSafeQuestion(question, fallbackTime) {
  if (!question) return null;
  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    imageUrl: question.imageUrl,
    allowMultiple: question.allowMultiple,
    timeLimitSec: question.timeLimitSec || fallbackTime,
    points: question.points,
    orderIndex: question.orderIndex,
    options: question.options.map((option) => ({ id: option.id, text: option.text }))
  };
}

function clearSessionTimer(sessionId) {
  const activeTimer = sessionTimers.get(sessionId);
  if (activeTimer) {
    clearTimeout(activeTimer);
    sessionTimers.delete(sessionId);
  }
}

async function emitAnswerStats(io, sessionId, questionId) {
  const [totalPlayers, answeredPlayers, answers] = await Promise.all([
    prisma.sessionParticipant.count({ where: { sessionId } }),
    prisma.answer.count({ where: { sessionId, questionId } }),
    prisma.answer.findMany({ where: { sessionId, questionId }, select: { isCorrect: true } })
  ]);

  const correctAnswers = answers.filter((answer) => answer.isCorrect).length;
  const wrongAnswers = answeredPlayers - correctAnswers;
  const correctPercent = answeredPlayers ? Math.round((correctAnswers / answeredPlayers) * 100) : 0;
  const wrongPercent = answeredPlayers ? Math.round((wrongAnswers / answeredPlayers) * 100) : 0;

  io.to(roomName(sessionId)).emit('session:answer-stats', {
    sessionId,
    questionId,
    answeredPlayers,
    totalPlayers,
    correctAnswers,
    wrongAnswers,
    correctPercent,
    wrongPercent
  });

  return { answeredPlayers, totalPlayers, correctAnswers, wrongAnswers, correctPercent, wrongPercent };
}

async function emitParticipantCount(io, sessionId) {
  const totalPlayers = await prisma.sessionParticipant.count({ where: { sessionId } });
  io.to(roomName(sessionId)).emit('session:participant-count', { sessionId, totalPlayers });
}

async function advanceToNextQuestion(io, sessionId) {
  const session = await getSessionWithQuiz(sessionId);
  if (!session) return;

  const currentIndex = session.quiz.questions.findIndex((question) => question.id === session.currentQuestionId);
  const nextQuestion = session.quiz.questions[currentIndex + 1];

  if (!nextQuestion) {
    clearSessionTimer(session.id);
    questionRuntime.delete(session.id);
    const leaderboard = await getLeaderboard(session.id);
    await prisma.quizSession.update({
      where: { id: session.id },
      data: { status: SessionStatus.FINISHED, finishedAt: new Date(), currentQuestionId: null }
    });

    io.to(roomName(session.id)).emit('session:finished', { sessionId: session.id, leaderboard });
    return;
  }

  await prisma.quizSession.update({
    where: { id: session.id },
    data: { currentQuestionId: nextQuestion.id }
  });

  const safeQuestion = getSafeQuestion(nextQuestion, session.quiz.defaultTime);
  const startedAt = Date.now();
  questionRuntime.set(session.id, { questionId: nextQuestion.id, startedAt, durationSec: safeQuestion.timeLimitSec });
  io.to(roomName(session.id)).emit('session:question', {
    sessionId: session.id,
    question: safeQuestion,
    durationSec: safeQuestion.timeLimitSec,
    startedAt
  });

  clearSessionTimer(session.id);
  const timeout = setTimeout(() => {
    advanceToNextQuestion(io, session.id).catch(console.error);
  }, safeQuestion.timeLimitSec * 1000);
  sessionTimers.set(session.id, timeout);

  await emitAnswerStats(io, session.id, nextQuestion.id);
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin === '*' ? true : config.corsOrigin,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized'));

      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, displayName: true, email: true }
      });
      if (!user) return next(new Error('Unauthorized'));

      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('connected', { user: socket.data.user });

    socket.on('session:join-room', async ({ roomCode }, ack = () => {}) => {
      try {
        if (!roomCode) throw new Error('roomCode is required');

        const session = await prisma.quizSession.findUnique({
          where: { roomCode },
          include: {
            quiz: {
              include: {
                questions: { include: { options: true }, orderBy: { orderIndex: 'asc' } }
              }
            }
          }
        });

        if (!session) throw new Error('Room not found');
        if (session.status === SessionStatus.FINISHED) throw new Error('Квиз уже завершен');

        if (socket.data.user.role === 'PARTICIPANT') {
          const activeOtherSession = await prisma.sessionParticipant.findFirst({
            where: {
              userId: socket.data.user.id,
              session: {
                id: { not: session.id },
                status: { in: [SessionStatus.WAITING, SessionStatus.LIVE] }
              }
            }
          });
          if (activeOtherSession) throw new Error('Вы уже участвуете в другом активном квизе');

          const existingParticipant = await prisma.sessionParticipant.findUnique({
            where: { sessionId_userId: { sessionId: session.id, userId: socket.data.user.id } }
          });

          if (session.status !== SessionStatus.WAITING && !existingParticipant) {
            throw new Error('К этой комнате нельзя подключиться: квиз уже запущен или завершен');
          }

          await prisma.sessionParticipant.upsert({
            where: { sessionId_userId: { sessionId: session.id, userId: socket.data.user.id } },
            create: { sessionId: session.id, userId: socket.data.user.id },
            update: {}
          });
        }

        socket.join(roomName(session.id));
        socket.data.sessionId = session.id;

        const currentQuestion = session.currentQuestionId
          ? getSafeQuestion(session.quiz.questions.find((q) => q.id === session.currentQuestionId), session.quiz.defaultTime)
          : null;
        const runtime = questionRuntime.get(session.id);
        const remainingSec = runtime && runtime.questionId === session.currentQuestionId
          ? Math.max(0, Math.ceil((runtime.durationSec * 1000 - (Date.now() - runtime.startedAt)) / 1000))
          : currentQuestion?.timeLimitSec || 0;

        ack({
          ok: true,
          session: {
            id: session.id,
            roomCode: session.roomCode,
            status: session.status,
            quiz: { id: session.quiz.id, title: session.quiz.title, questionCount: session.quiz.questions.length },
            currentQuestion,
            remainingSec
          }
        });

        io.to(roomName(session.id)).emit('session:participant-joined', {
          user: { id: socket.data.user.id, displayName: socket.data.user.displayName }
        });
        await emitParticipantCount(io, session.id);
      } catch (error) {
        ack({ ok: false, error: error.message });
      }
    });

    socket.on('session:start', async ({ sessionId }, ack = () => {}) => {
      try {
        const session = await getSessionWithQuiz(sessionId);
        if (!session) throw new Error('Session not found');
        if (session.createdById !== socket.data.user.id) throw new Error('Only organizer can start the session');

        const firstQuestion = session.quiz.questions[0];
        if (!firstQuestion) throw new Error('Quiz has no questions');

        const updated = await prisma.quizSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.LIVE, startedAt: new Date(), currentQuestionId: firstQuestion.id }
        });

        const safeQuestion = getSafeQuestion(firstQuestion, session.quiz.defaultTime);
        const startedAt = Date.now();
        questionRuntime.set(session.id, { questionId: firstQuestion.id, startedAt, durationSec: safeQuestion.timeLimitSec });
        io.to(roomName(session.id)).emit('session:started', {
          sessionId: session.id,
          status: updated.status,
          question: safeQuestion,
          durationSec: safeQuestion.timeLimitSec,
          startedAt
        });

        await emitAnswerStats(io, session.id, firstQuestion.id);
        clearSessionTimer(session.id);
        const timeout = setTimeout(() => {
          advanceToNextQuestion(io, session.id).catch(console.error);
        }, safeQuestion.timeLimitSec * 1000);
        sessionTimers.set(session.id, timeout);

        ack({ ok: true, sessionId: session.id, question: safeQuestion });
      } catch (error) {
        ack({ ok: false, error: error.message });
      }
    });

    socket.on('session:submit-answer', async ({ sessionId, questionId, optionIds = [] }, ack = () => {}) => {
      try {
        if (socket.data.user.role !== 'PARTICIPANT') throw new Error('Only participants can submit answers');

        const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
        if (!session) throw new Error('Session not found');
        assertSessionLive(session);
        if (session.currentQuestionId !== questionId) throw new Error('This question is no longer active');

        const existing = await prisma.answer.findFirst({
          where: {
            sessionId,
            questionId,
            participant: { userId: socket.data.user.id }
          }
        });
        if (existing) throw new Error('Answer already submitted');

        await evaluateAnswer({ sessionId, userId: socket.data.user.id, questionId, optionIds });
        ack({ ok: true, accepted: true });

        const leaderboard = await getLeaderboard(sessionId);
        io.to(roomName(sessionId)).emit('session:leaderboard-update', { sessionId, leaderboard });

        const stats = await emitAnswerStats(io, sessionId, questionId);
        if (stats.totalPlayers > 0 && stats.answeredPlayers >= stats.totalPlayers) {
          clearSessionTimer(sessionId);
          await advanceToNextQuestion(io, sessionId);
        }
      } catch (error) {
        ack({ ok: false, error: error.message });
      }
    });

    socket.on('session:leave', async ({ sessionId }, ack = () => {}) => {
      try {
        if (socket.data.user.role !== 'PARTICIPANT') throw new Error('Only participants can leave');
        const participant = await prisma.sessionParticipant.findUnique({
          where: { sessionId_userId: { sessionId, userId: socket.data.user.id } }
        });
        if (participant) {
          await prisma.sessionParticipant.delete({ where: { id: participant.id } });
        }
        socket.leave(roomName(sessionId));
        await emitParticipantCount(io, sessionId);
        io.to(roomName(sessionId)).emit('session:participant-left', {
          user: { id: socket.data.user.id, displayName: socket.data.user.displayName }
        });
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: error.message });
      }
    });

    socket.on('session:cancel', async ({ sessionId }, ack = () => {}) => {
      try {
        const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
        if (!session) throw new Error('Session not found');
        if (session.createdById !== socket.data.user.id) throw new Error('Only organizer can cancel');
        if (session.status !== SessionStatus.WAITING) throw new Error('Можно отменить только квиз в ожидании игроков');

        await prisma.quizSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.FINISHED, finishedAt: new Date(), currentQuestionId: null }
        });
        clearSessionTimer(session.id);
        questionRuntime.delete(session.id);
        io.to(roomName(session.id)).emit('session:cancelled', { sessionId: session.id });
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: error.message });
      }
    });
  });

  return io;
}
