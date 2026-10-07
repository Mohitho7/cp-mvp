/**
 * Minimal local type declarations for the `pg` driver.
 * Used instead of `@types/pg` so the project installs fully offline.
 * Covers only the surface used by this codebase.
 */
declare module "pg" {
  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    ssl?: unknown;
  }

  export interface QueryResult<T = unknown> {
    rows: T[];
    rowCount: number | null;
  }

  export interface PoolClient {
    query<T = unknown>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T = unknown>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
