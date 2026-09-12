import { spawn, ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as http from "node:http";

export interface CDPResponse {
  id: number;
  result?: any;
  error?: any;
}

function httpGetJson<T = any>(urlStr: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.get(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        timeout: 1500,
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

export class ChromiumBrowser {
  private chromeProcess: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private messageId = 0;
  private callbacks = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private userDataDir: string;
  public port: number;

  constructor(port = 9222) {
    this.port = port;
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chromium-cdp-"));
  }

  async launch(): Promise<void> {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.userDataDir}`,
      "--disable-dev-shm-usage",
      "--window-size=1280,800",
      "about:blank",
    ];

    this.chromeProcess = spawn("chromium", args, {
      stdio: "ignore",
      detached: false,
    });

    const start = Date.now();
    let pageWsUrl: string | null = null;

    while (Date.now() - start < 10000) {
      try {
        const targets = await httpGetJson<any[]>(`http://127.0.0.1:${this.port}/json/list`);
        const pageTarget = targets.find((t: any) => t.type === "page");
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          pageWsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
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
          const cb = this.callbacks.get(msg.id);
          if (cb) {
            this.callbacks.delete(msg.id);
            if (msg.error) {
              cb.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              cb.resolve(msg.result);
            }
          }
        } catch {}
      };
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
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

  async evaluate<T = any>(expression: string): Promise<T> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(
        `CDP Evaluate Error: ${result.exceptionDetails.text} (${expression})`
      );
    }

    return result.result?.value as T;
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found for fill: " + ${JSON.stringify(selector)});
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
  }

  async click(selector: string): Promise<void> {
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found for click: " + ${JSON.stringify(selector)});
        el.click();
      })()
    `);
  }

  async selectOption(selector: string, value: string): Promise<void> {
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found for select: " + ${JSON.stringify(selector)});
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
  }

  async waitForSelector(selector: string, timeoutMs = 8000): Promise<boolean> {
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

  async waitForText(text: string, timeoutMs = 8000): Promise<boolean> {
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

  async screenshot(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });

    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
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
