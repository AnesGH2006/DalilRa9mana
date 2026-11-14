/**
 * calendar_task_tool — creates reminders, lists pending tasks, and marks them complete.
 * Stores tasks in the `reminders` table. Deadline tracking included.
 */
import { db, remindersTable } from "../../../shared/db.js";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface CalendarTaskInput {
  action: "create" | "list" | "complete" | "dismiss" | "upcoming";
  title?: string;
  description?: string;
  due_date?: string;          // ISO date string, e.g. "2026-02-14"
  due_time?: string;          // e.g. "09:00"
  priority?: "low" | "medium" | "high";
  category?: string;          // e.g. "اجتماع", "تقرير", "غياب"
  task_id?: string;           // for complete/dismiss actions
  days_ahead?: number;        // for "upcoming" — default 7
}

export async function calendarTaskTool(input: CalendarTaskInput, userId: string): Promise<unknown> {
  switch (input.action) {
    case "create": {
      if (!input.title) return { error: "حقل العنوان مطلوب لإنشاء المهمة" };

      let dueDate: Date | null = null;
      if (input.due_date) {
        const dateStr = input.due_time
          ? `${input.due_date}T${input.due_time}:00`
          : `${input.due_date}T08:00:00`;
        dueDate = new Date(dateStr);
        if (isNaN(dueDate.getTime())) dueDate = null;
      }

      const id = randomUUID();
      await db.insert(remindersTable).values({
        id,
        userId,
        title: input.title,
        description: input.description,
        dueDate: dueDate ?? undefined,
        priority: input.priority ?? "medium",
        category: input.category,
        status: "pending",
      });

      const dueFmt = dueDate
        ? dueDate.toLocaleDateString("ar-DZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
        : "غير محدد";

      return {
        success: true,
        task_id: id,
        title: input.title,
        due_date: dueFmt,
        priority: input.priority ?? "medium",
        message: `✅ تم إنشاء التذكير: "${input.title}" — الموعد: ${dueFmt}`,
      };
    }

    case "list": {
      const tasks = await db.select().from(remindersTable)
        .where(and(eq(remindersTable.userId, userId), eq(remindersTable.status, "pending")))
        .orderBy(desc(remindersTable.dueDate))
        .limit(20);

      return {
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          due_date: t.dueDate ? t.dueDate.toISOString() : null,
          priority: t.priority,
          category: t.category,
          status: t.status,
        })),
      };
    }

    case "upcoming": {
      const daysAhead = input.days_ahead ?? 7;
      const now = new Date();
      const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      const tasks = await db.select().from(remindersTable)
        .where(and(
          eq(remindersTable.userId, userId),
          eq(remindersTable.status, "pending"),
          gte(remindersTable.dueDate, now),
          lte(remindersTable.dueDate, future),
        ))
        .orderBy(remindersTable.dueDate)
        .limit(20);

      return {
        period: `${daysAhead} أيام القادمة`,
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          due_date: t.dueDate ? t.dueDate.toLocaleDateString("ar-DZ", { weekday: "short", month: "short", day: "numeric" }) : null,
          priority: t.priority,
          category: t.category,
        })),
      };
    }

    case "complete": {
      if (!input.task_id) return { error: "task_id مطلوب" };
      await db.update(remindersTable)
        .set({ status: "completed", updatedAt: new Date() })
        .where(and(eq(remindersTable.id, input.task_id), eq(remindersTable.userId, userId)));
      return { success: true, message: `تم تحديد المهمة كمنجزة.` };
    }

    case "dismiss": {
      if (!input.task_id) return { error: "task_id مطلوب" };
      await db.update(remindersTable)
        .set({ status: "dismissed", updatedAt: new Date() })
        .where(and(eq(remindersTable.id, input.task_id), eq(remindersTable.userId, userId)));
      return { success: true, message: `تم إلغاء التذكير.` };
    }

    default:
      return { error: "إجراء غير معروف" };
  }
}
