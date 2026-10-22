declare module "archiver" {
  type Archive = {
    pipe(destination: NodeJS.WritableStream): void;
    append(data: Buffer, options: { name: string }): void;
    finalize(): Promise<void>;
  };
  function archiver(format: string, options?: unknown): Archive;
  export default archiver;
}