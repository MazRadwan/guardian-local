// Shared error types
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export class ApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApplicationError'
  }
}

export class InfrastructureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InfrastructureError'
  }
}
