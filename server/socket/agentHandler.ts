import type { Server as SocketIOServer, Socket } from "socket.io";
import { db, agentTokensTable, agentLogsTable } from "../../shared/db.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { randomUUID } from "crypto";

type AgentAction =
  | "upload_excel" | "print_report" | "open_folder" | "open_file"
  | "open_app" | "backup_reports" | "sync_data" | "monitor_folder"
  | "connect" | "disconnect";

const ALLOWED_ACTIONS = new Set<AgentAction>([
  "upload_excel", "print_report", "open_folder", "open_file",
  "open_app", "backup_reports", "sync_data", "monitor_folder",
]);

// ── Per-user agent socket registry ───────────────────────────────────────────
// Keyed by userId → the currently connected agent Socket.
const agentSockets = new Map<string, Socket>();

// ── Pending one-shot response callbacks ──────────────────────────────────────
// taskResult: userId → { action, resolve, reject, timer }
type ResultWaiter = {
  action: string;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const taskResultWaiters = new Map<string, ResultWaiter>();

// screenFrame: userId → { resolve, reject, timer }
type FrameWaiter = {
  resolve: (base64: string) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const screenFrameWaiters = new Map<string, FrameWaiter>();

/**
 * Send a desktop automation command to the connected agent for a user.
 *
 * Protocol (mirrors the existing Electron/renderer agent):
 *   Server  → Agent : `agent:command`  { action, payload }
 *   Agent   → Server: `agent:taskResult` { action, status, details, taskId }
 *
 * For `screenCapture` the agent additionally emits `agent:screenFrame` with
 * the raw base64 frame — so callers should use waitForScreenFrame() instead.
 *
 * Returns the details from agent:taskResult, or throws on timeout / no agent.
 */
export async function sendDesktopCommand(
  userId: string,
  action: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 30_000,
): Promise<unknown> {
  const socket = agentSockets.get(userId);
  if (!socket?.connected) {
    const errorMsg = "الوكيل غير متصل. تأكد من تشغيل تطبيق الوكيل على الحاسوب المحلي وتسجيل الدخول";
    logger.warn({ userId, action }, errorMsg);
    throw new Error(errorMsg);
  }

  // Reject any stale waiter for this user (commands must be sequential)
  const stale = taskResultWaiters.get(userId);
  if (stale) {
    clearTimeout(stale.timer);
    taskResultWaiters.delete(userId);
    stale.reject(new Error("تم إرسال أمر جديد — تم إلغاء الأمر السابق"));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      taskResultWaiters.delete(userId);
      const timeoutMsg = `انتهت مهلة الانتظار (${Math.round(timeoutMs / 1000)}ث) — قد لا يكون الوكيل نشطاً أو قد حدثت مشكلة في الاتصال`;
      logger.warn({ userId, action, timeoutMs }, timeoutMsg);
      reject(new Error(timeoutMsg));
    }, timeoutMs);

    taskResultWaiters.set(userId, { action, resolve, reject, timer });

    if (action === "send_sms") {
      // SMS has a dedicated event so Python agents can handle it without
      // conflating communication tasks with general desktop automation.
      socket.emit("send_sms", payload);
      logger.info({ userId, action, phone: payload.phone }, "SMS dispatch sent → send_sms");
    } else {
      // Emit to both Electron agent (agent:command) and Python agent
      // (execute_desktop_command) for the existing desktop command protocol.
      socket.emit("agent:command", { action, payload });
      socket.emit("execute_desktop_command", { action, payload });
      logger.info({ userId, action }, `Desktop command sent: ${action}`);
    }
  });
}

/**
 * Dispatch an SMS using the explicit `{ phone, message }` agent contract.
 * The resolved confirmation is returned to the AI tool and also broadcast to
 * any connected control-room UI.
 */
export function sendSmsToAgent(
  userId: string,
  payload: { phone: string; message: string },
  timeoutMs = 30_000,
): Promise<unknown> {
  if (!payload.phone?.trim() || !payload.message?.trim()) {
    return Promise.reject(new Error("phone و message مطلوبان لإرسال SMS"));
  }
  return sendDesktopCommand(userId, "send_sms", {
    phone: payload.phone.trim(),
    message: payload.message.trim(),
  }, timeoutMs);
}

/**
 * Wait for the next agent:screenFrame from the connected agent.
 * Pair this with sendDesktopCommand(userId, 'screenCapture') for screenshots.
 */
