import type { Hono } from 'hono';
import type { AppEnv, Env } from '../../src/env';

export class TestResponse {
  status: number;
  body: any;
  headers: Headers;
  text: string;

  constructor(status: number, body: any, headers: Headers, text: string) {
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.text = text;
  }

  get(header: string): string | null {
    return this.headers.get(header);
  }
}

class TestRequest {
  private readonly app: Hono<AppEnv>;
  private readonly method: string;
  private readonly path: string;
  private readonly headers: Record<string, string> = {};
  private readonly queryParams: Record<string, string | number | boolean> = {};
  private rawBody?: string;
  private form?: FormData;
  private jsonBody?: unknown;
  private hasJsonBody = false;
  private env?: Env;

  constructor(app: Hono<AppEnv>, method: string, path: string) {
    this.app = app;
    this.method = method;
    this.path = path;
  }

  set(field: string, value: string): this {
    this.headers[field] = value;
    return this;
  }

  query(params: Record<string, string | number | boolean>): this {
    Object.assign(this.queryParams, params);
    return this;
  }

  send(body: unknown): this {
    if (typeof body === 'string') {
      this.rawBody = body;
      if (!this.hasHeader('Content-Type')) {
        this.headers['Content-Type'] = 'text/plain';
      }
      return this;
    }

    this.jsonBody = body;
    this.hasJsonBody = true;
    this.headers['Content-Type'] = 'application/json';
    return this;
  }

  attach(field: string, buffer: Buffer | Uint8Array | string, options?: string | { filename?: string; contentType?: string }): this {
    if (!this.form) {
      this.form = new FormData();
    }
    const resolved = typeof options === 'string' ? { filename: options } : options ?? {};
    const filename = resolved.filename ?? 'file.bin';
    const contentType = resolved.contentType ?? this.inferContentType(filename);
    const bytes = typeof buffer === 'string' ? new TextEncoder().encode(buffer) : new Uint8Array(buffer);
    const blobPart = new Blob([bytes], { type: contentType });
    this.form.append(field, blobPart, filename);
    return this;
  }

  private inferContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const byExtension: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      avif: 'image/avif',
      ico: 'image/x-icon',
      svg: 'image/svg+xml',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      heic: 'image/heic',
      heif: 'image/heif',
      pdf: 'application/pdf',
      txt: 'text/plain',
      json: 'application/json',
      csv: 'text/csv',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return byExtension[ext] ?? 'application/octet-stream';
  }

  field(name: string, value: string): this {
    if (!this.form) {
      this.form = new FormData();
    }
    this.form.append(name, value);
    return this;
  }

  private hasHeader(name: string): boolean {
    const lower = name.toLowerCase();
    return Object.keys(this.headers).some((key) => key.toLowerCase() === lower);
  }

  private buildUrl(): string {
    const url = new URL(this.path, 'http://localhost');
    for (const [key, value] of Object.entries(this.queryParams)) {
      url.searchParams.set(key, String(value));
    }
    return `${url.pathname}${url.search}`;
  }

  private async run(): Promise<TestResponse> {
    const init: RequestInit = {
      method: this.method,
      headers: { ...this.headers }
    };

    if (this.form) {
      init.body = this.form;
      delete (init.headers as Record<string, string>)['Content-Type'];
      delete (init.headers as Record<string, string>)['content-type'];
    } else if (this.hasJsonBody) {
      init.body = JSON.stringify(this.jsonBody);
    } else if (this.rawBody !== undefined) {
      init.body = this.rawBody;
    }

    const res = await this.app.request(this.buildUrl(), init, this.env);
    const text = await res.text();
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return new TestResponse(res.status, parsed, res.headers, text);
  }

  withEnv(env: Env): this {
    this.env = env;
    return this;
  }

  then<TResult1 = TestResponse, TResult2 = never>(
    onfulfilled?: ((value: TestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<TestResponse | TResult> {
    return this.run().catch(onrejected);
  }
}

export default function request(app: Hono<AppEnv>) {
  return {
    get: (path: string) => new TestRequest(app, 'GET', path),
    post: (path: string) => new TestRequest(app, 'POST', path),
    put: (path: string) => new TestRequest(app, 'PUT', path),
    patch: (path: string) => new TestRequest(app, 'PATCH', path),
    delete: (path: string) => new TestRequest(app, 'DELETE', path)
  };
}
