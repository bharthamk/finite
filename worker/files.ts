export type R2ObjectBody = {
  body: ReadableStream<Uint8Array> | null;
  httpEtag?: string;
  writeHttpMetadata(headers: Headers): void;
};

export interface FiniteFilesBucket {
  put(key: string, value: ArrayBuffer | ReadableStream<Uint8Array>, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}
