/**
 * Transaction runner port for database transactions.
 *
 * This interface abstracts transaction management from the application layer,
 * allowing services to execute atomic operations without depending on
 * infrastructure-specific database clients.
 *
 * The implementation is responsible for:
 * - Starting a database transaction
 * - Executing the callback within the transaction
 * - Committing on success, rolling back on failure
 */
export interface ITransactionRunner {
  /**
   * Execute a callback within a database transaction.
   * The callback receives a transaction context that can be passed to
   * repository methods supporting transactional operations.
   *
   * @param callback - Async function to execute within the transaction
   * @returns The result of the callback
   * @throws Rethrows any error from the callback (transaction is rolled back)
   */
  run<T>(callback: (tx: unknown) => Promise<T>): Promise<T>
}
