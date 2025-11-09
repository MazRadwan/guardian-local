/**
 * Token Provider Interface
 *
 * Application Layer - Defines contract for JWT token generation and validation
 * Infrastructure layer implements this with JWT library
 */

export interface TokenPayload {
  userId: string
  email: string
  role: string
}

export interface ITokenProvider {
  /**
   * Generate JWT token from user data
   * @param payload - User data to encode in token
   * @returns JWT token string
   */
  generateToken(payload: TokenPayload): string

  /**
   * Validate and decode JWT token
   * @param token - JWT token string
   * @returns Decoded payload
   * @throws Error if token is invalid or expired
   */
  validateToken(token: string): TokenPayload
}