export async function waitForScreenFrame(
  userId: string,
  timeoutMs = 30_000,
): Promise<string> {
  // Cancel any previous waiter
  const stale = screenFrameWaiters.get(userId);
  if (stale) {
    clearTimeout(stale.timer);
    screenFrameWaiters.delete(userId);
    stale.reject(new Error("إلغاء انتظار لقطة شاشة سابقة"));
  }

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      screenFrameWaiters.delete(userId);
      reject(new Error("انتهت مهلة انتظار لقطة الشاشة"));
    }, timeoutMs);

    screenFrameWaiters.set(userId, { resolve, reject, timer });
  });
}

/**
 * Shared handler for any inbound screen frame — resolves a waiting
 * desktop_control_tool screenshot promise and broadcasts to the web
 * control room. Used by both `agent:screenFrame` (Electron) and
 * `screen_response` (Python agent).
 */
function resolveScreenFrame(userId: string, frame: unknown, io: SocketIOServer): void {
  const waiter = screenFrameWaiters.get(userId);
  if (waiter) {
    clearTimeout(waiter.timer);
    screenFrameWaiters.delete(userId);
    const base64 = typeof frame === "string" ? frame : JSON.stringify(frame);
    waiter.resolve(base64);
  }
  // Broadcast raw frame to any web dashboard listening on the control room
  io.to(`control:${userId}`).emit("agent:screenFrame", frame);
}

async function logAction(
  agentTokenId: string,
  userId: string,
  action: AgentAction,
  status: "success" | "failed",
  details?: object,
): Promise<void> {
  await db.insert(agentLogsTable).values({
    id: randomUUID(),
    agentTokenId,
    userId,
    action,
    status,
    details: details ?? null,
  });
}

