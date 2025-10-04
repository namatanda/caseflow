# Backend Data Access Architecture

This note summarizes how repositories and services are composed in the CourtFlow backend so new contributors can orient themselves before extending the system (for example when wiring in authentication). For a higher-level system tour, see the [Architecture Overview](../README.md#architecture-overview) section of the README.

## Prisma access through repositories

- `src/repositories/baseRepository.ts` wraps a Prisma CRUD delegate (for example `prisma.case`). It centralizes common helpers (`findById`, `findPaginated`, `transaction`) so domain repositories only focus on their query shapes.
- Every domain repository (for example `CaseRepository`, `DailyImportBatchRepository`) extends `BaseRepository` and injects the appropriate delegate in its constructor. This makes the repositories easy to swap in tests by providing a different delegate implementation.
- Delegates come either from the shared Prisma client exported in `src/config/database.ts` or from in-memory mocks during testing. Repositories are responsible for assembling Prisma arguments (include/select clauses, compound unique keys, pagination inputs) before delegating to Prisma.

## Service layer responsibilities

- Services inherit from `src/services/baseService.ts`. The base class supplies structured logging, contextual metadata, and consistent error handling via `ServiceError`.
- `BaseService` exposes two key execution helpers:
  - `execute` runs any repository call with error wrapping.
  - `runInTransaction` wraps `repository.transaction(...)`, ensuring service-level operations that touch multiple repositories participate in the same Prisma transaction and benefit from retry logic defined in `withTransaction`.
- Services compose multiple repositories when needed. For example `DailyImportBatchService` coordinates updates to `dailyImportBatch` rows and conditionally writes `ImportErrorDetail` records within a single transaction boundary.

## Transaction boundaries

- `BaseRepository.transaction` delegates to `withTransaction` from `src/config/database.ts`. That helper executes the provided callback in `prisma.$transaction` with retry semantics and timeout controls.
- Inside a transaction callback the service receives a `TransactionClient`. This client exposes the same model delegates (`tx.dailyImportBatch`, `tx.importErrorDetail`, etc.) but is scoped to the open transaction.
- When a service needs transactional access to another repository while inside `runInTransaction`, instantiate that repository with the transaction-scoped delegate (see `DailyImportBatchService`, which creates a new `ImportErrorDetailRepository(tx.importErrorDetail)`). Avoid reusing singleton repository instances inside transactions; always build a fresh instance around the `tx` delegate so all operations share the same transaction context.

## Mocking and testing patterns

- Unit tests avoid touching the real database by providing in-memory delegates via `src/tests/mocks/inMemoryCrudDelegate.ts`. The factory returns an object that satisfies the Prisma delegate shape (`findMany`, `create`, `update`, etc.) and records interactions with `vitest` spies.
- Repository tests inject the in-memory delegate into the repository constructor instead of the real Prisma delegate. This keeps repository logic testable without a database while still exercising pagination helpers and argument construction.
- Services can also be tested by passing repositories that use in-memory delegates or explicit stubs. Because repositories accept any delegate conforming to the Prisma API, tests can assert on transactional behavior (for example verifying `createMany` is called with expected options) without relying on Prisma-generated types.

## How this informs upcoming authentication work

- New authentication flows can plug into the existing pattern by creating repositories for user-facing models and layering service logic on top. Use `runInTransaction` whenever a service needs to mutate multiple models in a single unit of work (e.g., creating a user record and related audit entries).
- When writing tests for authentication, prefer the in-memory delegate helpers so specs remain fast and deterministic. If a service needs a combination of repositories, construct each with the same in-memory delegate or provide transaction-aware stubs that mirror the real structure.

Keeping these conventions consistent will make it easier to reason about where database access happens, how to extend the transaction boundaries safely, and how to unit-test new features without the live database.
