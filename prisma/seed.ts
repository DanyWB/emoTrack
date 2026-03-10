import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const predefinedTags = [
  { key: 'anxiety', label: 'Тревога', sortOrder: 10 },
  { key: 'fatigue', label: 'Усталость', sortOrder: 20 },
  { key: 'motivation', label: 'Мотивация', sortOrder: 30 },
  { key: 'calm', label: 'Спокойствие', sortOrder: 40 },
  { key: 'irritation', label: 'Раздражение', sortOrder: 50 },
  { key: 'apathy', label: 'Апатия', sortOrder: 60 },
  { key: 'inspiration', label: 'Вдохновение', sortOrder: 70 },
  { key: 'overload', label: 'Перегрузка', sortOrder: 80 },
  { key: 'loneliness', label: 'Одиночество', sortOrder: 90 },
  { key: 'productivity', label: 'Продуктивность', sortOrder: 100 },
] as const;

async function main(): Promise<void> {
  for (const tag of predefinedTags) {
    await prisma.predefinedTag.upsert({
      where: { key: tag.key },
      create: {
        key: tag.key,
        label: tag.label,
        isActive: true,
        sortOrder: tag.sortOrder,
      },
      update: {
        label: tag.label,
        isActive: true,
        sortOrder: tag.sortOrder,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
