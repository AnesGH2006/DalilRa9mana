const BASE = import.meta.env.BASE_URL;

interface AttendanceSocket {
  on(event: "attendance:updated", listener: () => void): void;
  disconnect(): void;
}

declare global {
  interface Window {
    io?: (options: { path: string; withCredentials: boolean }) => AttendanceSocket;
  }
}

let clientScript: Promise<void> | undefined;

function loadSocketClient(): Promise<void> {
  if (window.io) return Promise.resolve();
  if (!clientScript) {
    clientScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${BASE}agent-socket/socket.io.js`;
      script.async = true;
      script.onload = () => window.io ? resolve() : reject(new Error("Socket.IO client unavailable"));
      script.onerror = () => reject(new Error("Unable to load Socket.IO client"));
      document.head.appendChild(script);
    });
  }
  return clientScript;
}

export async function connectAttendanceUpdates(onUpdate: () => void): Promise<() => void> {
  await loadSocketClient();
  const socket = window.io!({ path: `${BASE}agent-socket`, withCredentials: true });
  socket.on("attendance:updated", onUpdate);
  return () => socket.disconnect();
}