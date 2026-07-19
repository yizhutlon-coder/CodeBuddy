import { createServer, type IncomingMessage, type Server } from "node:http";
import type { IncomingEvent } from "../shared/types";

export interface EventServerResult {
  port: number;
  close(): Promise<void>;
}

const readJson = async (request: IncomingMessage): Promise<IncomingEvent> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as IncomingEvent;
};

const listen = (server: Server, port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });

export const startEventServer = async (
  preferredPort: number,
  token: string,
  onEvent: (event: IncomingEvent) => void,
): Promise<EventServerResult> => {
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (request.method === "GET" && request.url === "/health") {
      response.statusCode = 200;
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/events") {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    const suppliedToken = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? request.headers["x-companion-token"];
    if (suppliedToken !== token) {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    try {
      const event = await readJson(request);
      if (!event.provider) throw new Error("provider is required");
      onEvent(event);
      response.statusCode = 202;
      response.end(JSON.stringify({ accepted: true }));
    } catch (error) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid event" }));
    }
  });

  let port = preferredPort;
  for (; port <= preferredPort + 9; port += 1) {
    try {
      await listen(server, port);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || port === preferredPort + 9) throw error;
    }
  }

  return {
    port,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
};
