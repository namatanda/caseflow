/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrismaClient } from '@prisma/client';

import { withTransaction } from '@/config/database';

type AsyncReturnType<T> = T extends Promise<infer R> ? R : never;

type MethodArgs<T> = T extends (args: infer A) => Promise<any> ? A : never;

export type PrismaCrudDelegate = {
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
  count: (args?: any) => Promise<number>;
};

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<TEntity> {
  data: TEntity[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

export class BaseRepository<TDelegate extends PrismaCrudDelegate> {
  protected readonly delegate: TDelegate;

  constructor(delegate: TDelegate) {
    this.delegate = delegate;
  }

  async findById(
    args: MethodArgs<TDelegate['findUnique']>
  ): Promise<AsyncReturnType<ReturnType<TDelegate['findUnique']>>> {
    return this.delegate.findUnique(args) as Promise<AsyncReturnType<ReturnType<TDelegate['findUnique']>>>;
  }

  async findMany(
    args?: MethodArgs<TDelegate['findMany']>
  ): Promise<AsyncReturnType<ReturnType<TDelegate['findMany']>>> {
    return this.delegate.findMany(args ?? {} as MethodArgs<TDelegate['findMany']>) as Promise<AsyncReturnType<ReturnType<TDelegate['findMany']>>>;
  }

  async create(
    args: MethodArgs<TDelegate['create']>
  ): Promise<AsyncReturnType<ReturnType<TDelegate['create']>>> {
    return this.delegate.create(args) as Promise<AsyncReturnType<ReturnType<TDelegate['create']>>>;
  }

  async update(
    args: MethodArgs<TDelegate['update']>
  ): Promise<AsyncReturnType<ReturnType<TDelegate['update']>>> {
    return this.delegate.update(args) as Promise<AsyncReturnType<ReturnType<TDelegate['update']>>>;
  }

  async delete(
    args: MethodArgs<TDelegate['delete']>
  ): Promise<AsyncReturnType<ReturnType<TDelegate['delete']>>> {
    return this.delegate.delete(args) as Promise<AsyncReturnType<ReturnType<TDelegate['delete']>>>;
  }

  async count(
    args?: MethodArgs<TDelegate['count']>
  ): Promise<number> {
    if (typeof args === 'undefined') {
      return this.delegate.count(undefined);
    }

    return this.delegate.count(args);
  }

  async exists(args?: MethodArgs<TDelegate['count']>): Promise<boolean> {
    const total = await this.count(args);
    return total > 0;
  }

  async findPaginated(
    params: {
      args?: MethodArgs<TDelegate['findMany']>;
      countArgs?: MethodArgs<TDelegate['count']>;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<PaginatedResult<any>> {
    const {
      args,
      countArgs,
      page = DEFAULT_PAGE,
      pageSize = DEFAULT_PAGE_SIZE,
    } = params;

    const safePageSize = Math.max(pageSize, 1);
    const skip = (Math.max(page, 1) - 1) * safePageSize;
    const findManyArgs = {
      ...(args ?? {}),
      skip,
      take: safePageSize,
    } as MethodArgs<TDelegate['findMany']>;

    const [data, total] = await Promise.all([
      this.delegate.findMany(findManyArgs),
      this.count(typeof countArgs === 'undefined' ? undefined : countArgs),
    ]) as [
      AsyncReturnType<ReturnType<TDelegate['findMany']>>,
      number,
    ];

    const pageCount = Math.max(Math.ceil(total / safePageSize), 1);

    return {
      data,
      total,
      page,
      pageSize: safePageSize,
      pageCount,
    };
  }

  async transaction<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    maxRetries?: number
  ): Promise<T> {
    return withTransaction(fn, maxRetries);
  }
}
