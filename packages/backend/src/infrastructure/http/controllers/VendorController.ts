/**
 * Vendor Controller
 *
 * Handles HTTP requests for vendor operations
 */

import { Request, Response, NextFunction } from 'express'
import { AssessmentService } from '../../../application/services/AssessmentService'

export class VendorController {
  constructor(private readonly assessmentService: AssessmentService) {}

  /**
   * POST /api/vendors
   * Create a new vendor
   */
  createVendor = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { name, industry, website, contactInfo } = req.body

      // Validation
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
          error: 'Vendor name is required',
        })
        return
      }

      // Create vendor via assessment service
      const vendor = await this.assessmentService.createVendor({
        name,
        industry,
        website,
        contactInfo,
      })

      res.status(201).json({
        id: vendor.id,
        name: vendor.name,
        industry: vendor.industry,
        website: vendor.website,
        contactInfo: vendor.contactInfo,
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      })
    } catch (error) {
      // Handle duplicate vendor error
      if (error instanceof Error && error.message.includes('already exists')) {
        res.status(409).json({
          error: error.message,
        })
        return
      }
      next(error)
    }
  }

  /**
   * GET /api/vendors/:id
   * Get vendor by ID
   */
  getVendor = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params

      const vendor = await this.assessmentService.getVendor(id)

      if (!vendor) {
        res.status(404).json({
          error: 'Vendor not found',
        })
        return
      }

      res.json({
        id: vendor.id,
        name: vendor.name,
        industry: vendor.industry,
        website: vendor.website,
        contactInfo: vendor.contactInfo,
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/vendors
   * List all vendors
   */
  listVendors = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0

      const vendors = await this.assessmentService.listVendors(limit, offset)

      res.json({
        vendors: vendors.map((v) => ({
          id: v.id,
          name: v.name,
          industry: v.industry,
          website: v.website,
          contactInfo: v.contactInfo,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
        count: vendors.length,
        limit,
        offset,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/vendors/:id/assessments
   * Get all assessments for a vendor (vendor history)
   */
  getVendorAssessments = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params

      // Verify vendor exists
      const vendor = await this.assessmentService.getVendor(id)
      if (!vendor) {
        res.status(404).json({
          error: 'Vendor not found',
        })
        return
      }

      const assessments = await this.assessmentService.getVendorHistory(id)

      res.json({
        vendorId: id,
        vendorName: vendor.name,
        assessments: assessments.map((a) => ({
          id: a.id,
          assessmentType: a.assessmentType,
          solutionName: a.solutionName,
          solutionType: a.solutionType,
          status: a.status,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          createdBy: a.createdBy,
        })),
        count: assessments.length,
      })
    } catch (error) {
      next(error)
    }
  }
}
