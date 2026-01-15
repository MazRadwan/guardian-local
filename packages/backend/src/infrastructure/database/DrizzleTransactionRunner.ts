/**
 * Drizzle implementation of ITransactionRunner.
 *
 * Wraps Drizzle's transaction API to provide clean architecture compliance
 * by hiding infrastructure details from the application layer.
 */

import type { ITransactionRunner } from '../../application/interfaces/ITransactionRunner.js'
import { db } from './client.js'

export class DrizzleTransactionRunner implements ITransactionRunner {
  async run<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      return callback(tx)
    })
  }
}
