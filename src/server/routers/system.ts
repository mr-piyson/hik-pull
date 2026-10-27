import { prisma } from "@/lib/hik/db";
import { publicProcedure, router } from "../trpc";

export const systemRouter = router({
  bootstrap: publicProcedure.query(async () => {
    const userCount = await prisma.authUser.count();
    const adminCount = await prisma.authUser.count({
      where: { role: "admin" },
    });
    if (userCount > 0 && adminCount === 0) {
      const first = await prisma.authUser.findFirst({
        orderBy: { createdAt: "asc" },
      });
      if (first) {
        await prisma.authUser.update({
          where: { id: first.id },
          data: { role: "admin" },
        });
      }
    }
    return { userCount, hasUsers: userCount > 0 };
  }),
});
