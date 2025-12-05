/**
 * Assessment Controller
 *
 * Handles HTTP requests for assessment operations
 */

import { Request, Response, NextFunction } from 'express'
import { AssessmentService } from '../../../application/services/AssessmentService'
import { CreateAssessmentDTO } from '../../../application/dtos/CreateAssessmentDTO'
import { AssessmentTypeValue } from '../../../domain/value-objects/AssessmentType'

export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  /**
   * POST /api/assessments
   * Create a new assessment
   */
  createAssessment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        vendorName,
        vendorIndustry,
        vendorWebsite,
        vendorContactInfo,
        assessmentType,
        solutionName,
        solutionType,
        assessmentMetadata,
      } = req.body

      // Get authenticated user from middleware
      const userId = (req as any).user?.id

      if (!userId) {
        res.status(401).json({
          error: 'User not authenticated',
        })
        return
      }

      // Validation
      if (
        !vendorName ||
        typeof vendorName !== 'string' ||
        vendorName.trim().length === 0
      ) {
        res.status(400).json({
          error: 'Vendor name is required',
        })
        return
      }

      if (!assessmentType) {
        res.status(400).json({
          error: 'Assessment type is required',
        })
        return
      }

      const validTypes: AssessmentTypeValue[] = [
        'quick',
        'comprehensive',
        'category_focused',
      ]
      if (!validTypes.includes(assessmentType)) {
        res.status(400).json({
          error: `Invalid assessment type. Must be one of: ${validTypes.join(', ')}`,
        })
        return
      }

      const createData: CreateAssessmentDTO = {
        vendorName,
        vendorIndustry,
        vendorWebsite,
        vendorContactInfo,
        assessmentType,
        solutionName,
        solutionType,
        assessmentMetadata,
        createdBy: userId,
      }

      const result = await this.assessmentService.createAssessment(createData)

      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/assessments/:id
   * Get assessment by ID
   */
  getAssessment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params

      const assessment = await this.assessmentService.getAssessment(id)

      if (!assessment) {
        res.status(404).json({
          error: 'Assessment not found',
        })
        return
      }

      res.json({
        id: assessment.id,
        vendorId: assessment.vendorId,
        assessmentType: assessment.assessmentType,
        solutionName: assessment.solutionName,
        solutionType: assessment.solutionType,
        status: assessment.status,
        assessmentMetadata: assessment.assessmentMetadata,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
        createdBy: assessment.createdBy,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/assessments
   * List all assessments
   */
  listAssessments = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0

      const assessments = await this.assessmentService.listAssessments(
        limit,
        offset
      )

      res.json({
        assessments: assessments.map((a) => ({
          id: a.id,
          vendorId: a.vendorId,
          assessmentType: a.assessmentType,
          solutionName: a.solutionName,
          solutionType: a.solutionType,
          status: a.status,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          createdBy: a.createdBy,
        })),
        count: assessments.length,
        limit,
        offset,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * PATCH /api/assessments/:id/status
   * Update assessment status
   */
  updateAssessmentStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params
      const { status } = req.body

      if (!status) {
        res.status(400).json({
          error: 'Status is required',
        })
        return
      }

      const validStatuses = ['questions_generated', 'exported', 'cancelled']
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        })
        return
      }

      const updated = await this.assessmentService.updateAssessmentStatus(
        id,
        status
      )

      res.json({
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * DELETE /api/assessments/:id
   * Delete assessment
   */
  deleteAssessment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params

      // Verify assessment exists
      const assessment = await this.assessmentService.getAssessment(id)
      if (!assessment) {
        res.status(404).json({
          error: 'Assessment not found',
        })
        return
      }

      await this.assessmentService.deleteAssessment(id)

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
}
