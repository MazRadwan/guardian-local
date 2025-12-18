/**
 * Integration tests for multi-document context aggregation
 * Epic 17.3: Verifies that multiple uploaded documents' contexts are properly
 * stored and aggregated for Claude
 */

import { DrizzleFileRepository } from '../../src/infrastructure/database/repositories/DrizzleFileRepository'
import { DrizzleConversationRepository } from '../../src/infrastructure/database/repositories/DrizzleConversationRepository'
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { testDb, closeTestDb } from '../setup/test-db'
import { Conversation } from '../../src/domain/entities/Conversation'
import { User } from '../../src/domain/entities/User'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcrypt'

describe('Multi-Document Context Integration', () => {
  let fileRepository: DrizzleFileRepository
  let conversationRepository: DrizzleConversationRepository
  let userRepository: DrizzleUserRepository
  let testUserId: string
  let testConversationId: string

  beforeAll(async () => {
    // Initialize repositories with test database
    fileRepository = new DrizzleFileRepository(testDb)
    conversationRepository = new DrizzleConversationRepository(testDb)
    userRepository = new DrizzleUserRepository(testDb)
  })

  beforeEach(async () => {
    // Clean and setup test data
    await testDb.execute(sql`TRUNCATE TABLE files CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)

    // Create test user
    const passwordHash = await bcrypt.hash('testpass', 10)
    const user = User.create({
      email: 'multi-doc-test@example.com',
      name: 'Multi Doc Test',
      passwordHash,
      role: 'analyst',
    })
    const createdUser = await userRepository.create(user)
    testUserId = createdUser.id

    // Create test conversation
    const conversation = Conversation.create({
      userId: testUserId,
      mode: 'consult',
    })
    const createdConversation = await conversationRepository.create(conversation)
    testConversationId = createdConversation.id
  })

  afterAll(async () => {
    await testDb.execute(sql`TRUNCATE TABLE files CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)
    await closeTestDb()
  })

  describe('storing context on file rows', () => {
    it('should store intake context on individual file rows', async () => {
      // Create file
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test-doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test-doc.pdf',
      })

      // Store context
      const intakeContext = {
        vendorName: 'Acme Corp',
        solutionName: 'AI Platform',
        solutionType: 'SaaS',
        industry: 'Healthcare',
        features: ['NLP', 'ML'],
        claims: ['HIPAA compliant'],
        complianceMentions: ['HIPAA'],
      }

      await fileRepository.updateIntakeContext(file.id, intakeContext, ['privacy'])

      // Verify stored
      const files = await fileRepository.findByConversationWithContext(testConversationId)
      expect(files).toHaveLength(1)
      expect(files[0].intakeContext).toEqual(intakeContext)
      expect(files[0].intakeGapCategories).toEqual(['privacy'])
    })

    it('should store multiple contexts independently without overwriting', async () => {
      // Create two files
      const file1 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'vendor-doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/vendor-doc.pdf',
      })

      const file2 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'security-whitepaper.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storagePath: '/uploads/security-whitepaper.pdf',
      })

      // Store different contexts
      await fileRepository.updateIntakeContext(file1.id, {
        vendorName: 'Vendor A',
        solutionName: 'Product A',
        solutionType: null,
        industry: null,
        features: ['Feature 1'],
        claims: [],
        complianceMentions: [],
      })

      await fileRepository.updateIntakeContext(file2.id, {
        vendorName: 'Vendor A',
        solutionName: 'Product A',
        solutionType: null,
        industry: null,
        features: ['Feature 2'],
        claims: ['SOC 2 certified'],
        complianceMentions: ['SOC 2'],
      })

      // Verify BOTH contexts exist (not overwritten)
      const files = await fileRepository.findByConversationWithContext(testConversationId)
      expect(files).toHaveLength(2)

      const features = files.flatMap((f) => f.intakeContext?.features || [])
      expect(features).toContain('Feature 1')
      expect(features).toContain('Feature 2')
    })

    it('should store three different contexts independently', async () => {
      // Create three files
      const file1 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'overview.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/overview.pdf',
      })

      const file2 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'security.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storagePath: '/uploads/security.pdf',
      })

      const file3 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'compliance.pdf',
        mimeType: 'application/pdf',
        size: 3072,
        storagePath: '/uploads/compliance.pdf',
      })

      // Store different contexts emphasizing different aspects
      await fileRepository.updateIntakeContext(file1.id, {
        vendorName: 'MedTech AI',
        solutionName: 'Clinical Assistant',
        solutionType: 'AI chatbot',
        industry: 'Healthcare',
        features: ['diagnosis support', 'patient triage'],
        claims: [],
        complianceMentions: [],
      })

      await fileRepository.updateIntakeContext(file2.id, {
        vendorName: 'MedTech AI',
        solutionName: 'Clinical Assistant',
        solutionType: null,
        industry: null,
        features: ['encryption', 'access controls'],
        claims: ['bank-grade security'],
        complianceMentions: [],
      })

      await fileRepository.updateIntakeContext(file3.id, {
        vendorName: 'MedTech AI',
        solutionName: 'Clinical Assistant',
        solutionType: null,
        industry: null,
        features: [],
        claims: ['HIPAA compliant', 'SOC 2 Type II certified'],
        complianceMentions: ['HIPAA', 'SOC 2'],
      })

      // Verify all three contexts exist independently
      const files = await fileRepository.findByConversationWithContext(testConversationId)
      expect(files).toHaveLength(3)

      // Verify each file has its unique features
      const allFeatures = files.flatMap((f) => f.intakeContext?.features || [])
      expect(allFeatures).toContain('diagnosis support')
      expect(allFeatures).toContain('encryption')
      expect(allFeatures).toHaveLength(4) // Total 4 features across 3 files

      // Verify each file has its unique claims
      const allClaims = files.flatMap((f) => f.intakeContext?.claims || [])
      expect(allClaims).toContain('bank-grade security')
      expect(allClaims).toContain('HIPAA compliant')
      expect(allClaims).toContain('SOC 2 Type II certified')
      expect(allClaims).toHaveLength(3)
    })
  })

  describe('concurrent uploads', () => {
    it('should handle concurrent context updates without data loss', async () => {
      // Create 5 files
      const files = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          fileRepository.create({
            userId: testUserId,
            conversationId: testConversationId,
            filename: `doc-${i}.pdf`,
            mimeType: 'application/pdf',
            size: 1000,
            storagePath: `/uploads/doc-${i}.pdf`,
          })
        )
      )

      // Update all contexts concurrently (simulates parallel parsing)
      await Promise.all(
        files.map((file, i) =>
          fileRepository.updateIntakeContext(file.id, {
            vendorName: `Vendor ${i}`,
            solutionName: `Solution ${i}`,
            solutionType: null,
            industry: null,
            features: [`Feature-${i}`],
            claims: [],
            complianceMentions: [],
          })
        )
      )

      // Verify ALL contexts stored (no race condition loss)
      const filesWithContext =
        await fileRepository.findByConversationWithContext(testConversationId)
      expect(filesWithContext).toHaveLength(5)

      // Verify each file has correct context
      const vendorNames = filesWithContext.map((f) => f.intakeContext?.vendorName).sort()
      expect(vendorNames).toEqual(['Vendor 0', 'Vendor 1', 'Vendor 2', 'Vendor 3', 'Vendor 4'])
    })

    it('should handle 10 concurrent uploads without data loss', async () => {
      // Create 10 files
      const files = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          fileRepository.create({
            userId: testUserId,
            conversationId: testConversationId,
            filename: `document-${i}.pdf`,
            mimeType: 'application/pdf',
            size: 1024 * (i + 1),
            storagePath: `/uploads/document-${i}.pdf`,
          })
        )
      )

      // Simulate concurrent parsing with different features
      await Promise.all(
        files.map((file, i) =>
          fileRepository.updateIntakeContext(
            file.id,
            {
              vendorName: 'Concurrent Vendor',
              solutionName: 'Test Solution',
              solutionType: null,
              industry: null,
              features: [`ConcurrentFeature-${i}`, `SharedFeature`],
              claims: [`Claim-${i}`],
              complianceMentions: [],
            },
            [`category-${i}`]
          )
        )
      )

      // Verify all 10 contexts stored
      const filesWithContext =
        await fileRepository.findByConversationWithContext(testConversationId)
      expect(filesWithContext).toHaveLength(10)

      // Verify each unique feature is present
      const allFeatures = filesWithContext.flatMap((f) => f.intakeContext?.features || [])
      for (let i = 0; i < 10; i++) {
        expect(allFeatures).toContain(`ConcurrentFeature-${i}`)
      }

      // Verify gap categories
      const allGapCategories = filesWithContext.flatMap((f) => f.intakeGapCategories || [])
      expect(allGapCategories).toHaveLength(10)
    })
  })

  describe('query ordering', () => {
    it('should return files sorted by parse time', async () => {
      // Create files
      const file1 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'first.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/first.pdf',
      })

      const file2 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'second.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/second.pdf',
      })

      // Parse in reverse order (second file first)
      await new Promise((resolve) => setTimeout(resolve, 10))
      await fileRepository.updateIntakeContext(file2.id, {
        vendorName: 'Second',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await fileRepository.updateIntakeContext(file1.id, {
        vendorName: 'First',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      // Should return sorted by parse time (file2 first, then file1)
      const files = await fileRepository.findByConversationWithContext(testConversationId)
      expect(files[0].intakeContext?.vendorName).toBe('Second')
      expect(files[1].intakeContext?.vendorName).toBe('First')
    })

    it('should maintain parse order for three files parsed sequentially', async () => {
      const file1 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'alpha.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/alpha.pdf',
      })

      const file2 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'beta.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/beta.pdf',
      })

      const file3 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'gamma.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/gamma.pdf',
      })

      // Parse in sequential order with delays
      await new Promise((resolve) => setTimeout(resolve, 10))
      await fileRepository.updateIntakeContext(file1.id, {
        vendorName: 'Alpha Corp',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await fileRepository.updateIntakeContext(file2.id, {
        vendorName: 'Beta Corp',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await fileRepository.updateIntakeContext(file3.id, {
        vendorName: 'Gamma Corp',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      // Should return in parse order (Alpha, Beta, Gamma)
      const files = await fileRepository.findByConversationWithContext(testConversationId)
      expect(files).toHaveLength(3)
      expect(files[0].intakeContext?.vendorName).toBe('Alpha Corp')
      expect(files[1].intakeContext?.vendorName).toBe('Beta Corp')
      expect(files[2].intakeContext?.vendorName).toBe('Gamma Corp')
    })
  })

  describe('multi-document aggregation scenarios', () => {
    it('should aggregate contexts from multiple documents about same vendor', async () => {
      // Scenario: User uploads 3 documents about same vendor
      const overviewDoc = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'vendor-overview.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storagePath: '/uploads/vendor-overview.pdf',
      })

      const securityDoc = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'security-whitepaper.pdf',
        mimeType: 'application/pdf',
        size: 3072,
        storagePath: '/uploads/security-whitepaper.pdf',
      })

      const complianceDoc = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'compliance-cert.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/compliance-cert.pdf',
      })

      // Parse each document with distinct information
      await fileRepository.updateIntakeContext(overviewDoc.id, {
        vendorName: 'HealthTech Solutions',
        solutionName: 'AI Diagnostic Assistant',
        solutionType: 'Clinical decision support',
        industry: 'Healthcare',
        features: ['symptom analysis', 'treatment recommendations'],
        claims: [],
        complianceMentions: [],
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      await fileRepository.updateIntakeContext(securityDoc.id, {
        vendorName: 'HealthTech Solutions',
        solutionName: 'AI Diagnostic Assistant',
        solutionType: null,
        industry: null,
        features: ['end-to-end encryption', 'role-based access control', 'audit logging'],
        claims: ['military-grade security'],
        complianceMentions: [],
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      await fileRepository.updateIntakeContext(
        complianceDoc.id,
        {
          vendorName: 'HealthTech Solutions',
          solutionName: 'AI Diagnostic Assistant',
          solutionType: null,
          industry: null,
          features: [],
          claims: ['HIPAA compliant', 'SOC 2 Type II', 'GDPR ready'],
          complianceMentions: ['HIPAA', 'SOC 2', 'GDPR'],
        },
        ['data_privacy', 'security']
      )

      // Retrieve all contexts
      const allContexts = await fileRepository.findByConversationWithContext(testConversationId)

      expect(allContexts).toHaveLength(3)

      // Verify aggregation potential (what ChatServer would do)
      const allFeatures = allContexts.flatMap((f) => f.intakeContext?.features || [])
      const allClaims = allContexts.flatMap((f) => f.intakeContext?.claims || [])
      const allComplianceMentions = allContexts.flatMap(
        (f) => f.intakeContext?.complianceMentions || []
      )

      // 5 features total from 2 documents
      expect(allFeatures).toHaveLength(5)
      expect(allFeatures).toContain('symptom analysis')
      expect(allFeatures).toContain('audit logging')

      // 4 claims total from 2 documents
      expect(allClaims).toHaveLength(4)
      expect(allClaims).toContain('military-grade security')
      expect(allClaims).toContain('HIPAA compliant')

      // 3 compliance mentions from 1 document
      expect(allComplianceMentions).toHaveLength(3)
      expect(allComplianceMentions).toContain('HIPAA')
      expect(allComplianceMentions).toContain('SOC 2')
      expect(allComplianceMentions).toContain('GDPR')
    })

    it('should handle mixed context richness (detailed vs sparse)', async () => {
      // Scenario: One document is detailed, others are sparse
      const detailedDoc = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'detailed-spec.pdf',
        mimeType: 'application/pdf',
        size: 5120,
        storagePath: '/uploads/detailed-spec.pdf',
      })

      const sparseDoc = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
        size: 512,
        storagePath: '/uploads/brief.pdf',
      })

      // Detailed context
      await fileRepository.updateIntakeContext(detailedDoc.id, {
        vendorName: 'AI Innovations Inc',
        solutionName: 'SmartPredict Pro',
        solutionType: 'Predictive analytics platform',
        industry: 'Financial Services',
        features: [
          'real-time predictions',
          'anomaly detection',
          'custom models',
          'API integration',
        ],
        claims: ['99.9% uptime', 'sub-second latency', 'ISO 27001 certified'],
        complianceMentions: ['ISO 27001', 'PCI DSS'],
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      // Sparse context (minimal info extracted)
      await fileRepository.updateIntakeContext(sparseDoc.id, {
        vendorName: 'AI Innovations Inc',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: ['cloud-based'],
        claims: [],
        complianceMentions: [],
      })

      // Retrieve all
      const allContexts = await fileRepository.findByConversationWithContext(testConversationId)

      expect(allContexts).toHaveLength(2)

      // Detailed document should contribute most info
      expect(allContexts[0].intakeContext?.features).toHaveLength(4)
      expect(allContexts[1].intakeContext?.features).toHaveLength(1)

      // Aggregated features should include all
      const allFeatures = allContexts.flatMap((f) => f.intakeContext?.features || [])
      expect(allFeatures).toHaveLength(5)
      expect(allFeatures).toContain('real-time predictions')
      expect(allFeatures).toContain('cloud-based')
    })
  })

  describe('edge cases', () => {
    it('should handle file with empty arrays in context', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'minimal.pdf',
        mimeType: 'application/pdf',
        size: 256,
        storagePath: '/uploads/minimal.pdf',
      })

      await fileRepository.updateIntakeContext(file.id, {
        vendorName: 'Minimal Vendor',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      const files = await fileRepository.findByConversationWithContext(testConversationId)

      expect(files).toHaveLength(1)
      expect(files[0].intakeContext?.features).toEqual([])
      expect(files[0].intakeContext?.claims).toEqual([])
    })

    it('should handle very long feature lists', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'comprehensive.pdf',
        mimeType: 'application/pdf',
        size: 10240,
        storagePath: '/uploads/comprehensive.pdf',
      })

      const longFeatureList = Array.from({ length: 50 }, (_, i) => `Feature ${i + 1}`)

      await fileRepository.updateIntakeContext(file.id, {
        vendorName: 'Feature-Rich Vendor',
        solutionName: 'Mega Platform',
        solutionType: 'Enterprise solution',
        industry: 'Technology',
        features: longFeatureList,
        claims: [],
        complianceMentions: [],
      })

      const files = await fileRepository.findByConversationWithContext(testConversationId)

      expect(files).toHaveLength(1)
      expect(files[0].intakeContext?.features).toHaveLength(50)
      expect(files[0].intakeContext?.features[0]).toBe('Feature 1')
      expect(files[0].intakeContext?.features[49]).toBe('Feature 50')
    })

    it('should handle special characters in context strings', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'special-chars.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/special-chars.pdf',
      })

      await fileRepository.updateIntakeContext(file.id, {
        vendorName: "O'Brien & Associates",
        solutionName: 'AI/ML Platform "Pro"',
        solutionType: 'Cloud-native <SaaS>',
        industry: 'Healthcare & Life Sciences',
        features: ['Feature with "quotes"', 'Feature with <tags>', "Feature with 'apostrophes'"],
        claims: ['100% secure (verified)', 'ISO-27001:2013 certified'],
        complianceMentions: ['ISO-27001:2013', 'HIPAA/HITECH'],
      })

      const files = await fileRepository.findByConversationWithContext(testConversationId)

      expect(files).toHaveLength(1)
      expect(files[0].intakeContext?.vendorName).toBe("O'Brien & Associates")
      expect(files[0].intakeContext?.solutionName).toBe('AI/ML Platform "Pro"')
      expect(files[0].intakeContext?.features).toContain('Feature with "quotes"')
    })
  })
})
