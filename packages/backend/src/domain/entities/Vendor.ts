/**
 * Vendor Domain Entity
 *
 * Represents a company/vendor being assessed.
 * Contains business rules and validation logic.
 */

import { VendorName } from '../value-objects/VendorName'

export interface VendorContactInfo {
  primaryContact?: string
  email?: string
  phone?: string
}

export interface CreateVendorData {
  name: string
  industry?: string
  website?: string
  contactInfo?: VendorContactInfo
}

export class Vendor {
  private constructor(
    public readonly id: string,
    private _name: VendorName,
    private _industry: string | null,
    private _website: string | null,
    private _contactInfo: VendorContactInfo | null,
    public readonly createdAt: Date,
    private _updatedAt: Date
  ) {}

  /**
   * Creates a new Vendor entity (for new vendors being created)
   */
  static create(data: CreateVendorData): Vendor {
    const name = VendorName.create(data.name)
    const now = new Date()

    return new Vendor(
      crypto.randomUUID(),
      name,
      data.industry || null,
      data.website || null,
      data.contactInfo || null,
      now,
      now
    )
  }

  /**
   * Reconstitutes a Vendor from persistence (database)
   */
  static fromPersistence(data: {
    id: string
    name: string
    industry: string | null
    website: string | null
    contactInfo: VendorContactInfo | null
    createdAt: Date
    updatedAt: Date
  }): Vendor {
    const name = VendorName.create(data.name)

    return new Vendor(
      data.id,
      name,
      data.industry,
      data.website,
      data.contactInfo,
      data.createdAt,
      data.updatedAt
    )
  }

  /**
   * Converts entity to persistence format (for database)
   */
  toPersistence(): {
    id: string
    name: string
    industry: string | null
    website: string | null
    contactInfo: VendorContactInfo | null
    createdAt: Date
    updatedAt: Date
  } {
    return {
      id: this.id,
      name: this._name.getValue(),
      industry: this._industry,
      website: this._website,
      contactInfo: this._contactInfo,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    }
  }

  // Getters
  get name(): string {
    return this._name.getValue()
  }

  get industry(): string | null {
    return this._industry
  }

  get website(): string | null {
    return this._website
  }

  get contactInfo(): VendorContactInfo | null {
    return this._contactInfo
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  // Business methods
  updateName(newName: string): void {
    this._name = VendorName.create(newName)
    this._updatedAt = new Date()
  }

  updateIndustry(industry: string | null): void {
    this._industry = industry
    this._updatedAt = new Date()
  }

  updateWebsite(website: string | null): void {
    this._website = website
    this._updatedAt = new Date()
  }

  updateContactInfo(contactInfo: VendorContactInfo | null): void {
    this._contactInfo = contactInfo
    this._updatedAt = new Date()
  }

  /**
   * Updates all vendor information at once
   */
  update(data: Partial<CreateVendorData>): void {
    if (data.name !== undefined) {
      this._name = VendorName.create(data.name)
    }
    if (data.industry !== undefined) {
      this._industry = data.industry || null
    }
    if (data.website !== undefined) {
      this._website = data.website || null
    }
    if (data.contactInfo !== undefined) {
      this._contactInfo = data.contactInfo || null
    }
    this._updatedAt = new Date()
  }
}
