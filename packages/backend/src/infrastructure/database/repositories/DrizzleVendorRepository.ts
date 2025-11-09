/**
 * Drizzle Vendor Repository
 *
 * Implements IVendorRepository using Drizzle ORM
 */

import { eq, ilike } from 'drizzle-orm'
import { db } from '../client'
import { vendors } from '../schema/vendors'
import { IVendorRepository } from '../../../application/interfaces/IVendorRepository'
import { Vendor } from '../../../domain/entities/Vendor'

export class DrizzleVendorRepository implements IVendorRepository {
  async create(vendor: Vendor): Promise<Vendor> {
    const persistence = vendor.toPersistence()

    const [created] = await db
      .insert(vendors)
      .values({
        id: persistence.id,
        name: persistence.name,
        industry: persistence.industry,
        website: persistence.website,
        contactInfo: persistence.contactInfo,
        createdAt: persistence.createdAt,
        updatedAt: persistence.updatedAt,
      })
      .returning()

    return Vendor.fromPersistence({
      id: created.id,
      name: created.name,
      industry: created.industry,
      website: created.website,
      contactInfo: created.contactInfo,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    })
  }

  async findById(id: string): Promise<Vendor | null> {
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1)

    if (!vendor) {
      return null
    }

    return Vendor.fromPersistence({
      id: vendor.id,
      name: vendor.name,
      industry: vendor.industry,
      website: vendor.website,
      contactInfo: vendor.contactInfo,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    })
  }

  async findByName(name: string): Promise<Vendor | null> {
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.name, name))
      .limit(1)

    if (!vendor) {
      return null
    }

    return Vendor.fromPersistence({
      id: vendor.id,
      name: vendor.name,
      industry: vendor.industry,
      website: vendor.website,
      contactInfo: vendor.contactInfo,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    })
  }

  async update(vendor: Vendor): Promise<Vendor> {
    const persistence = vendor.toPersistence()

    const [updated] = await db
      .update(vendors)
      .set({
        name: persistence.name,
        industry: persistence.industry,
        website: persistence.website,
        contactInfo: persistence.contactInfo,
        updatedAt: persistence.updatedAt,
      })
      .where(eq(vendors.id, persistence.id))
      .returning()

    return Vendor.fromPersistence({
      id: updated.id,
      name: updated.name,
      industry: updated.industry,
      website: updated.website,
      contactInfo: updated.contactInfo,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  }

  async delete(id: string): Promise<void> {
    await db.delete(vendors).where(eq(vendors.id, id))
  }

  async list(limit: number = 100, offset: number = 0): Promise<Vendor[]> {
    const results = await db
      .select()
      .from(vendors)
      .orderBy(vendors.name)
      .limit(limit)
      .offset(offset)

    return results.map((vendor) =>
      Vendor.fromPersistence({
        id: vendor.id,
        name: vendor.name,
        industry: vendor.industry,
        website: vendor.website,
        contactInfo: vendor.contactInfo,
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      })
    )
  }

  async searchByName(searchTerm: string): Promise<Vendor[]> {
    const results = await db
      .select()
      .from(vendors)
      .where(ilike(vendors.name, `%${searchTerm}%`))
      .orderBy(vendors.name)
      .limit(50)

    return results.map((vendor) =>
      Vendor.fromPersistence({
        id: vendor.id,
        name: vendor.name,
        industry: vendor.industry,
        website: vendor.website,
        contactInfo: vendor.contactInfo,
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      })
    )
  }
}
