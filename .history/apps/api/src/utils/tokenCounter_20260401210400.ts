import { PrismaClient } from '@prisma/client';

/**
 * Returns the next token number for a given branch on today's date.
 * Token numbers are sequential per-branch per-day (reset daily at configured time).
 */
export async function getNextTokenNumber(
  restaurantId: number,
  branchId: number,
  prisma: PrismaClient,
): Promise<number> {
  const config = await prisma.tokenCounterConfig.findUnique({ where: { restaurantId } });
  const start = config?.startNumber ?? 1;
  const end = config?.endNumber ?? 9999;

  const resetTimeStr = config?.resetTime ?? '00:00';
  const [resetH, resetM] = resetTimeStr.split(':').map(Number);

  const now = new Date();
  const resetPoint = new Date();
  resetPoint.setHours(resetH, resetM, 0, 0);

  // If current time is before today's reset point, use yesterday's reset point
  if (now < resetPoint) {
    resetPoint.setDate(resetPoint.getDate() - 1);
  }

  const lastToken = await prisma.bakeryToken.findFirst({
    where: {
      restaurantId,
      branchId,
      createdAt: { gte: resetPoint },
    },
    orderBy: { tokenNumber: 'desc' },
  });

  if (!lastToken) return start;
  if (lastToken.tokenNumber >= end) return start; // wrap around
  return lastToken.tokenNumber + 1;
}

/**
 * Checks if the token counter should reset based on the configured reset time.
 * Called every minute from the cron in app.ts.
 */
export async function checkAndResetTokenCounters(prisma: PrismaClient): Promise<void> {
  const configs = await prisma.tokenCounterConfig.findMany();
  const now = new Date();
  const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  for (const config of configs) {
    if (config.resetTime === hhmm) {
      const alreadyResetToday =
        config.lastResetAt !== null &&
        config.lastResetAt !== undefined &&
        config.lastResetAt.toDateString() === now.toDateString();

      if (!alreadyResetToday) {
        await prisma.tokenCounterConfig.update({
          where: { id: config.id },
          data: { lastResetAt: now },
        });
        // Caller (app.ts) can emit socket event after this returns
        console.log(`[TokenCounter] Reset triggered for restaurantId=${config.restaurantId} at ${hhmm}`);
      }
    }
  }
}
