/**
 * Desktop Control Tool
 * ─────────────────────
 * Allows the ReAct agent to control the user's local PC via the connected
 * Desktop Agent (Electron app in agent/).
 *
 * Protocol (uses the existing agent event contract):
 *   Server → Agent : socket.emit("agent:command", { action, payload })
 *   Agent  → Server: socket.emit("agent:taskResult", { action, status, details })
 *   Agent  → Server: socket.emit("agent:screenFrame", base64)  ← for screenshots
 *
 * The agent must be connected at /agent-socket with a valid token.
 */
import { sendDesktopCommand, waitForScreenFrame } from "../../socket/agentHandler.js";
import { logger } from "../logger.js";

export interface DesktopControlInput {
  action: "click" | "type" | "press" | "hotkey" | "screenshot";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  keys?: string[];
}

export async function desktopControlTool(
  input: DesktopControlInput,
  userId: string,
): Promise<unknown> {
  const { action } = input;
  logger.info({ userId, action }, "desktop_control_tool invoked");

  try {
    switch (action) {
      // ── Screenshot ──────────────────────────────────────────────────────────
      // Send screenCapture command, then wait for agent:screenFrame response.
      // The agent emits agent:screenFrame (not agent:taskResult) for captures,
      // so we use waitForScreenFrame() instead of waiting for taskResult.
      case "screenshot": {
        // Set up frame waiter BEFORE sending command to avoid race condition
        const framePromise = waitForScreenFrame(userId, 30_000);
        await sendDesktopCommand(userId, "screenCapture", {}, 30_000).catch(() => {
          // screenCapture may not emit taskResult before screenFrame — ignore taskResult timeout
        });
        const base64 = await framePromise;
        return {
          ok: true,
          action: "screenshot",
          base64_length: base64.length,
          message: "تم أخذ لقطة الشاشة بنجاح",
          // Include first 200 chars so LLM knows capture succeeded
          preview_hint: base64.slice(0, 200),
        };
      }

      // ── Mouse click ─────────────────────────────────────────────────────────
      case "click": {
        if (input.x === undefined || input.y === undefined) {
          throw new Error("يجب تحديد إحداثيات x و y للنقر");
        }
        const result = await sendDesktopCommand(
          userId, "mouseClick", { x: input.x, y: input.y, button: "left" }, 15_000,
        );
        return { ok: true, action: "click", x: input.x, y: input.y, result, message: `تم النقر على (${input.x}, ${input.y})` };
      }

      // ── Type text ───────────────────────────────────────────────────────────
      case "type": {
        if (!input.text) throw new Error("يجب تحديد النص للكتابة");
        const result = await sendDesktopCommand(userId, "typeText", { text: input.text }, 15_000);
        return { ok: true, action: "type", text: input.text, result, message: `تمت الكتابة: "${input.text}"` };
      }

      // ── Press single key ────────────────────────────────────────────────────
      case "press": {
        if (!input.key) throw new Error("يجب تحديد المفتاح للضغط");
        const result = await sendDesktopCommand(userId, "pressKey", { key: input.key }, 15_000);
        return { ok: true, action: "press", key: input.key, result, message: `تم ضغط المفتاح: ${input.key}` };
      }

      // ── Hotkey (key combination) ─────────────────────────────────────────────
      // The agent's pressKey handler calls api.robotKey(payload.key) with a
      // single string. We join the keys array with "+" so the underlying
      // robotjs / pyautogui layer can parse it as a combo (e.g. "ctrl+s").
      case "hotkey": {
        if (!input.keys?.length) throw new Error("يجب تحديد مفاتيح الاختصار");
        const comboKey = input.keys.join("+");
        const result = await sendDesktopCommand(userId, "pressKey", { key: comboKey }, 15_000);
        return { ok: true, action: "hotkey", keys: input.keys, combo: comboKey, result, message: `تم تنفيذ الاختصار: ${comboKey}` };
      }

      default:
        throw new Error(`إجراء غير معروف: ${action}`);
    }
  } catch (err: any) {
    logger.error(err, `desktop_control_tool failed: ${action}`);
    return { ok: false, action, error: err.message || "فشل تنفيذ الإجراء" };
  }
}