export function agentHandler(io: SocketIOServer, socket: Socket): void {
  const agentToken = (socket as any).agentToken;
  const { id: agentTokenId, userId } = agentToken;

  // Register socket for this user
  agentSockets.set(userId, socket);

  // Mark as seen
  db.update(agentTokensTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(agentTokensTable.id, agentTokenId))
    .catch((e) => logger.error(e, "lastSeenAt update failed"));

  logAction(agentTokenId, userId, "connect", "success").catch(() => {});

  // ── Heartbeat ───────────────────────────────────────────────────────────────
  socket.on("agent:ping", (cb) => {
    db.update(agentTokensTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(agentTokensTable.id, agentTokenId))
      .catch(() => {});
    if (typeof cb === "function") cb({ ok: true, ts: Date.now() });
  });

  // ── Screen frame: from Electron agent after screenCapture or streaming ────────
  socket.on("agent:screenFrame", (frame: unknown) => {
    resolveScreenFrame(userId, frame, io);
  });

  // ── screen_response: Python desktop agent equivalent of agent:screenFrame ────
  socket.on("screen_response", (payload: unknown) => {
    // Python agent sends { image: "<base64>" } or a raw base64 string
    const frame =
      payload && typeof payload === "object" && "image" in (payload as Record<string, unknown>)
        ? (payload as Record<string, unknown>).image
        : payload;
    resolveScreenFrame(userId, frame, io);
  });

  // ── Shell result forwarded to web clients ─────────────────────────────────────
  socket.on("agent:shellResult", (result: unknown) => {
    io.to(`control:${userId}`).emit("agent:shellResult", result);
  });

  // ── Task result from agent (response to agent:command) ──────────────────────
  socket.on("agent:taskResult", async (payload: {
    action: string;
    status: "success" | "failed";
    details?: object;
    taskId?: string;
  }) => {
    // 1. Resolve a pending command waiter
    const waiter = taskResultWaiters.get(userId);
    if (waiter) {
      // Accept if the action matches OR if we accept any result (loose match)
      if (!waiter.action || waiter.action === payload.action) {
        clearTimeout(waiter.timer);
        taskResultWaiters.delete(userId);
        if (payload.status === "success") {
          logger.info({ userId, action: payload.action }, `Task completed: ${payload.action}`);
          waiter.resolve(payload.details ?? { ok: true, action: payload.action });
        } else {
          const errorMsg = `فشل تنفيذ المهمة "${payload.action}" على الجهاز المحلي. تفاصيل: ${JSON.stringify(payload.details)}`;
          logger.warn({ userId, action: payload.action, details: payload.details }, errorMsg);
          waiter.reject(new Error(errorMsg));
        }
      }
    }

    // 2. Persist known administrative actions
    if (ALLOWED_ACTIONS.has(payload.action as AgentAction)) {
      await logAction(agentTokenId, userId, payload.action as AgentAction, payload.status, payload.details).catch(() => {});
    }

    io.to(`control:${userId}`).emit("agent:actionConfirmation", {
      action: payload.action,
      status: payload.status,
      details: payload.details,
      taskId: payload.taskId,
    });
    if (payload.action === "send_sms") {
      io.to(`control:${userId}`).emit("agent:smsConfirmation", {
        status: payload.status,
        details: payload.details,
        taskId: payload.taskId,
      });
    }
  });

  // ── task_result: Python agent equivalent of agent:taskResult ────────────────
  // Python agent sends { action, status, result } where result maps to details.
  socket.on("task_result", async (payload: {
    action?: string;
    status?: "success" | "failed" | "ok" | "error";
    result?: object;
    details?: object;
  }) => {
    const normalised = {
      action: payload.action ?? "unknown",
      status: (payload.status === "ok" || payload.status === "success") ? "success" as const : "failed" as const,
      details: payload.details ?? payload.result,
    };

    const waiter = taskResultWaiters.get(userId);
    if (waiter) {
      if (!waiter.action || waiter.action === normalised.action) {
        clearTimeout(waiter.timer);
        taskResultWaiters.delete(userId);
        if (normalised.status === "success") {
          waiter.resolve(normalised.details ?? { ok: true, action: normalised.action });
        } else {
          waiter.reject(new Error(`فشل تنفيذ "${normalised.action}" على الجهاز المحلي`));
        }
      }
    }

    if (ALLOWED_ACTIONS.has(normalised.action as AgentAction)) {
      await logAction(agentTokenId, userId, normalised.action as AgentAction, normalised.status, normalised.details).catch(() => {});
    }

    io.to(`control:${userId}`).emit("agent:actionConfirmation", normalised);
    if (normalised.action === "send_sms") {
      io.to(`control:${userId}`).emit("agent:smsConfirmation", normalised);
    }
  });

  // Dedicated confirmation emitted by the Python agent after GSM dispatch.
  // Keep this event separate from the generic task result so control-room
  // consumers can render an SMS-specific state immediately.
  socket.on("sms:confirmation", (payload: {
    status?: "success" | "failed";
    details?: object;
    taskId?: string;
  }) => {
    const normalised = {
      action: "send_sms",
      status: payload.status === "success" ? "success" as const : "failed" as const,
      details: payload.details,
      taskId: payload.taskId,
    };

    const waiter = taskResultWaiters.get(userId);
    if (waiter?.action === "send_sms") {
      clearTimeout(waiter.timer);
      taskResultWaiters.delete(userId);
      if (normalised.status === "success") {
        waiter.resolve(normalised.details ?? { ok: true, action: "send_sms" });
      } else {
        waiter.reject(new Error(`فشل إرسال SMS على الجهاز المحلي`));
      }
    }

    io.to(`control:${userId}`).emit("agent:actionConfirmation", normalised);
    io.to(`control:${userId}`).emit("agent:smsConfirmation", normalised);
  });

  // ── Server → agent commands ─────────────────────────────────────────────────
  socket.on("server:syncData", (payload: { year?: string }, cb) => {
    socket.emit("agent:command", { action: "syncData", payload });
    if (typeof cb === "function") cb({ queued: true });
  });

  socket.on("server:openFolder", (payload: { path: string }, cb) => {
    socket.emit("agent:command", { action: "openFolder", payload });
    if (typeof cb === "function") cb({ queued: true });
  });

  socket.on("server:backupReports", (
    payload: { sourceFolder: string; destFolder: string },
    cb,
  ) => {
    socket.emit("agent:command", { action: "backupReports", payload });
    if (typeof cb === "function") cb({ queued: true });
  });

  // ── Disconnect ──────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    // Deregister only if still this socket
    if (agentSockets.get(userId) === socket) {
      agentSockets.delete(userId);
    }

    // Reject any pending waiters for this user
    const taskWaiter = taskResultWaiters.get(userId);
    if (taskWaiter) {
      clearTimeout(taskWaiter.timer);
      taskResultWaiters.delete(userId);
      taskWaiter.reject(new Error("انقطع اتصال وكيل سطح المكتب"));
    }
    const frameWaiter = screenFrameWaiters.get(userId);
    if (frameWaiter) {
      clearTimeout(frameWaiter.timer);
      screenFrameWaiters.delete(userId);
      frameWaiter.reject(new Error("انقطع اتصال وكيل سطح المكتب"));
    }

    logger.info({ agentTokenId }, "Agent disconnected");
    logAction(agentTokenId, userId, "disconnect", "success").catch(() => {});
  });
}
