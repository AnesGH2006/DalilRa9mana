import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { agentHandler } from "./agentHandler.js";
import { db, agentTokensTable, schoolMembersTable } from "../../shared/db.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getSession, SESSION_COOKIE } from "../lib/auth.js";

let io: SocketIOServer;

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function initSocketIO(httpServer: HttpServer): void {
  io = new SocketIOServer(httpServer, {
    // Allow any origin — the desktop agent connects from file:// (null origin).
    // Auth is enforced by Bearer token in the socket middleware below, not by origin.
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/agent-socket",
  });

  // Auth middleware — validate agent token on every connection
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    try {
      if (token) {
        const [agentToken] = await db
          .select()
          .from(agentTokensTable)
          .where(eq(agentTokensTable.token, token));

        if (!agentToken) return next(new Error("Invalid token"));
        if (agentToken.expiresAt && agentToken.expiresAt < new Date()) {
          return next(new Error("Token expired"));
        }
        (socket as any).agentToken = agentToken;
        return next();
      }

      const cookieHeader = socket.handshake.headers.cookie ?? "";
      const encodedSessionId = cookieHeader.split(";").map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
      if (!encodedSessionId) return next(new Error("Missing session"));
      const sessionId = decodeURIComponent(encodedSessionId);
      const session = await getSession(sessionId);
      if (!session) return next(new Error("Invalid session"));

      const [member] = await db.select({ schoolUserId: schoolMembersTable.schoolUserId, role: schoolMembersTable.role })
        .from(schoolMembersTable)
        .where(eq(schoolMembersTable.memberUserId, session.user.id))
        .limit(1);
      if (member && member.role !== "teacher") return next(new Error("Dashboard access denied"));

      (socket as any).dashboardUserId = session.user.id;
      (socket as any).schoolUserId = member?.schoolUserId ?? session.user.id;
      next();
    } catch (err) {
      logger.error(err, "Socket auth error");
      next(new Error("Auth error"));
    }
  });

  io.on("connection", (socket) => {
    const dashboardUserId = (socket as any).dashboardUserId as string | undefined;
    if (dashboardUserId) {
      const schoolUserId = (socket as any).schoolUserId as string;
      socket.join(`school:${schoolUserId}`);
      logger.info({ dashboardUserId, schoolUserId }, "Dashboard connected to attendance updates");
      return;
    }
    const agentToken = (socket as any).agentToken;
    logger.info({ agentTokenId: agentToken.id, device: agentToken.deviceName }, "Agent connected");
    agentHandler(io, socket);
  });

  logger.info("Socket.IO initialized at /agent-socket");
}
