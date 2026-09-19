import { spawn, ChildProcess, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as http from "node:http";

export interface CDPResponse {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface ConsoleLogEntry {
  type: string;
  text: string;
  timestamp: number;
}

export interface NetworkEntry {
  url: string;
  status: number;
  statusText: string;
  mimeType: string;
}

function httpGetJson<T = any>(urlStr: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.get(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        timeout: 2000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

export class EnhancedChromiumBrowser {
  private chromeProcess: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private messageId = 0;
  private callbacks = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();
  private userDataDir: string;
  public port: number;

  // Event recording
  public consoleLogs: ConsoleLogEntry[] = [];
  public consoleErrors: string[] = [];
  public networkResponses: NetworkEntry[] = [];

  // Screencast recording
  private isRecording = false;
  private recordingFrameDir: string | null = null;
  private frameCount = 0;

  constructor(port = 9222) {
    this.port = port;
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chromium-cdp-session-"));
  }

  async launch(options: { windowSize?: string; headless?: boolean } = {}): Promise<void> {
    const windowSize = options.windowSize || "1440,900";
    const headless = options.headless !== undefined ? options.headless : true;

    const args = [
      headless ? "--headless=new" : "--remote-allow-origins=*",
      "--disable-gpu",
      "--no-sandbox",
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.userDataDir}`,
      "--disable-dev-shm-usage",
      `--window-size=${windowSize}`,
      "about:blank",
    ];

    this.chromeProcess = spawn("chromium", args, {
      stdio: "ignore",
      detached: false,
    });

    const start = Date.now();
    let pageWsUrl: string | null = null;

    while (Date.now() - start < 12000) {
      try {
        const targets = await httpGetJson<any[]>(`http://127.0.0.1:${this.port}/json/list`);
        const pageTarget = targets.find((t: any) => t.type === "page");
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          pageWsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    if (!pageWsUrl) {
      throw new Error(`Failed to locate page target on port ${this.port}`);
    }

    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(pageWsUrl!);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg: CDPResponse = JSON.parse(event.data.toString());
          if (msg.id) {
            const cb = this.callbacks.get(msg.id);
            if (cb) {
              this.callbacks.delete(msg.id);
              if (msg.error) {
                cb.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              } else {
                cb.resolve(msg.result);
              }
            }
          } else if (msg.method) {
            this.handleEvent(msg.method, msg.params);
          }
        } catch {}
      };
    });

    // Enable primary DevTools domains
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
    await this.send("Log.enable");
    await this.send("Network.enable");
  }

  private handleEvent(method: string, params: any) {
    if (method === "Page.screencastFrame" && this.isRecording && this.recordingFrameDir) {
      this.frameCount++;
      const framePath = path.join(
        this.recordingFrameDir,
        `frame_${this.frameCount.toString().padStart(5, "0")}.jpg`
      );
      try {
        fs.writeFileSync(framePath, Buffer.from(params.data, "base64"));
      } catch {}

      // Acknowledge frame to receive subsequent frames
      if (params.sessionId) {
        this.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
      }
    } else if (method === "Runtime.consoleAPICalled") {
      const text = (params.args || [])
        .map((a: any) => (a.value !== undefined ? String(a.value) : a.description || ""))
        .join(" ");
      this.consoleLogs.push({ type: params.type, text, timestamp: Date.now() });
      if (params.type === "error") {
        this.consoleErrors.push(text);
      }
    } else if (method === "Runtime.exceptionThrown") {
      const text = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "Exception";
      this.consoleErrors.push(text);
    } else if (method === "Network.responseReceived") {
      if (params.response) {
        this.networkResponses.push({
          url: params.response.url,
          status: params.response.status,
          statusText: params.response.statusText,
          mimeType: params.response.mimeType,
        });
      }
    }
  }

  async send(method: string, params?: Record<string, unknown>): Promise<any> {
    if (!this.ws) throw new Error("CDP WebSocket is not connected");
    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string, waitMs = 1200): Promise<void> {
    await this.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async reload(waitMs = 1200): Promise<void> {
    await this.send("Page.reload", { ignoreCache: true });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async goBack(waitMs = 1200): Promise<void> {
    const history = await this.send("Page.getNavigationHistory");
    const currentIndex = history.currentIndex;
    if (currentIndex > 0) {
      const targetEntry = history.entries[currentIndex - 1];
      await this.send("Page.navigateToHistoryEntry", { entryId: targetEntry.id });
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  async setViewport(width: number, height: number, isMobile = false, hasTouch = false): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
    });
    const touchParams: any = { enabled: hasTouch };
    if (hasTouch) {
      touchParams.maxTouchPoints = 5;
    }
    await this.send("Emulation.setTouchEmulationEnabled", touchParams);
    await new Promise((r) => setTimeout(r, 400));
  }

  async clearViewport(): Promise<void> {
    await this.send("Emulation.clearDeviceMetricsOverride");
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await new Promise((r) => setTimeout(r, 200));
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    let script = expression.trim();
    if (
      !script.startsWith("(") &&
      (script.includes("const ") || script.includes("let ") || script.includes("var "))
    ) {
      script = `(() => {\n${script}\n})()`;
    }

    const result = await this.send("Runtime.evaluate", {
      expression: script,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`CDP Evaluate Error: ${result.exceptionDetails.text} (${expression})`);
    }

    return result.result?.value as T;
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found for fill: " + ${JSON.stringify(selector)});
        el.focus();
        const isTextArea = el instanceof HTMLTextAreaElement;
        const proto = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, ${JSON.stringify(value)});
        } else {
          el.value = ${JSON.stringify(value)};
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 100));
  }

  async click(selector: string): Promise<void> {
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found for click: " + ${JSON.stringify(selector)});
        el.scrollIntoView({ block: 'center', inline: 'center' });
        el.focus();
        el.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 200));
  }

  async selectOption(selector: string, value: string): Promise<void> {
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found for select: " + ${JSON.stringify(selector)});
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 100));
  }

  async pressKey(key: string, code?: string, modifiers = 0): Promise<void> {
    const keyCodeMap: Record<string, number> = {
      Tab: 9,
      Enter: 13,
      Escape: 27,
      Space: 32,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
      KeyK: 75,
      k: 75,
      K: 75,
    };
    const vKey = keyCodeMap[key] || keyCodeMap[code || ""] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);

    try {
      await this.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key,
        code: code || key,
        windowsVirtualKeyCode: vKey,
        nativeVirtualKeyCode: vKey,
        modifiers,
      });

      if (key.length === 1 && modifiers === 0) {
        await this.send("Input.dispatchKeyEvent", {
          type: "char",
          text: key,
          unmodifiedText: key,
          modifiers,
        });
      }

      await this.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: code || key,
        windowsVirtualKeyCode: vKey,
        nativeVirtualKeyCode: vKey,
        modifiers,
      });
    } catch {
      await this.evaluate(`
        const target = document.activeElement || document;
        target.dispatchEvent(new KeyboardEvent('keydown', {
          key: ${JSON.stringify(key)},
          code: ${JSON.stringify(code || key)},
          ctrlKey: Boolean(${modifiers & 2}),
          metaKey: Boolean(${modifiers & 4}),
          shiftKey: Boolean(${modifiers & 8}),
          altKey: Boolean(${modifiers & 1}),
          bubbles: true,
          cancelable: true
        }));
      `);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  async waitForSelector(selector: string, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate<boolean>(
        `Boolean(document.querySelector(${JSON.stringify(selector)}))`
      );
      if (exists) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  async waitForText(text: string, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.evaluate<boolean>(
        `document.body ? document.body.innerText.includes(${JSON.stringify(text)}) : false`
      );
      if (found) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Timeout waiting for text: "${text}"`);
  }

  async screenshot(filePath: string, fullPage = false): Promise<void> {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      throw new Error(`[enhanced-cdp] Attempted to save screenshot directly to repository root: ${resolved}`);
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
    });

    fs.writeFileSync(resolved, Buffer.from(data, "base64"));
  }

  async startRecording(frameDir: string): Promise<void> {
    this.recordingFrameDir = frameDir;
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }
    this.frameCount = 0;
    this.isRecording = true;

    await this.send("Page.startScreencast", {
      format: "jpeg",
      quality: 80,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    });
  }

  async stopRecording(outputWebmPath: string): Promise<boolean> {
    if (!this.isRecording) return false;
    this.isRecording = false;

    try {
      await this.send("Page.stopScreencast");
    } catch {}

    const frameDir = this.recordingFrameDir;
    if (!frameDir || !fs.existsSync(frameDir)) return false;

    const files = fs.readdirSync(frameDir).filter((f) => f.endsWith(".jpg")).sort();

    // If no frames captured via screencast, take a snapshot as frame 1
    if (files.length === 0) {
      try {
        const { data } = await this.send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
        fs.writeFileSync(path.join(frameDir, "frame_00001.jpg"), Buffer.from(data, "base64"));
        fs.writeFileSync(path.join(frameDir, "frame_00002.jpg"), Buffer.from(data, "base64"));
      } catch {
        return false;
      }
    } else if (files.length === 1) {
      // Duplicate single frame so ffmpeg can construct video duration
      fs.copyFileSync(
        path.join(frameDir, files[0]),
        path.join(frameDir, "frame_00002.jpg")
      );
    }

    const resolvedWebm = path.resolve(outputWebmPath);
    const outDir = path.dirname(resolvedWebm);
    if (fs.existsSync(path.join(outDir, "package.json")) && fs.existsSync(path.join(outDir, "pnpm-workspace.yaml"))) {
      throw new Error(`[enhanced-cdp] Attempted to save recording directly to repository root: ${resolvedWebm}`);
    }
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    try {
      execSync(
        `ffmpeg -y -framerate 4 -i "${frameDir}/frame_%05d.jpg" -c:v libvpx-vp9 -b:v 1M -pix_fmt yuv420p "${resolvedWebm}"`,
        { stdio: "ignore", timeout: 15000 }
      );
      return fs.existsSync(resolvedWebm);
    } catch (e) {
      console.warn(`[cdp] ffmpeg video generation warning: ${e}`);
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    if (this.chromeProcess && this.chromeProcess.pid) {
      try {
        this.chromeProcess.kill();
      } catch {}
      this.chromeProcess = null;
    }

    try {
      if (fs.existsSync(this.userDataDir)) {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      }
    } catch {}
  }
}
