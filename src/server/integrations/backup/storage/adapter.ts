export interface StorageAdapter {
  readonly provider: "local" | "s3";

  /**
   * Saves content (Buffer or string) to the specified path or key.
   * Returns the final resource location URI or file path.
   */
  save(path: string, content: Buffer | string): Promise<string>;

  /**
   * Reads content from the specified path or key.
   */
  read(path: string): Promise<Buffer>;

  /**
   * Checks whether the specified resource exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Lists items under the optional prefix.
   */
  list(prefix?: string): Promise<string[]>;

  /**
   * Deletes the item at the specified path.
   */
  delete(path: string): Promise<void>;
}
