import { ResponseDTO, CreateResponseDTO } from '../../domain/scoring/dtos'

export interface IResponseRepository {
  createBatch(responses: CreateResponseDTO[]): Promise<ResponseDTO[]>
  findByAssessmentId(assessmentId: string): Promise<ResponseDTO[]>
  findByBatchId(assessmentId: string, batchId: string): Promise<ResponseDTO[]>
  deleteByBatchId(assessmentId: string, batchId: string): Promise<void>
}
