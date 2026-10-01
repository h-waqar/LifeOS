/**
 * Plan 11-04: Lightweight Subprocess MCP Test Client
 *
 * Implements real bidirectional stdio communication over OS pipes:
 * - Frames requests as JSON-RPC 2.0 messages separated by newlines.
 * - Parses and correlates responses by request ID.
 * - Asserts 100% stdout stream purity (no banner, debug, or log pollution).
 * - Records all stderr output for diagnostic and security assertions.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface McpTestClientOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs?: number;
}

export class McpTestClient extends EventEmitter {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: JsonRpcResponse<unknown>) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private stdoutBuffer = "";
  private rawStdoutLines: string[] = [];
  private rawStderrLines: string[] = [];
  private purityViolations: string[] = [];
  private exitCode: number | null = null;
  private defaultTimeout: number;

  constructor(options?: McpTestClientOptions) {
    super();
    this.defaultTimeout = options?.timeoutMs ?? 15000;
  }

  private inStream: NodeJS.WritableStream | null = null;
  private outStream: NodeJS.ReadableStream | null = null;

  /**
   * Spawns the MCP server subprocess with piped stdio.
   */
  public async start(
    command: string,
    args: string[],
    options?: McpTestClientOptions
  ): Promise<void> {
    const cwd = options?.cwd ?? process.cwd();
    const env = {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      ...(options?.env ?? {}),
    };

    return new Promise((resolve, reject) => {
      this.child = spawn(command, args, {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.inStream = this.child.stdin;
      this.outStream = this.child.stdout;

      this.child.on("error", (err) => {
        reject(err);
      });

      this.child.stdout?.on("data", (chunk: Buffer) => {
        this.handleStdout(chunk);
      });

      this.child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.length > 0) {
            this.rawStderrLines.push(line);
          }
        }
      });

      this.child.on("exit", (code) => {
        this.exitCode = code;
        this.emit("exit", code);
        // Fail any pending requests
        for (const [id, req] of this.pendingRequests.entries()) {
          clearTimeout(req.timer);
          req.reject(
            new Error(
              `MCP process exited with code ${code} before response to request ${id}`
            )
          );
        }
        this.pendingRequests.clear();
      });

      // Allow a brief tick to verify child process started cleanly
      setImmediate(() => {
        if (this.child && !this.child.killed && this.exitCode === null) {
          resolve();
        } else if (this.exitCode !== null) {
          reject(new Error(`MCP process exited immediately with code ${this.exitCode}`));
        }
      });
    });
  }

  /**
   * Connects directly to input/output streams (e.g. PassThrough) for testing.
   */
  public connectStreams(
    serverIn: NodeJS.WritableStream,
    serverOut: NodeJS.ReadableStream,
    serverErr?: NodeJS.ReadableStream
  ): void {
    this.inStream = serverIn;
    this.outStream = serverOut;

    serverOut.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      this.handleStdout(buf);
    });

    if (serverErr) {
      serverErr.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.length > 0) {
            this.rawStderrLines.push(line);
          }
        }
      });
    }
  }

  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString("utf-8");
    const lines = this.stdoutBuffer.split("\n");
    // Keep whatever is after the last newline in the buffer
    this.stdoutBuffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0) continue;

      this.rawStdoutLines.push(trimmed);

      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed.jsonrpc !== "2.0") {
          this.purityViolations.push(trimmed);
          continue;
        }

        // Correlate response if ID matches
        if (typeof parsed.id === "number" && this.pendingRequests.has(parsed.id)) {
          const req = this.pendingRequests.get(parsed.id)!;
          clearTimeout(req.timer);
          this.pendingRequests.delete(parsed.id);
          req.resolve(parsed as unknown as JsonRpcResponse<unknown>);
        }
      } catch {
        // Line is not valid JSON - stdout stream discipline violation!
        this.purityViolations.push(trimmed);
      }
    }
  }

  /**
   * Sends a typed JSON-RPC request and awaits the response.
   */
  public async sendRequest<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<JsonRpcResponse<T>> {
    if (!this.inStream) {
      throw new Error("Cannot send request: MCP client is not running or stdin is closed");
    }

    const id = this.nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const timeout = timeoutMs ?? this.defaultTimeout;

    return new Promise<JsonRpcResponse<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request '${method}' (id ${id}) timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (val: JsonRpcResponse<unknown>) => void,
        reject,
        timer,
      });

      this.inStream!.write(JSON.stringify(message) + "\n");
    });
  }

  /**
   * Sends a JSON-RPC notification (no response expected).
   */
  public sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.inStream) {
      throw new Error("Cannot send notification: MCP client is not running or stdin is closed");
    }

    const message: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.inStream.write(JSON.stringify(message) + "\n");
  }

  /**
   * MCP initialize handshake.
   */
  public async initialize(params?: {
    clientInfo?: { name: string; version: string };
    capabilities?: Record<string, unknown>;
  }): Promise<{
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    serverInfo: { name: string; version: string };
  }> {
    const res = await this.sendRequest<{
      protocolVersion: string;
      capabilities: Record<string, unknown>;
      serverInfo: { name: string; version: string };
    }>("initialize", {
      protocolVersion: "2024-11-05",
      clientInfo: params?.clientInfo ?? { name: "lifeos-test-client", version: "1.0.0" },
      capabilities: params?.capabilities ?? {},
    });

    if (res.error) {
      throw new Error(`initialize failed: ${res.error.message} (code ${res.error.code})`);
    }

    return res.result!;
  }

  /**
   * MCP initialized notification.
   */
  public initialized(): void {
    this.sendNotification("notifications/initialized");
  }

  /**
   * MCP resources/list.
   */
  public async listResources(): Promise<{
    resources: Array<{ uri: string; name: string; mimeType?: string; description?: string }>;
  }> {
    const res = await this.sendRequest<{
      resources: Array<{ uri: string; name: string; mimeType?: string; description?: string }>;
    }>("resources/list");

    if (res.error) {
      throw new Error(`resources/list failed: ${res.error.message}`);
    }

    return res.result!;
  }

  /**
   * MCP resources/read.
   */
  public async readResource(uri: string): Promise<{
    contents: Array<{ uri: string; mimeType: string; text?: string; blob?: string }>;
  }> {
    const res = await this.sendRequest<{
      contents: Array<{ uri: string; mimeType: string; text?: string; blob?: string }>;
    }>("resources/read", { uri });

    if (res.error) {
      throw new Error(`resources/read failed: ${res.error.message}`);
    }

    return res.result!;
  }

  /**
   * MCP tools/list.
   */
  public async listTools(): Promise<{
    tools: Array<{
      name: string;
      description?: string;
      inputSchema: Record<string, unknown>;
    }>;
  }> {
    const res = await this.sendRequest<{
      tools: Array<{
        name: string;
        description?: string;
        inputSchema: Record<string, unknown>;
      }>;
    }>("tools/list");

    if (res.error) {
      throw new Error(`tools/list failed: ${res.error.message}`);
    }

    return res.result!;
  }

  /**
   * MCP tools/call.
   */
  public async callTool(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const res = await this.sendRequest<{
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    }>("tools/call", {
      name,
      arguments: args ?? {},
    });

    if (res.error) {
      throw new Error(`tools/call error frame: ${res.error.message} (code ${res.error.code})`);
    }

    return res.result!;
  }

  /**
   * MCP prompts/list.
   */
  public async listPrompts(): Promise<{
    prompts: Array<{
      name: string;
      description?: string;
      arguments?: Array<{ name: string; description?: string; required?: boolean }>;
    }>;
  }> {
    const res = await this.sendRequest<{
      prompts: Array<{
        name: string;
        description?: string;
        arguments?: Array<{ name: string; description?: string; required?: boolean }>;
      }>;
    }>("prompts/list");

    if (res.error) {
      throw new Error(`prompts/list failed: ${res.error.message}`);
    }

    return res.result!;
  }

  /**
   * MCP prompts/get.
   */
  public async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<{
    description?: string;
    messages: Array<{
      role: string;
      content: { type: string; text: string };
    }>;
  }> {
    const res = await this.sendRequest<{
      description?: string;
      messages: Array<{
        role: string;
        content: { type: string; text: string };
      }>;
    }>("prompts/get", {
      name,
      arguments: args ?? {},
    });

    if (res.error) {
      throw new Error(`prompts/get failed: ${res.error.message}`);
    }

    return res.result!;
  }

  /**
   * Closes stdin and waits for clean process shutdown.
   */
  public async close(timeoutMs = 5000): Promise<number | null> {
    if (!this.child) {
      try {
        (this.inStream as any)?.end?.();
      } catch {
        // Ignore
      }
      return null;
    }

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (code: number | null) => {
        if (resolved) return;
        resolved = true;
        resolve(code);
      };

      if (this.exitCode !== null) {
        return finish(this.exitCode);
      }

      this.child?.on("exit", (code) => {
        finish(code);
      });

      // Signal EOF by ending stdin
      try {
        this.child?.stdin?.end();
      } catch {
        // Ignore
      }

      // Hard kill fallback if process does not exit in time
      setTimeout(() => {
        if (!resolved && this.child && !this.child.killed) {
          try {
            this.child.kill("SIGTERM");
          } catch {
            // Ignore
          }
          setTimeout(() => {
            if (!resolved && this.child && !this.child.killed) {
              try {
                this.child.kill("SIGKILL");
              } catch {
                // Ignore
              }
              finish(null);
            }
          }, 1000);
        }
      }, timeoutMs);
    });
  }

  public getRawStdout(): string[] {
    return [...this.rawStdoutLines];
  }

  public getRawStderr(): string[] {
    return [...this.rawStderrLines];
  }

  public getPurityViolations(): string[] {
    return [...this.purityViolations];
  }

  public getExitCode(): number | null {
    return this.exitCode;
  }

  public assertStdoutPurity(): void {
    if (this.purityViolations.length > 0) {
      throw new Error(
        `Stdout purity violation! Non-JSON-RPC lines detected on stdout:\n${this.purityViolations.join("\n")}`
      );
    }
  }
}
