/**
 * ISO 42001:2023 + ISO 23894:2023 Seed Data
 *
 * Tier 1: Annex A controls from ISO/IEC 42001:2023 (AI Management System)
 * and supplementary controls from ISO/IEC 23894:2023 (AI Risk Management).
 *
 * IMPORTANT: Criteria text is written in Guardian's own language,
 * referencing ISO clause numbers but NOT reproducing verbatim ISO text.
 * This is copyright-compliant interpretive criteria.
 *
 * Guardian-native dimensions (clinical_risk, vendor_capability,
 * ethical_considerations, sustainability) have ZERO mappings.
 */

import type { RiskDimension } from '../../src/domain/types/QuestionnaireSchema.js'

export interface SeedControl {
  clauseRef: string
  domain: string
  title: string
  criteria: string
  guidance: string
  dimensions: RiskDimension[]
  relevanceWeight?: number
}

export const ISO_42001_CONTROLS: SeedControl[] = [
  // --- Domain: Context of the organization ---
  {
    clauseRef: 'A.4.2',
    domain: 'Context of the organization',
    title: 'AI policy',
    criteria:
      'Organization has established and maintains an AI policy aligned with business objectives and regulatory requirements.',
    guidance:
      'Look for documented AI governance policy, executive endorsement, and regular review cadence.',
    dimensions: ['regulatory_compliance'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.4.3',
    domain: 'Context of the organization',
    title: 'Internal and external issues',
    criteria:
      'Organization identifies and monitors internal and external factors affecting AI system outcomes, including societal impacts.',
    guidance:
      'Evaluate stakeholder analysis processes, environmental scanning for AI-related regulatory changes.',
    dimensions: ['regulatory_compliance'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: 'A.4.4',
    domain: 'Context of the organization',
    title: 'Scope of the AI management system',
    criteria:
      'Organization defines clear boundaries for AI system governance, covering all in-scope AI applications.',
    guidance:
      'Check for documented AIMS scope, boundary definitions, and inclusion/exclusion criteria.',
    dimensions: ['regulatory_compliance', 'operational_excellence'],
    relevanceWeight: 0.7,
  },

  // --- Domain: Leadership ---
  {
    clauseRef: 'A.5.2',
    domain: 'Leadership',
    title: 'AI roles and responsibilities',
    criteria:
      'Organization assigns clear roles, responsibilities, and authorities for AI system governance at all levels.',
    guidance:
      'Verify role definitions, RACI charts, board-level oversight of AI operations.',
    dimensions: ['operational_excellence'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.5.3',
    domain: 'Leadership',
    title: 'Resourcing AI management',
    criteria:
      'Adequate resources are allocated for AI governance, including specialized talent and tools.',
    guidance:
      'Assess budget allocation, headcount, training programs, and tooling investment for AI.',
    dimensions: ['operational_excellence'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: 'A.5.4',
    domain: 'Leadership',
    title: 'Competence and awareness',
    criteria:
      'Personnel involved in AI systems possess required competencies, with ongoing training programs in place.',
    guidance:
      'Review training records, competency frameworks, and awareness programs for AI ethics and safety.',
    dimensions: ['operational_excellence'],
    relevanceWeight: 0.7,
  },

  // --- Domain: Planning ---
  {
    clauseRef: 'A.6.1.1',
    domain: 'Planning',
    title: 'AI risk assessment',
    criteria:
      'Organization conducts systematic risk assessments specific to AI systems, covering technical, ethical, and operational risks.',
    guidance:
      'Evaluate AI risk assessment methodology, frequency, scope coverage, and risk register.',
    dimensions: ['regulatory_compliance', 'security_risk'],
    relevanceWeight: 0.9,
  },
  {
    clauseRef: 'A.6.1.2',
    domain: 'Planning',
    title: 'AI risk treatment',
    criteria:
      'Risk treatment plans address identified AI risks with appropriate controls, residual risk acceptance criteria, and monitoring.',
    guidance:
      'Review risk treatment plans, control selection rationale, and residual risk documentation.',
    dimensions: ['regulatory_compliance', 'security_risk'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.6.1.3',
    domain: 'Planning',
    title: 'AI impact assessment',
    criteria:
      'Organization conducts impact assessments evaluating societal, ethical, and individual effects of AI systems.',
    guidance:
      'Check for documented impact assessments, stakeholder consultation records, and mitigation plans.',
    dimensions: ['regulatory_compliance', 'ai_transparency'],
    relevanceWeight: 0.8,
  },

  // --- Domain: Support ---
  {
    clauseRef: 'A.7.1',
    domain: 'Support',
    title: 'Documentation and records',
    criteria:
      'Comprehensive documentation exists for AI system design, development, deployment, and operational decisions.',
    guidance:
      'Verify documentation standards, version control, and record retention policies for AI artifacts.',
    dimensions: ['operational_excellence', 'ai_transparency'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: 'A.7.2',
    domain: 'Support',
    title: 'Communication',
    criteria:
      'Organization maintains transparent communication about AI system capabilities, limitations, and decisions.',
    guidance:
      'Assess internal and external communication protocols for AI-related disclosures.',
    dimensions: ['ai_transparency'],
    relevanceWeight: 0.8,
  },

  // --- Domain: Operation ---
  {
    clauseRef: 'A.8.2',
    domain: 'Operation',
    title: 'AI system lifecycle management',
    criteria:
      'Defined processes govern the full AI lifecycle from design through decommissioning, with stage gates and approvals.',
    guidance:
      'Review lifecycle management framework, stage gate criteria, approval workflows.',
    dimensions: ['operational_excellence'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.8.3',
    domain: 'Operation',
    title: 'Third-party and supply chain',
    criteria:
      'Organization assesses and manages AI-related risks from third-party components, models, and data sources.',
    guidance:
      'Evaluate vendor assessment processes, supply chain risk management, and contractual requirements.',
    dimensions: ['operational_excellence', 'security_risk'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.8.4',
    domain: 'Operation',
    title: 'AI system design and development',
    criteria:
      'Development processes incorporate requirements for safety, fairness, transparency, and accountability by design.',
    guidance:
      'Review development standards, design patterns for responsible AI, code review processes.',
    dimensions: ['technical_credibility', 'ai_transparency'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.8.5',
    domain: 'Operation',
    title: 'AI system testing and validation',
    criteria:
      'Rigorous testing and validation processes verify AI system performance, fairness, safety, and robustness.',
    guidance:
      'Assess testing frameworks, validation metrics, bias testing, adversarial testing protocols.',
    dimensions: ['technical_credibility'],
    relevanceWeight: 0.9,
  },

  // --- Domain: Data management ---
  {
    clauseRef: 'A.6.2.2',
    domain: 'Data management',
    title: 'Data governance for AI',
    criteria:
      'Organization implements data governance specific to AI, covering data ownership, stewardship, and lifecycle management.',
    guidance:
      'Evaluate data governance framework, roles, policies, and their AI-specific provisions.',
    dimensions: ['privacy_risk', 'regulatory_compliance'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.6.2.3',
    domain: 'Data management',
    title: 'Data collection and acquisition',
    criteria:
      'Data collection processes ensure consent, provenance tracking, and compliance with applicable regulations.',
    guidance:
      'Review data collection policies, consent mechanisms, provenance documentation.',
    dimensions: ['privacy_risk', 'regulatory_compliance'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.6.2.4',
    domain: 'Data management',
    title: 'Data preparation and labeling',
    criteria:
      'Data preparation processes maintain quality standards with documented labeling procedures and quality checks.',
    guidance:
      'Assess labeling workflows, inter-annotator agreement metrics, quality assurance processes.',
    dimensions: ['technical_credibility'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: 'A.6.2.5',
    domain: 'Data management',
    title: 'Data privacy and protection',
    criteria:
      'AI-specific data protection measures address privacy risks including re-identification, inference attacks, and model memorization.',
    guidance:
      'Evaluate privacy-preserving techniques, DPIA for AI, anonymization/pseudonymization methods.',
    dimensions: ['privacy_risk', 'security_risk'],
    relevanceWeight: 0.9,
  },
  {
    clauseRef: 'A.6.2.6',
    domain: 'Data management',
    title: 'Data quality management for AI systems',
    criteria:
      'Organization implements systematic processes for ensuring AI training and operational data meets quality, completeness, and representativeness standards.',
    guidance:
      'Evaluate data quality processes, bias testing, data lineage documentation.',
    dimensions: ['regulatory_compliance', 'technical_credibility'],
    relevanceWeight: 0.8,
  },

  // --- Domain: AI system transparency ---
  {
    clauseRef: 'A.9.1',
    domain: 'AI system transparency',
    title: 'Explainability requirements',
    criteria:
      'AI system outputs are explainable at a level appropriate for the use case, with documented explanation methods.',
    guidance:
      'Review explainability approaches (SHAP, LIME, etc.), documentation, user-facing explanations.',
    dimensions: ['ai_transparency'],
    relevanceWeight: 0.9,
  },
  {
    clauseRef: 'A.9.2',
    domain: 'AI system transparency',
    title: 'AI system disclosure',
    criteria:
      'Organization discloses when AI is used in decision-making, including the scope and limitations of AI involvement.',
    guidance:
      'Check disclosure policies, user notifications, public-facing AI usage statements.',
    dimensions: ['ai_transparency', 'regulatory_compliance'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.9.3',
    domain: 'AI system transparency',
    title: 'Model documentation',
    criteria:
      'AI models are documented with model cards or equivalent, covering intended use, performance characteristics, and known limitations.',
    guidance:
      'Assess model card completeness, performance benchmarks, limitation disclosures.',
    dimensions: ['ai_transparency', 'technical_credibility'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.9.4',
    domain: 'AI system transparency',
    title: 'Auditability',
    criteria:
      'AI systems maintain audit trails sufficient for internal and external audit of decisions, data usage, and model behavior.',
    guidance:
      'Verify audit trail implementation, log retention, audit access controls.',
    dimensions: ['ai_transparency', 'regulatory_compliance'],
    relevanceWeight: 0.8,
  },

  // --- Domain: Monitoring and measurement ---
  {
    clauseRef: 'A.10.1',
    domain: 'Monitoring and measurement',
    title: 'AI system performance monitoring',
    criteria:
      'Continuous monitoring tracks AI system performance, drift, and degradation with defined thresholds and alerting.',
    guidance:
      'Evaluate monitoring dashboards, drift detection, alerting thresholds, response procedures.',
    dimensions: ['technical_credibility', 'operational_excellence'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.10.2',
    domain: 'Monitoring and measurement',
    title: 'Bias and fairness monitoring',
    criteria:
      'Organization monitors AI outputs for bias and fairness across protected groups with defined metrics and remediation processes.',
    guidance:
      'Review fairness metrics, monitoring frequency, protected attribute tracking, remediation workflows.',
    dimensions: ['ai_transparency', 'regulatory_compliance'],
    relevanceWeight: 0.9,
  },
  {
    clauseRef: 'A.10.3',
    domain: 'Monitoring and measurement',
    title: 'Incident management for AI',
    criteria:
      'AI-specific incident management processes handle failures, unintended behaviors, and safety events with root cause analysis.',
    guidance:
      'Assess incident classification, response procedures, RCA processes, post-incident reviews.',
    dimensions: ['operational_excellence', 'security_risk'],
    relevanceWeight: 0.8,
  },

  // --- Domain: Security controls for AI ---
  {
    clauseRef: 'A.11.1',
    domain: 'Security controls for AI',
    title: 'AI system security',
    criteria:
      'Security controls protect AI systems from adversarial attacks, data poisoning, model theft, and unauthorized access.',
    guidance:
      'Evaluate adversarial robustness testing, access controls, model protection measures.',
    dimensions: ['security_risk'],
    relevanceWeight: 0.9,
  },
  {
    clauseRef: 'A.11.2',
    domain: 'Security controls for AI',
    title: 'Model integrity and protection',
    criteria:
      'Measures protect model integrity throughout the lifecycle, including secure model storage, versioning, and deployment.',
    guidance:
      'Review model registry security, integrity verification, deployment pipeline security.',
    dimensions: ['security_risk', 'technical_credibility'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.11.3',
    domain: 'Security controls for AI',
    title: 'Data security for AI',
    criteria:
      'Training data, inference data, and model artifacts are protected with appropriate security controls.',
    guidance:
      'Assess data encryption, access controls, secure data pipelines, data loss prevention.',
    dimensions: ['security_risk', 'privacy_risk'],
    relevanceWeight: 0.8,
  },

  // --- Domain: Continual improvement ---
  {
    clauseRef: 'A.12.1',
    domain: 'Continual improvement',
    title: 'Management review of AI systems',
    criteria:
      'Regular management reviews assess AI system performance, compliance status, and improvement opportunities.',
    guidance:
      'Check management review records, frequency, scope, and resulting action items.',
    dimensions: ['operational_excellence'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: 'A.12.2',
    domain: 'Continual improvement',
    title: 'Corrective actions for AI',
    criteria:
      'Systematic corrective action processes address AI system nonconformities with root cause analysis and effectiveness verification.',
    guidance:
      'Evaluate corrective action procedures, CAPA records, effectiveness tracking.',
    dimensions: ['operational_excellence'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: 'A.12.3',
    domain: 'Continual improvement',
    title: 'Model retraining and update governance',
    criteria:
      'Model updates and retraining follow governed processes with validation, approval, and rollback capabilities.',
    guidance:
      'Review retraining triggers, validation requirements, approval workflows, rollback procedures.',
    dimensions: ['technical_credibility', 'operational_excellence'],
    relevanceWeight: 0.8,
  },

  // --- Domain: Regulatory and compliance ---
  {
    clauseRef: 'A.13.1',
    domain: 'Regulatory and compliance',
    title: 'Legal and regulatory awareness',
    criteria:
      'Organization maintains awareness of applicable AI-specific laws, regulations, and standards across operating jurisdictions.',
    guidance:
      'Assess regulatory monitoring processes, legal counsel engagement, compliance tracking.',
    dimensions: ['regulatory_compliance'],
    relevanceWeight: 0.9,
  },
  {
    clauseRef: 'A.13.2',
    domain: 'Regulatory and compliance',
    title: 'Compliance with AI-specific requirements',
    criteria:
      'Documented processes ensure AI systems comply with applicable regulatory requirements (e.g., EU AI Act, sector-specific rules).',
    guidance:
      'Review compliance mapping, gap analysis, remediation plans, regulatory reporting.',
    dimensions: ['regulatory_compliance'],
    relevanceWeight: 0.9,
  },
  {
    clauseRef: 'A.13.3',
    domain: 'Regulatory and compliance',
    title: 'Cross-border data and AI considerations',
    criteria:
      'Organization addresses cross-border requirements for AI systems including data sovereignty and jurisdictional differences.',
    guidance:
      'Evaluate cross-border data transfer mechanisms, jurisdictional analysis, localization requirements.',
    dimensions: ['regulatory_compliance', 'privacy_risk'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: 'A.13.4',
    domain: 'Regulatory and compliance',
    title: 'Human oversight mechanisms',
    criteria:
      'Appropriate human oversight mechanisms exist for AI systems proportionate to risk level, including override capabilities.',
    guidance:
      'Review human-in-the-loop processes, override procedures, escalation paths, authority levels.',
    dimensions: ['regulatory_compliance', 'ai_transparency'],
    relevanceWeight: 0.8,
  },
]

export const ISO_23894_CONTROLS: SeedControl[] = [
  {
    clauseRef: '5.2',
    domain: 'Risk management',
    title: 'AI risk management principles',
    criteria:
      'Organization applies AI-specific risk management principles that address uncertainty, emergent behaviors, and evolving threat landscapes.',
    guidance:
      'Evaluate risk management principles documentation, alignment with organizational risk appetite.',
    dimensions: ['regulatory_compliance', 'operational_excellence'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: '5.4',
    domain: 'Risk management',
    title: 'AI risk identification',
    criteria:
      'Systematic processes identify AI-specific risks including technical failures, misuse, societal harms, and cascading effects.',
    guidance:
      'Assess risk identification methods, risk taxonomy, stakeholder input processes.',
    dimensions: ['regulatory_compliance', 'security_risk'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: '6.2',
    domain: 'Risk management',
    title: 'AI risk analysis and evaluation',
    criteria:
      'Organization analyzes and evaluates AI risks using criteria that account for AI-specific characteristics such as opacity and scalability.',
    guidance:
      'Review risk analysis methodology, evaluation criteria, risk matrix for AI-specific factors.',
    dimensions: ['regulatory_compliance'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: '6.3',
    domain: 'Risk management',
    title: 'Risk treatment for AI systems',
    criteria:
      'Organization applies systematic risk treatment processes specific to AI systems, including residual risk assessment and risk acceptance criteria.',
    guidance:
      'Evaluate risk register, treatment plans, acceptance criteria, monitoring processes.',
    dimensions: ['regulatory_compliance', 'operational_excellence'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: '6.4',
    domain: 'Risk management',
    title: 'Risk communication and reporting',
    criteria:
      'AI risk information is communicated to relevant stakeholders with appropriate frequency and detail level.',
    guidance:
      'Assess risk reporting processes, stakeholder communication cadence, board-level risk visibility.',
    dimensions: ['operational_excellence', 'ai_transparency'],
    relevanceWeight: 0.7,
  },
  {
    clauseRef: '7.1',
    domain: 'Risk management',
    title: 'Monitoring and review of AI risks',
    criteria:
      'Continuous monitoring of AI risk landscape with periodic reviews to account for technology evolution and threat changes.',
    guidance:
      'Review monitoring mechanisms, review frequency, trigger-based reassessment processes.',
    dimensions: ['operational_excellence', 'security_risk'],
    relevanceWeight: 0.7,
  },
]
