// Minimal type declarations for `tar-stream` (no @types package published for
// v3.x). Only the surface we actually use is declared.

declare module "tar-stream" {
  interface TarHeader {
    name: string;
    type: "file" | "directory" | "symlink" | "link" | string;
    size?: number;
  }
  // Extract() returns a Writable (you pipe gunzipped bytes into it; it emits
  // "entry" events as it parses the tar header stream).
  interface TarExtract extends NodeJS.WritableStream {
    on(event: "entry", listener: (
      header: TarHeader,
      stream: NodeJS.ReadableStream,
      next: () => void,
    ) => void): this;
    on(event: "finish", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }
  export function extract(): TarExtract;
  const _default: { extract: typeof extract };
  export default _default;
}