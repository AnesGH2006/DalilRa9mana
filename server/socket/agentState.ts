// In-memory state shared between agentHandler and HTTP routes
// This is per-process (single server instance) — fine for this use case

export interface AgentScreen {
  dataUrl: string;   // PNG/JPEG data URL
  screenWidth: number;
  screenHeight: number;
  ts: number;        // epoch ms
}

export interface ShellResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  ts: number;
}

// agentTokenId → latest screen frame
export const agentScreens = new Map<string, AgentScreen>();

// agentTokenId → ring buffer of last N shell results
export const agentShellResults = new Map<string, ShellResult[]>();
const MAX_SHELL = 100;

export function storeScreen(agentTokenId: string, frame: AgentScreen) {
  agentScreens.set(agentTokenId, frame);
}

export function storeShellResult(agentTokenId: string, result: ShellResult) {
  if (!agentShellResults.has(agentTokenId)) agentShellResults.set(agentTokenId, []);
  const arr = agentShellResults.get(agentTokenId)!;
  arr.push(result);
  if (arr.length > MAX_SHELL) arr.shift();
}
