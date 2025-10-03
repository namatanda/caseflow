import { vi } from 'vitest';

type Identifier = string | number;

type WithId = { id: Identifier };

type CreateArgs<TEntity> = {
  data: TEntity;
};

type UpdateArgs<TEntity> = {
  where: { id: Identifier };
  data: Partial<TEntity>;
};

type DeleteArgs = {
  where: { id: Identifier };
};

type FindUniqueArgs<TEntity> = {
  where: Partial<TEntity> & { id: Identifier };
};

type FindManyArgs<TEntity> = {
  where?: Partial<TEntity>;
} | undefined;

type CountArgs<TEntity> = {
  where?: Partial<TEntity>;
} | undefined;

type CreateManyArgs<TEntity> = {
  data: TEntity[];
  skipDuplicates?: boolean;
};

export interface InMemoryCrudDelegate<TEntity extends WithId> {
  readonly store: TEntity[];
  reset(): void;
  findUnique: (args: FindUniqueArgs<TEntity>) => Promise<TEntity | null>;
  findMany: (args?: FindManyArgs<TEntity>) => Promise<TEntity[]>;
  create: (args: CreateArgs<TEntity>) => Promise<TEntity>;
  update: (args: UpdateArgs<TEntity>) => Promise<TEntity>;
  delete: (args: DeleteArgs) => Promise<TEntity>;
  count: (args?: CountArgs<TEntity>) => Promise<number>;
  createMany: (args: CreateManyArgs<TEntity>) => Promise<{ count: number }>;
}

const matchWhere = <TEntity extends WithId>(entity: TEntity, where?: Partial<TEntity>) => {
  if (!where) {
    return true;
  }

  return (Object.keys(where) as Array<keyof TEntity>).every((key) => {
    const value = where[key];
    if (typeof value === 'undefined') {
      return true;
    }

    return entity[key] === value;
  });
};

export const createInMemoryCrudDelegate = <TEntity extends WithId>() => {
  let store: TEntity[] = [];

  const snapshot = () => store.map((entity) => ({ ...entity }));

  const findUniqueImpl = async ({ where }: FindUniqueArgs<TEntity>) => {
    return store.find((entity) => entity.id === where.id) ?? null;
  };

  const findManyImpl = async (args?: FindManyArgs<TEntity>) => {
    if (!args?.where) {
      return snapshot();
    }

    return snapshot().filter((entity) => matchWhere(entity, args.where));
  };

  const createImpl = async ({ data }: CreateArgs<TEntity>) => {
    const index = store.findIndex((entity) => entity.id === data.id);

    if (index === -1) {
      store = [...store, { ...data }];
    } else {
      store[index] = { ...data };
    }

    return { ...data };
  };

  const createManyImpl = async ({ data, skipDuplicates }: CreateManyArgs<TEntity>) => {
    if (data.length === 0) {
      return { count: 0 };
    }

    let created = 0;

    data.forEach((entity) => {
      const existingIndex = store.findIndex((item) => item.id === entity.id);
      if (existingIndex >= 0) {
        if (!skipDuplicates) {
          store[existingIndex] = { ...entity };
          created += 1;
        }
        return;
      }

      store.push({ ...entity });
      created += 1;
    });

    return { count: created };
  };

  const updateImpl = async ({ where, data }: UpdateArgs<TEntity>) => {
    const index = store.findIndex((entity) => entity.id === where.id);
    if (index === -1) {
      throw new Error(`Entity with id "${String(where.id)}" not found`);
    }

    const updated = { ...store[index], ...data } as TEntity;
    store[index] = updated;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return { ...updated } as TEntity;
  };

  const deleteImpl = async ({ where }: DeleteArgs) => {
    const index = store.findIndex((entity) => entity.id === where.id);
    if (index === -1) {
      throw new Error(`Entity with id "${String(where.id)}" not found`);
    }

    const [removed] = store.splice(index, 1);
    return { ...removed } as TEntity;
  };

  const countImpl = async (args?: CountArgs<TEntity>) => {
    if (!args?.where) {
      return store.length;
    }

    return store.reduce((total, entity) => (matchWhere(entity, args.where) ? total + 1 : total), 0);
  };

  const delegate = {
    get store() {
      return snapshot();
    },
    reset: () => {
      store = [];
    },
    findUnique: vi.fn(findUniqueImpl),
    findMany: vi.fn(findManyImpl),
    create: vi.fn(createImpl),
    update: vi.fn(updateImpl),
    delete: vi.fn(deleteImpl),
    count: vi.fn(countImpl),
    createMany: vi.fn(createManyImpl),
  } satisfies InMemoryCrudDelegate<TEntity>;

  return delegate;
};
