import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organizerPassword = await bcrypt.hash('organizer123', 10);
  const participantPassword = await bcrypt.hash('participant123', 10);

  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@example.com' },
    update: {},
    create: {
      email: 'organizer@example.com',
      displayName: 'Demo Organizer',
      role: 'ORGANIZER',
      passwordHash: organizerPassword
    }
  });

  await prisma.user.upsert({
    where: { email: 'participant@example.com' },
    update: {},
    create: {
      email: 'participant@example.com',
      displayName: 'Demo Participant',
      role: 'PARTICIPANT',
      passwordHash: participantPassword
    }
  });

  const category = await prisma.category.upsert({
    where: { name: 'General Knowledge' },
    update: {},
    create: { name: 'General Knowledge' }
  });

  const quiz = await prisma.quiz.create({
    data: {
      title: 'Sample Quiz',
      description: 'Simple seeded quiz for local testing',
      status: 'PUBLISHED',
      createdById: organizer.id,
      categories: {
        create: [{ categoryId: category.id }]
      },
      questions: {
        create: [
          {
            type: 'TEXT',
            prompt: 'What is the capital of France?',
            orderIndex: 0,
            points: 100,
            options: {
              create: [
                { text: 'Berlin', isCorrect: false },
                { text: 'Paris', isCorrect: true },
                { text: 'Madrid', isCorrect: false }
              ]
            }
          }
        ]
      }
    }
  });

  console.log(`Seed complete. Quiz ID: ${quiz.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
