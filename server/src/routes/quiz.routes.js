import express from 'express';
import { QuestionType, QuizStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const quizRouter = express.Router();
const DELETED_PREFIX = '[Удален] ';

quizRouter.use(requireAuth);

quizRouter.post('/', requireRole('ORGANIZER'), async (req, res) => {
  const { title, description, defaultTime = 20, categoryNames = [] } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const quiz = await prisma.quiz.create({
    data: {
      title,
      description,
      defaultTime,
      createdById: req.user.id,
      categories: {
        create: await Promise.all(
          [...new Set(categoryNames)].map(async (name) => {
            const category = await prisma.category.upsert({
              where: { name },
              create: { name },
              update: {}
            });
            return { categoryId: category.id };
          })
        )
      }
    },
    include: {
      categories: { include: { category: true } },
      questions: { include: { options: true }, orderBy: { orderIndex: 'asc' } }
    }
  });

  return res.status(201).json(quiz);
});

quizRouter.get('/', async (req, res) => {
  const where = req.user.role === 'ORGANIZER'
    ? { createdById: req.user.id, NOT: { title: { startsWith: DELETED_PREFIX } } }
    : { status: 'PUBLISHED', NOT: { title: { startsWith: DELETED_PREFIX } } };

  const quizzes = await prisma.quiz.findMany({
    where,
    include: {
      categories: { include: { category: true } },
      _count: { select: { questions: true, sessions: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json(quizzes);
});

quizRouter.get('/:quizId', async (req, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.quizId },
    include: {
      categories: { include: { category: true } },
      questions: { include: { options: true }, orderBy: { orderIndex: 'asc' } }
    }
  });

  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  if (quiz.title.startsWith(DELETED_PREFIX)) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  if (req.user.role === 'ORGANIZER' && quiz.createdById !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.user.role !== 'ORGANIZER' && quiz.status !== 'PUBLISHED') {
    return res.status(403).json({ error: 'Quiz is not published' });
  }

  return res.json(quiz);
});

quizRouter.patch('/:quizId', requireRole('ORGANIZER'), async (req, res) => {
  const { title, description, defaultTime, status, categoryNames } = req.body;

  const quiz = await prisma.quiz.findUnique({ where: { id: req.params.quizId } });
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  if (quiz.createdById !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (status && !Object.values(QuizStatus).includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${Object.values(QuizStatus).join(', ')}` });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (Array.isArray(categoryNames)) {
      await tx.quizCategory.deleteMany({ where: { quizId: quiz.id } });

      for (const name of [...new Set(categoryNames)]) {
        const category = await tx.category.upsert({
          where: { name },
          create: { name },
          update: {}
        });
        await tx.quizCategory.create({
          data: {
            quizId: quiz.id,
            categoryId: category.id
          }
        });
      }
    }

    return tx.quiz.update({
      where: { id: quiz.id },
      data: {
        title: title ?? undefined,
        description: description ?? undefined,
        defaultTime: defaultTime ?? undefined,
        status: status ?? undefined
      },
      include: {
        categories: { include: { category: true } },
        questions: { include: { options: true }, orderBy: { orderIndex: 'asc' } }
      }
    });
  });

  return res.json(updated);
});

quizRouter.delete('/:quizId', requireRole('ORGANIZER'), async (req, res) => {
  const quiz = await prisma.quiz.findUnique({ where: { id: req.params.quizId } });
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  if (quiz.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await prisma.quiz.update({
    where: { id: quiz.id },
    data: {
      status: 'DRAFT',
      title: quiz.title.startsWith(DELETED_PREFIX) ? quiz.title : `${DELETED_PREFIX}${quiz.title}`
    }
  });

  return res.json({ ok: true });
});

quizRouter.post('/:quizId/questions', requireRole('ORGANIZER'), async (req, res) => {
  const { type, prompt, imageUrl, allowMultiple = false, timeLimitSec, points = 100, options } = req.body;

  if (!type || !Object.values(QuestionType).includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${Object.values(QuestionType).join(', ')}` });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  if (!Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'At least 2 answer options are required' });
  }

  if (!options.some((option) => option.isCorrect)) {
    return res.status(400).json({ error: 'At least one correct option is required' });
  }

  const correctOptionsCount = options.filter((option) => option.isCorrect).length;
  if (!allowMultiple && correctOptionsCount !== 1) {
    return res.status(400).json({ error: 'Single-choice question must contain exactly one correct option' });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.quizId },
    include: { _count: { select: { questions: true } } }
  });

  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  if (quiz.createdById !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const question = await prisma.question.create({
    data: {
      quizId: quiz.id,
      type,
      prompt,
      imageUrl: imageUrl || null,
      allowMultiple,
      timeLimitSec: timeLimitSec ?? null,
      points,
      orderIndex: quiz._count.questions,
      options: {
        create: options.map((option) => ({ text: option.text, isCorrect: Boolean(option.isCorrect) }))
      }
    },
    include: { options: true }
  });

  return res.status(201).json(question);
});

quizRouter.patch('/:quizId/questions/:questionId', requireRole('ORGANIZER'), async (req, res) => {
  const { prompt, imageUrl, allowMultiple, timeLimitSec, points, options } = req.body;

  const question = await prisma.question.findUnique({
    where: { id: req.params.questionId },
    include: { quiz: true, options: true }
  });

  if (!question || question.quizId !== req.params.quizId) {
    return res.status(404).json({ error: 'Question not found' });
  }

  if (question.quiz.createdById !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (Array.isArray(options)) {
    if (options.length < 2) return res.status(400).json({ error: 'At least 2 options are required' });
    if (!options.some((option) => option.isCorrect)) return res.status(400).json({ error: 'At least one correct option is required' });

    const nextAllowMultiple = allowMultiple ?? question.allowMultiple;
    const correctOptionsCount = options.filter((option) => option.isCorrect).length;
    if (!nextAllowMultiple && correctOptionsCount !== 1) {
      return res.status(400).json({ error: 'Single-choice question must contain exactly one correct option' });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (Array.isArray(options)) {
      await tx.option.deleteMany({ where: { questionId: question.id } });
    }

    return tx.question.update({
      where: { id: question.id },
      data: {
        prompt: prompt ?? undefined,
        imageUrl: imageUrl ?? undefined,
        allowMultiple: allowMultiple ?? undefined,
        timeLimitSec: timeLimitSec ?? undefined,
        points: points ?? undefined,
        options: Array.isArray(options)
          ? { create: options.map((option) => ({ text: option.text, isCorrect: Boolean(option.isCorrect) })) }
          : undefined
      },
      include: { options: true }
    });
  });

  return res.json(updated);
});

quizRouter.delete('/:quizId/questions/:questionId', requireRole('ORGANIZER'), async (req, res) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.questionId },
    include: { quiz: true }
  });

  if (!question || question.quizId !== req.params.quizId) {
    return res.status(404).json({ error: 'Question not found' });
  }

  if (question.quiz.createdById !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.question.delete({
      where: { id: question.id }
    });

    const remainingQuestions = await tx.question.findMany({
      where: { quizId: req.params.quizId },
      orderBy: { orderIndex: 'asc' }
    });

    await Promise.all(
      remainingQuestions.map((item, index) => tx.question.update({
        where: { id: item.id },
        data: { orderIndex: index }
      }))
    );
  });

  return res.json({ ok: true });
});
