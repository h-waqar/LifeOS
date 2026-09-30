import crypto from "node:crypto";
import type { StorageAdapter } from "./adapter";
import type { S3Config } from "../types";

export class S3StorageAdapter implements StorageAdapter {
  readonly provider = "s3" as const;
  private readonly config: S3Config & { region: string };
  private readonly fetch: typeof fetch;

  constructor(config: S3Config, customFetch?: typeof fetch) {
    if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error("S3StorageAdapter requires bucket, accessKeyId, and secretAccessKey");
    }
    this.config = {
      ...config,
      region: config.region || "us-east-1",
    };
    this.fetch = customFetch ?? fetch;
  }

  private sha256(data: string | Buffer): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  private hmacSha256(key: string | Buffer, data: string): Buffer {
    return crypto.createHmac("sha256", key).update(data).digest();
  }

  private getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = this.hmacSha256("AWS4" + key, dateStamp);
    const kRegion = this.hmacSha256(kDate, regionName);
    const kService = this.hmacSha256(kRegion, serviceName);
    return this.hmacSha256(kService, "aws4_request");
  }

  private getUrl(key: string): { url: string; host: string; path: string } {
    const cleanKey = key.replace(/^\/+/, "");
    const bucket = this.config.bucket;

    if (this.config.endpoint) {
      const endpoint = this.config.endpoint.replace(/\/$/, "");
      const endpointUrl = new URL(endpoint);
      if (this.config.forcePathStyle) {
        return {
          url: `${endpoint}/${bucket}/${cleanKey}`,
          host: endpointUrl.host,
          path: `/${bucket}/${cleanKey}`,
        };
      } else {
        const host = `${bucket}.${endpointUrl.host}`;
        return {
          url: `${endpointUrl.protocol}//${host}/${cleanKey}`,
          host,
          path: `/${cleanKey}`,
        };
      }
    }

    // Default AWS S3 endpoint
    const host = `${bucket}.s3.${this.config.region}.amazonaws.com`;
    return {
      url: `https://${host}/${cleanKey}`,
      host,
      path: `/${cleanKey}`,
    };
  }

  private signRequest(
    method: string,
    urlObj: { host: string; path: string },
    payload: Buffer | string,
    queryParams = ""
  ): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const region = this.config.region;
    const service = "s3";

    const payloadHash = this.sha256(payload);

    const headers: Record<string, string> = {
      host: urlObj.host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders = `host:${headers.host}\nx-amz-content-sha256:${headers["x-amz-content-sha256"]}\nx-amz-date:${headers["x-amz-date"]}\n`;

    const canonicalRequest = [
      method,
      urlObj.path,
      queryParams,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join("\n");

    const signingKey = this.getSignatureKey(this.config.secretAccessKey, dateStamp, region, service);
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      ...headers,
      Authorization: authorizationHeader,
    };
  }

  async save(key: string, content: Buffer | string): Promise<string> {
    const urlObj = this.getUrl(key);
    const bodyBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    const headers = this.signRequest("PUT", urlObj, bodyBuffer);

    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(bodyBuffer.length);

    const response = await this.fetch(urlObj.url, {
      method: "PUT",
      headers,
      body: bodyBuffer,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`S3 PUT failed with status ${response.status}: ${errText}`);
    }

    return urlObj.url;
  }

  async read(key: string): Promise<Buffer> {
    const urlObj = this.getUrl(key);
    const headers = this.signRequest("GET", urlObj, "");

    const response = await this.fetch(urlObj.url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`S3 GET failed with status ${response.status}: ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async exists(key: string): Promise<boolean> {
    const urlObj = this.getUrl(key);
    const headers = this.signRequest("HEAD", urlObj, "");

    try {
      const response = await this.fetch(urlObj.url, {
        method: "HEAD",
        headers,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async list(prefix = ""): Promise<string[]> {
    const queryParams = prefix
      ? `list-type=2&prefix=${encodeURIComponent(prefix)}`
      : "list-type=2";
    const urlObj = this.getUrl("");
    const headers = this.signRequest("GET", urlObj, "", queryParams);

    const fullUrl = `${urlObj.url}?${queryParams}`;
    const response = await this.fetch(fullUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    // Parse <Key>...</Key> tags from S3 ListBucketResult
    const keyMatches = xml.matchAll(/<Key>(.*?)<\/Key>/g);
    const keys: string[] = [];
    for (const match of keyMatches) {
      if (match[1]) keys.push(match[1]);
    }
    return keys;
  }

  async delete(key: string): Promise<void> {
    const urlObj = this.getUrl(key);
    const headers = this.signRequest("DELETE", urlObj, "");

    try {
      await this.fetch(urlObj.url, {
        method: "DELETE",
        headers,
      });
    } catch {
      // Ignored
    }
  }
}
