import { PrismaClient } from '@prisma/client';

function resolveBusinessDateFromReset(now: Date, resetTime: string): Date {
  const [resetH, resetM] = resetTime.split(':').map(Number);
  const resetPoint = new Date(now);
  resetPoint.setHours(resetH, resetM, 0, 0);

  // If current time is before today's reset point, business date is previous day.
  if (now < resetPoint) {
    resetPoint.setDate(resetPoint.getDate() - 1);
  }

  return new Date(resetPoint.getFullYear(), resetPoint.getMonth(), resetPoint.getDate());
}

export async function getCurrentBusinessDate(
  restaurantId: number,
  prisma: PrismaClient,
): Promise<Date> {
  const config = await prisma.tokenCounterConfig.findUnique({ where: { restaurantId } });
  const resetTimeStr = config?.resetTime ?? '00:00';
  return resolveBusinessDateFromReset(new Date(), resetTimeStr);
}

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
  const businessDate = resolveBusinessDateFromReset(new Date(), resetTimeStr);

  const lastToken = await prisma.bakeryToken.findFirst({
    where: {
      restaurantId,
      branchId,
      businessDate,
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
