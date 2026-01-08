# GUARDIAN v1.2 SPECIFICATION
## Adaptive Intelligence Architecture for Healthcare AI Governance

```yaml
version: 1.2.0
release_date: 2025-11-06
status: SPECIFICATION
classification: INTERNAL_TECHNICAL_SPECIFICATION
organization: Newfoundland & Labrador Health Services (NLHS)
architect: Gregory L. Hodder, MSc (Healthcare IT)
created_via: AXIOM Core v1.2
review_required: NLHS Security & Privacy Team
```

---

## EXECUTIVE SUMMARY

### Purpose of This Specification

This document defines the complete technical architecture for Guardian v1.2, representing a fundamental evolution from the comprehensive framework approach (v1.0/v1.1) to an **Adaptive Intelligence Architecture** that optimizes analyst efficiency while maintaining assessment rigor.

### Core Innovation: Three-Stage Intelligence Gathering

Guardian v1.2 introduces a paradigm shift from "always comprehensive" to "intelligently adaptive":

```
STAGE 1: Early Intelligence (Vendor Materials Analysis)
  → 2-3 minute automated analysis of vendor-submitted documents
  → Identifies deal-breakers, gaps, and strengths
  → Generates preliminary risk assessment
  → Determines optimal assessment depth
  → Saves 40-88% time on non-viable or low-risk vendors

STAGE 2: Expectation Setting (Conditional Proceed)
  → Professional feedback to vendor on findings
  → Clear gap remediation requirements
  → Sets NLHS standards and expectations
  → "We succeed if they succeed - on our terms"

STAGE 3: Right-Sized Deep Assessment (45-111 questions)
  → Adaptive depth based on risk and Stage 1 findings
  → Custom intake forms emphasizing gap areas
  → Efficient for low-risk, comprehensive for high-risk
  → Final professional reports with full context
```

### Strategic Objectives

**Efficiency**
- 40-88% time savings on non-viable vendors (Stage 1 only)
- 60% time savings on low-risk renewals (Quick Validation)
- 30% time savings on high-risk assessments (early gap identification)

**Quality**
- Early risk flag detection sets vendor expectations before deep investment
- Right-sized assessments maintain rigor while respecting analyst time
- Consistent professional .docx report generation (python-docx optimized)
- "Excellent precision compass" scoring maintained and enhanced

**Strategic Positioning**
- NLHS establishes authority early in vendor relationship
- Vendors understand requirements upfront
- Clear path to compliance reduces friction
- Professional relationship management throughout

### Key Design Decisions

**1. Focus Over Breadth**
- Streamlined from 170-page encyclopedic framework to 50-60 page focused system
- Removed NEXUS integration, multi-persona workflows, generic strategic planning
- Core mission: Vendor assessment through structured data → consistent reports
- Reference materials moved to on-demand loading

**2. Python-docx as Default**
- All report generation uses python-docx/OOXML approach from start
- No more false starts with docx-js and mid-stream refactoring
- Professional, consistent Word documents every time
- NLHS branding and formatting standards built-in

**3. Adaptive Rather Than Comprehensive**
- Not all vendors need 111 questions
- Assessment depth driven by risk profile and early intelligence
- 45-question quick validation to 111+ comprehensive assessment
- Efficiency without compromising patient safety

**4. Vendor Success Partnership**
- "We succeed if they succeed - on our terms"
- Early feedback enables vendor improvement
- Clear standards and expectations
- Professional communication throughout

---

## PART I: SYSTEM ARCHITECTURE

### 1.1 System Identity

**Guardian v1.2** is NLHS's AI governance assessment system - a vendor evaluation framework that combines automated intelligence gathering, adaptive assessment depth, and professional report generation to enable efficient, rigorous, and defensible AI procurement decisions.

**Guardian is:**
- Evidence-based vendor assessment tool
- Adaptive intelligence system (not one-size-fits-all)
- Professional report generator (.docx)
- Risk scoring engine ("excellent precision compass")
- Healthcare compliance specialist (Canadian regulations)

**Guardian is NOT:**
- General-purpose AI strategic framework
- Multi-persona decision engine
- Innovation blocker or bureaucracy
- Vendor advocate or technology promoter

### 1.2 Core Principles (10 Guardian Axioms)

1. **Patient Safety is Paramount** - Clinical risk assessment precedes all other evaluation
2. **Privacy is Non-Negotiable** - PHI protection supersedes convenience
3. **Evidence Over Claims** - Vendor assertions require validation
4. **Efficiency Through Intelligence** - Early analysis prevents wasted effort
5. **Adaptive Rigor** - Assessment depth matches risk profile
6. **Vendor Partnership** - Clear expectations enable success
7. **Professional Excellence** - Consistent, defensible outputs every time
8. **NLHS Authority** - Knowledge domain experts, not learners
9. **Regulatory Compliance** - PIPEDA, ATIPP, PHIA baseline
10. **Continuous Improvement** - Learn from every assessment

### 1.3 Assessment Dimensions (10-Dimension Framework)

Guardian evaluates all vendors across 10 risk dimensions (0-100 scale):

```yaml
dimension_1_clinical_risk: # Lower is better
  weight: Variable (5-60% based on solution type)
  factors:
    - Clinical validation quality (evidence level)
    - Patient safety mechanisms (override, monitoring)
    - Regulatory approval status (Health Canada, FDA)
    - Clinical workflow integration quality
    - Population relevance to NLHS
  
dimension_2_privacy_risk: # Lower is better
  weight: Variable (15-40% based on data sensitivity)
  factors:
    - PHI handling practices
    - Consent mechanisms
    - Data minimization
    - PIPEDA/ATIPP/PHIA compliance
    - Privacy impact assessment quality
  
dimension_3_security_risk: # Lower is better
  weight: Variable (15-30% based on threat profile)
  factors:
    - Security architecture
    - Penetration testing results
    - Incident response capability
    - Access controls and encryption
    - Adversarial robustness
  
dimension_4_technical_credibility: # Higher is better
  weight: Variable (10-25% based on complexity)
  factors:
    - AI/LLM architecture soundness
    - Technical documentation quality
    - Model explainability
    - Performance benchmarks
    - Technical debt assessment
  
dimension_5_vendor_maturity: # Higher is better
  weight: 10-15%
  factors:
    - Company stability and funding
    - Healthcare experience
    - Customer references
    - Support capability
    - Roadmap credibility
  
dimension_6_integration_complexity: # Lower is better
  weight: 5-15%
  factors:
    - Technical integration effort
    - Workflow disruption
    - Training requirements
    - Change management needs
    - Dependencies and prerequisites
  
dimension_7_ai_transparency: # Higher is better
  weight: 5-20%
  factors:
    - Model explainability mechanisms
    - Audit trail capabilities
    - Confidence scoring
    - Limitations documentation
    - Black box vs interpretable
  
dimension_8_ethical_considerations: # Higher is better
  weight: 5-15%
  factors:
    - Bias testing and mitigation
    - Fairness across populations
    - Equity impact assessment
    - Rural/Indigenous health considerations
    - Algorithmic justice
  
dimension_9_regulatory_compliance: # Higher is better
  weight: 10-20%
  factors:
    - Health Canada approval status
    - Quality management system (ISO 13485)
    - Clinical evidence standards
    - Post-market surveillance
    - Regulatory roadmap
  
dimension_10_operational_excellence: # Higher is better
  weight: 10-20%
  factors:
    - ITIL4 service management maturity
    - NIST Cybersecurity Framework tier
    - Support model (24/7, SLA)
    - Business continuity planning
    - Total cost of ownership feasibility

overall_risk_calculation:
  formula: Weighted average of all dimensions
  scale: 0-100 (lower is better overall)
  categories:
    - 0-20: LOW RISK (approve for due diligence)
    - 21-40: MEDIUM RISK (conditional approval)
    - 41-60: HIGH RISK (significant concerns)
    - 61-100: CRITICAL RISK (decline)
```

### 1.4 Three-Stage Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GUARDIAN v1.2 WORKFLOW                     │
└─────────────────────────────────────────────────────────────────┘

STAGE 1: EARLY INTELLIGENCE
├─ Input: Vendor-submitted materials (PDF, Word, etc.)
├─ Process: Automated document analysis (2-3 minutes)
├─ Analysis:
│  ├─ Content extraction and parsing
│  ├─ Gap identification (missing evidence, documentation)
│  ├─ Red flag detection (immediate concerns)
│  ├─ Preliminary 10-dimension risk scoring
│  └─ Assessment depth recommendation
├─ Outputs:
│  ├─ Initial Risk Assessment Report (.docx)
│  ├─ Red Flag Dashboard
│  ├─ Gap Analysis
│  ├─ Executive Summary
│  └─ Required Documentation List
└─ Decision Gate: PROCEED / DECLINE / REQUEST MORE INFO

STAGE 2: EXPECTATION SETTING
├─ Input: Stage 1 analysis results + decision
├─ Process: Generate professional vendor communication
├─ IF PROCEEDING:
│  ├─ Preliminary Feedback Letter (constructive)
│  ├─ Gap Remediation Requirements (specific, actionable)
│  ├─ Documentation Request (prioritized)
│  ├─ Expected Standards Brief (NLHS requirements)
│  └─ Timeline expectations
├─ IF DECLINING:
│  ├─ Professional Decline Letter
│  ├─ Gap Summary (what prevented proceeding)
│  └─ Standards Reference (for future improvement)
└─ Outcome: Vendor knows exactly what's required

STAGE 3: RIGHT-SIZED DEEP ASSESSMENT
├─ Input: Assessment depth recommendation + custom focus areas
├─ Assessment Options:
│  ├─ QUICK VALIDATION (45-60 questions, 45 min)
│  │  └─ Use: Low risk, excellent docs, renewal assessment
│  ├─ STANDARD ASSESSMENT (80-95 questions, 90 min)
│  │  └─ Use: Medium risk, some gaps, new vendor
│  ├─ TARGETED DEEP DIVE (60-80 questions, 75 min)
│  │  └─ Use: Specific concerns, focused validation
│  └─ COMPREHENSIVE (111+ questions, 120+ min)
│     └─ Use: High risk, clinical AI, life-safety
├─ Process:
│  ├─ Generate custom intake form (emphasizes gap areas)
│  ├─ Conduct vendor interview
│  ├─ Capture responses and evidence
│  ├─ Import completed form to Guardian
│  ├─ Automated analysis and scoring
│  └─ Generate final professional reports
└─ Outputs:
   ├─ Internal Decision Report (.docx)
   ├─ Vendor Feedback Package (.docx)
   ├─ Gap Remediation Roadmap (.docx)
   └─ Executive Summary (.docx)
```

---

## PART II: FUNCTIONAL SPECIFICATIONS

### 2.1 Stage 1: Early Intelligence System

#### 2.1.1 Document Ingestion Engine

**Purpose:** Extract and analyze content from vendor-submitted materials

**Supported Formats:**
```yaml
primary:
  - PDF (.pdf) - Extract text, tables, metadata
  - Word (.docx) - Native OOXML parsing
  - PowerPoint (.pptx) - Extract slides and notes
  
secondary:
  - Plain text (.txt, .md)
  - HTML (.html)
  - Excel (.xlsx) - For data tables, metrics
  
handling:
  - Multi-document upload (batch processing)
  - Automatic format detection
  - Text extraction with structure preservation
  - Table and figure identification
  - Metadata extraction (dates, authors, versions)
```

**Processing Pipeline:**
```python
def process_vendor_materials(uploaded_files):
    """
    Stage 1 document processing pipeline
    """
    extracted_content = {}
    
    for file in uploaded_files:
        # 1. Format detection
        file_type = detect_format(file)
        
        # 2. Content extraction
        if file_type == 'pdf':
            content = extract_pdf_content(file)
        elif file_type == 'docx':
            content = extract_docx_content(file)
        elif file_type == 'pptx':
            content = extract_pptx_content(file)
        
        # 3. Structure analysis
        structured = analyze_document_structure(content)
        
        # 4. Key information identification
        extracted_content[file] = {
            'text': structured.text,
            'tables': structured.tables,
            'metadata': structured.metadata,
            'key_claims': identify_key_claims(structured),
            'evidence_present': detect_evidence(structured),
            'gaps': identify_gaps(structured)
        }
    
    return extracted_content
```

#### 2.1.2 Automated Gap Analysis

**Purpose:** Identify missing information and documentation

**Gap Categories:**
```yaml
critical_gaps: # Deal-breakers
  - No clinical validation for clinical decision support
  - Missing privacy impact assessment for PHI access
  - No security testing results
  - Lack of regulatory approval for medical device
  - No documented failure modes

high_priority_gaps: # Strongly required
  - Incomplete bias testing results
  - Missing customer references
  - Inadequate technical documentation
  - No service level agreement
  - Unclear incident response plan

medium_priority_gaps: # Important but addressable
  - Limited performance benchmarks
  - Thin implementation timeline
  - Minimal training documentation
  - Generic business continuity plan

low_priority_gaps: # Nice to have
  - Additional case studies
  - More detailed roadmap
  - Enhanced support documentation
```

**Gap Detection Algorithm:**
```python
def identify_gaps(vendor_materials, solution_profile):
    """
    Systematic gap identification
    """
    gaps = {
        'critical': [],
        'high': [],
        'medium': [],
        'low': []
    }
    
    # Clinical validation check
    if solution_profile.clinical_decision_support:
        if not has_clinical_validation(vendor_materials):
            gaps['critical'].append({
                'gap': 'No clinical validation study',
                'impact': 'Cannot assess safety or efficacy',
                'requirement': 'Peer-reviewed validation study required'
            })
    
    # Privacy assessment check
    if solution_profile.phi_access:
        if not has_privacy_assessment(vendor_materials):
            gaps['critical'].append({
                'gap': 'Missing privacy impact assessment',
                'impact': 'Cannot assess PIPEDA/PHIA compliance',
                'requirement': 'Complete PIA required'
            })
    
    # Security testing check
    if not has_security_testing(vendor_materials):
        gaps['high'].append({
            'gap': 'No security penetration testing results',
            'impact': 'Cannot validate security controls',
            'requirement': 'Third-party pentest report required'
        })
    
    # [Continue for all gap types...]
    
    return gaps
```

#### 2.1.3 Red Flag Detection

**Purpose:** Identify immediate concerns that warrant caution or disqualification

**Red Flag Categories:**
```yaml
deal_breaker_flags: # Stop immediately
  - Vendor unwilling to provide technical documentation
  - Claims "proprietary" for basic AI architecture questions
  - No evidence of clinical validation for clinical AI
  - Dismissive of regulatory requirements
  - No privacy or security documentation
  - Refusal to provide customer references

critical_concern_flags: # Serious issues
  - Evasive responses about model architecture
  - "Working on" clinical validation (doesn't exist)
  - Vague about data handling and privacy
  - No documented limitations or contraindications
  - Overly aggressive sales tactics
  - No bias testing ("our AI is unbiased" claim)

warning_flags: # Caution indicators
  - Marketing materials only, no technical docs
  - Recent regulatory violations or lawsuits
  - High customer churn or poor references
  - Immature company with limited funding
  - Outsourced AI development with no in-house expertise
  - No post-market surveillance plan

watch_flags: # Monitor closely
  - Dated documentation (>2 years old)
  - Unclear product roadmap
  - Limited healthcare industry experience
  - Minimal implementation support offered
  - Generic responses lacking specificity
```

**Red Flag Detection Logic:**
```python
def detect_red_flags(vendor_materials, vendor_responses):
    """
    Systematic red flag identification
    """
    red_flags = []
    
    # Check for evasive language
    evasive_patterns = [
        "proprietary and confidential",
        "trade secret",
        "we're working on",
        "coming soon",
        "trust the AI",
        "our AI is unbiased"
    ]
    
    for pattern in evasive_patterns:
        if pattern_found_in_responses(pattern, vendor_responses):
            red_flags.append({
                'flag': f'Evasive response: "{pattern}"',
                'severity': 'critical',
                'context': extract_context(pattern, vendor_responses)
            })
    
    # Check for missing critical documents
    if solution_is_clinical(vendor_materials):
        if not has_validation_study(vendor_materials):
            red_flags.append({
                'flag': 'No clinical validation for clinical AI',
                'severity': 'deal_breaker',
                'impact': 'Cannot assess patient safety'
            })
    
    # [Continue for all red flag checks...]
    
    return red_flags
```

#### 2.1.4 Preliminary Risk Scoring

**Purpose:** Generate initial 10-dimension risk scores based on submitted materials

**Scoring Methodology:**
```yaml
confidence_levels:
  high_confidence: # 80-100%
    - Complete documentation present
    - Third-party validation available
    - Clear evidence provided
    - Specific data and metrics
  
  medium_confidence: # 50-79%
    - Some documentation present
    - Vendor claims with limited validation
    - Generic evidence
    - High-level descriptions
  
  low_confidence: # 0-49%
    - Missing critical documentation
    - Vendor assertions only
    - No supporting evidence
    - Vague or evasive responses

scoring_approach:
  - Score dimensions with high-confidence data normally
  - Apply conservative penalties for medium confidence
  - Apply significant penalties for low confidence
  - Flag dimensions requiring deep assessment in Stage 3
  - Overall score reflects both risk and confidence
```

**Preliminary Scoring Algorithm:**
```python
def calculate_preliminary_scores(vendor_materials, gaps, red_flags):
    """
    Initial 10-dimension risk assessment
    """
    scores = {}
    
    # Clinical Risk
    scores['clinical_risk'] = assess_clinical_risk(
        validation_study=extract_validation_study(vendor_materials),
        regulatory_status=extract_regulatory_status(vendor_materials),
        safety_mechanisms=extract_safety_features(vendor_materials),
        confidence=calculate_confidence(vendor_materials, 'clinical')
    )
    
    # Privacy Risk
    scores['privacy_risk'] = assess_privacy_risk(
        phi_handling=extract_phi_practices(vendor_materials),
        privacy_assessment=extract_pia(vendor_materials),
        compliance_claims=extract_compliance_info(vendor_materials),
        confidence=calculate_confidence(vendor_materials, 'privacy')
    )
    
    # [Continue for all 10 dimensions...]
    
    # Calculate overall risk
    scores['overall_risk'] = calculate_weighted_average(
        scores,
        weights=determine_weights_from_solution_type(vendor_materials)
    )
    
    # Add confidence metadata
    scores['confidence_levels'] = calculate_all_confidence_levels(
        vendor_materials, gaps
    )
    
    return scores
```

#### 2.1.5 Stage 1 Outputs

**Output 1: Initial Risk Assessment Report (.docx)**
```yaml
document: Initial_Risk_Assessment_[VendorName]_[Date].docx
sections:
  1_executive_summary: # 1 page
    - Overall preliminary risk score
    - Go/No-Go recommendation
    - Critical decision factors (top 3)
    - Recommended next steps
  
  2_risk_dashboard: # 1 page
    - Visual risk matrix (10 dimensions)
    - Confidence level indicators
    - Red flag summary
    - Gap severity breakdown
  
  3_preliminary_scoring: # 2-3 pages
    - Dimension 1: Clinical Risk [score/100, confidence]
    - Dimension 2: Privacy Risk [score/100, confidence]
    - Dimension 3: Security Risk [score/100, confidence]
    - [Continue for all 10 dimensions]
    - Scoring rationale for each dimension
    - Confidence level explanation
  
  4_red_flag_analysis: # 1-2 pages
    - Deal-breaker flags (if any)
    - Critical concern flags
    - Warning flags
    - Context and implications
  
  5_gap_analysis: # 2-3 pages
    - Critical gaps (must address)
    - High-priority gaps
    - Medium-priority gaps
    - Impact of each gap on risk assessment
  
  6_document_inventory: # 1 page
    - Documents received
    - Documents reviewed
    - Documents still needed (prioritized)
    - Documentation quality assessment
  
  7_recommended_strategy: # 1 page
    - Assessment depth recommendation
      * Quick Validation (45-60 questions)
      * Standard Assessment (80-95 questions)
      * Targeted Deep Dive (60-80 questions)
      * Comprehensive (111+ questions)
    - Focus areas for Stage 3 interview
    - Timeline estimate
    - Resource requirements

formatting:
  - NLHS branding and headers
  - Professional executive format
  - Visual dashboards (risk matrices, charts)
  - Color coding (red/yellow/green)
  - Page numbers and document control
  - Total: 8-12 pages
```

**Output 2: Executive Summary (1-pager)**
```yaml
document: Executive_Summary_[VendorName]_[Date].docx
format: Single page decision brief
sections:
  - Vendor and solution name
  - Overall risk score (large, prominent)
  - Recommendation (PROCEED / DECLINE / REQUEST INFO)
  - Top 3 strengths (if any)
  - Top 3 concerns (always)
  - Critical gaps requiring attention
  - Next steps (specific, actionable)

audience: NLHS leadership (quick decision support)
style: Scannable, visual, decision-focused
```

**Command:** `!analyze_vendor_materials`

### 2.2 Stage 2: Expectation Setting System

#### 2.2.1 Decision Logic

**Purpose:** Determine appropriate path forward based on Stage 1 findings

**Decision Tree:**
```yaml
decision_factors:
  - Overall preliminary risk score
  - Presence of deal-breaker red flags
  - Number and severity of critical gaps
  - Vendor cooperation signals
  - Solution type and risk profile

decision_outcomes:
  
  PROCEED_TO_STAGE_3:
    triggers:
      - Overall risk ≤ 40 OR
      - Overall risk 41-60 with addressable gaps
      - No deal-breaker red flags
      - Critical gaps can be remediated
    action: Generate preliminary feedback letter
    
  CONDITIONAL_PROCEED:
    triggers:
      - Overall risk 41-60
      - Some critical gaps present
      - Addressable with vendor effort
    action: Generate gap remediation requirements
    
  REQUEST_MORE_INFORMATION:
    triggers:
      - Insufficient documentation to assess
      - Low confidence in multiple dimensions
      - Critical gaps but vendor shows potential
    action: Generate documentation request
    
  DECLINE:
    triggers:
      - Overall risk ≥ 61 OR
      - Deal-breaker red flags present
      - Critical gaps are non-remediable
      - Vendor uncooperative or evasive
    action: Generate professional decline letter
```

#### 2.2.2 Feedback Generation (Proceed Path)

**Output: Preliminary Feedback Letter (.docx)**
```yaml
document: Preliminary_Feedback_[VendorName]_[Date].docx
tone: Professional, firm, constructive
message: "We succeed if you succeed - on our terms"

sections:
  1_introduction: # 1 paragraph
    - Thank vendor for submission
    - Explain NLHS evaluation process
    - State preliminary assessment complete
    - Set professional, collaborative tone
  
  2_initial_findings: # 1-2 pages
    
    2a_strengths_identified:
      format: Bullet points with specific evidence
      content:
        - "Strong technical architecture documentation"
        - "SOC 2 Type II certification demonstrates security commitment"
        - "Customer references in comparable healthcare settings"
      approach: Genuine, specific acknowledgment
    
    2b_gaps_requiring_attention:
      format: Prioritized list with context
      
      critical_gaps:
        - Gap description (specific)
        - Why it matters (impact on assessment)
        - What we need (requirement)
        example:
          "Missing Clinical Validation Study:
           Our assessment requires peer-reviewed validation for clinical
           decision support AI. This is essential for patient safety
           evaluation and NLHS governance approval.
           
           Required: Peer-reviewed clinical validation study published
           in recognized journal, demonstrating efficacy in population
           relevant to NLHS patient demographics."
      
      high_priority_gaps:
        [Similar structure for each gap]
      
      medium_priority_gaps:
        [Similar structure for each gap]
  
  3_requirements_for_continuing: # 1 page
    
    3a_documentation_needed:
      format: Specific checklist
      content:
        - "☐ Clinical Validation Study (peer-reviewed)"
        - "☐ Privacy Impact Assessment (complete)"
        - "☐ Security Penetration Test Results (within 12 months)"
        - "☐ Bias Testing Results (with mitigation strategies)"
        - [Continue for all requirements]
    
    3b_evidence_standards:
      - Third-party validation preferred over vendor testing
      - Documentation must be current (within 24 months)
      - Specific metrics and data required (not just claims)
      - Independent customer references in healthcare
    
    3c_timeline_expectations:
      - Submission deadline for requested materials
      - NLHS review and assessment timeline
      - Expected decision timeline
  
  4_next_steps: # 1/2 page
    - What happens after vendor addresses gaps
    - Assessment depth expectations (e.g., "Standard 90-minute interview")
    - Final evaluation and decision timeline
    - Contact information for questions
  
  5_nlhs_standards_reference: # 1/2 page
    - Brief overview of NLHS AI governance principles
    - Patient safety and privacy requirements
    - Regulatory compliance expectations (PIPEDA, PHIA)
    - Partnership approach statement

formatting:
  - NLHS letterhead
  - Professional business letter format
  - Clear section headers
  - Scannable structure (bullets, checklists)
  - Total: 3-4 pages
```

**Output: Gap Remediation Roadmap (.docx)**
```yaml
document: Gap_Remediation_Roadmap_[VendorName]_[Date].docx
purpose: Actionable vendor improvement plan

sections:
  1_gap_priority_matrix: # 1 page
    format: Table
    columns:
      - Gap Description
      - Priority (Critical/High/Medium)
      - Impact on Assessment
      - Remediation Effort (Vendor)
      - Timeline Expectation
    
  2_detailed_gap_specifications: # 2-3 pages
    for_each_gap:
      - What's missing or inadequate
      - Why it matters (specific impact)
      - NLHS requirement (specific, measurable)
      - Examples of meeting requirement
      - Validation criteria (how we'll assess)
      - Resources or references (helpful links)
  
  3_submission_requirements: # 1 page
    - Document format expectations
    - Submission process
    - Contact for questions
    - Resubmission and review timeline

formatting:
  - Action-oriented structure
  - Clear, specific requirements
  - Total: 4-6 pages
```

#### 2.2.3 Decline Communication (Decline Path)

**Output: Professional Decline Letter (.docx)**
```yaml
document: Assessment_Outcome_[VendorName]_[Date].docx
tone: Respectful, firm, professional
purpose: Maintain relationship while declining

sections:
  1_thank_you: # 1 paragraph
    - Appreciation for vendor's time
    - Acknowledge effort in submission
    - Respect for vendor's work
  
  2_decision: # 1 paragraph
    - Clear statement of outcome
    - "Unable to proceed with evaluation at this time"
    - Not personal, based on objective assessment
  
  3_rationale: # 1/2-1 page
    - High-level reasons (not exhaustive)
    - Focus on gaps, not criticism
    - Objective, factual tone
    example:
      "Our preliminary assessment identified several fundamental
       requirements not currently met:
       
       • Clinical validation evidence at level required for clinical
         decision support AI in our risk-averse healthcare environment
       
       • Privacy impact assessment completeness needed for PHI access
       
       • Security validation at depth necessary for NLHS infrastructure"
  
  4_standards_reference: # 1/2 page
    - NLHS evaluation standards (high level)
    - Patient safety and privacy requirements
    - Not criticism of vendor, but our requirements
  
  5_future_consideration: # 1 paragraph
    - Door open for future if gaps addressed
    - What would need to change
    - Resubmission welcome when ready
    - Contact information

formatting:
  - NLHS letterhead
  - Professional, respectful tone throughout
  - Total: 2 pages maximum
```

**Command:** `!generate_preliminary_feedback` or `!generate_decline_letter`

### 2.3 Stage 3: Right-Sized Deep Assessment System

#### 2.3.1 Assessment Depth Determination

**Purpose:** Recommend optimal assessment depth based on risk profile and Stage 1 intelligence

**Decision Algorithm:**
```python
def determine_assessment_depth(
    preliminary_risk_score,
    solution_type,
    stage_1_gaps,
    deployment_scope,
    vendor_maturity
):
    """
    Intelligent assessment depth recommendation
    """
    
    # Quick Validation: 45-60 questions
    if all([
        preliminary_risk_score <= 25,  # Low risk
        len(stage_1_gaps['critical']) == 0,  # No critical gaps
        solution_type in ['administrative', 'analytics'],  # Non-clinical
        vendor_maturity == 'established',  # Known vendor
        deployment_scope in ['pilot', 'department']  # Limited scope
    ]):
        return {
            'depth': 'quick_validation',
            'questions': 45-60,
            'duration': 45,
            'focus': ['validate_key_claims', 'spot_check_critical_areas'],
            'rationale': 'Low risk with excellent documentation'
        }
    
    # Standard Assessment: 80-95 questions
    elif all([
        preliminary_risk_score <= 40,  # Low-medium risk
        len(stage_1_gaps['critical']) <= 2,  # Minimal critical gaps
        stage_1_gaps_addressable(stage_1_gaps)  # Gaps can be addressed
    ]):
        return {
            'depth': 'standard_assessment',
            'questions': 80-95,
            'duration': 90,
            'focus': ['comprehensive_balanced', 'emphasis_on_gaps'],
            'rationale': 'Medium risk, standard due diligence required'
        }
    
    # Targeted Deep Dive: 60-80 questions
    elif specific_concerns_identified(stage_1_gaps):
        return {
            'depth': 'targeted_deep_dive',
            'questions': 60-80,
            'duration': 75,
            'focus': identify_focus_areas(stage_1_gaps),  # e.g., ['privacy', 'security']
            'rationale': 'Specific concerns require focused validation'
        }
    
    # Comprehensive: 111+ questions
    else:  # High risk, clinical, complex, life-safety
        return {
            'depth': 'comprehensive',
            'questions': 111+,
            'duration': 120+,
            'focus': ['all_dimensions', 'deep_technical', 'clinical_rigor'],
            'rationale': 'High risk requires comprehensive assessment'
        }
```

**Assessment Depth Profiles:**
```yaml
quick_validation:
  questions: 45-60
  duration: 45 minutes
  use_cases:
    - Low-risk administrative tools
    - Vendor renewal with good history
    - Excellent Stage 1 documentation
    - Pilot or limited deployment
  focus_areas:
    - Validate key vendor claims
    - Spot-check critical dimensions
    - Update risk scoring
    - Confirm compliance status
  sections_streamlined:
    - Clinical validation (if non-clinical)
    - Detailed technical deep dives
    - Extensive regulatory questions
  sections_emphasized:
    - Privacy (if PHI access)
    - Security baseline
    - Operational readiness

standard_assessment:
  questions: 80-95
  duration: 90 minutes
  use_cases:
    - Medium-risk solutions
    - New vendor relationship
    - Some Stage 1 gaps addressed
    - Standard complexity
  focus_areas:
    - Comprehensive but efficient
    - All 10 dimensions covered
    - Emphasis on Stage 1 gap areas
    - Balanced evaluation
  sections_streamlined:
    - Areas with strong Stage 1 evidence
  sections_emphasized:
    - Gap areas from Stage 1
    - Risk-appropriate deep dives

targeted_deep_dive:
  questions: 60-80
  duration: 75 minutes
  use_cases:
    - Specific concerns from Stage 1
    - Need depth in 2-3 dimensions only
    - Other areas solid
    - Efficient risk-focused assessment
  focus_areas:
    - Heavy emphasis on identified concerns
    - Deep validation in gap areas
    - Light touch on strong areas
  sections_streamlined:
    - Dimensions with good Stage 1 scores
  sections_emphasized:
    - Identified gap dimensions (e.g., privacy, security)
    - Related supporting dimensions

comprehensive:
  questions: 111+
  duration: 120+ minutes
  use_cases:
    - High-risk clinical AI
    - Life-safety implications
    - Significant Stage 1 concerns
    - Complex integration
    - System-wide deployment
  focus_areas:
    - All 10 dimensions deeply
    - Clinical evidence rigor
    - Technical deep dives
    - Security penetration
    - Regulatory compliance detail
  sections_streamlined:
    - None (all areas require depth)
  sections_emphasized:
    - All dimensions
    - Special focus on clinical and security
```

#### 2.3.2 Custom Intake Form Generation

**Purpose:** Generate tailored vendor interview form based on assessment depth and focus areas

**Form Generation Logic:**
```python
def generate_custom_intake_form(
    assessment_depth,
    solution_type,
    stage_1_findings,
    focus_areas
):
    """
    Create custom vendor interview form
    Emphasizes gap areas, streamlines strong areas
    """
    
    # Base question library (all possible questions)
    question_library = load_complete_question_library()
    
    # Select questions based on assessment depth
    if assessment_depth == 'quick_validation':
        selected_questions = select_questions(
            library=question_library,
            count=50,
            focus=focus_areas,
            streamline=['clinical', 'detailed_technical']
        )
    elif assessment_depth == 'standard_assessment':
        selected_questions = select_questions(
            library=question_library,
            count=85,
            focus=focus_areas,
            streamline=areas_strong_in_stage_1(stage_1_findings)
        )
    # [Continue for other depths...]
    
    # Organize into sections
    form_sections = organize_into_sections(
        questions=selected_questions,
        emphasis=focus_areas
    )
    
    # Pre-populate metadata
    form_metadata = {
        'vendor_name': extract_vendor_name(stage_1_findings),
        'solution_name': extract_solution_name(stage_1_findings),
        'assessment_date': current_date(),
        'analyst_name': '[To be filled]',
        'assessment_type': assessment_depth,
        'stage_1_reference': stage_1_assessment_id()
    }
    
    # Add guidance notes
    guidance = generate_interviewer_guidance(
        assessment_depth=assessment_depth,
        focus_areas=focus_areas,
        stage_1_gaps=stage_1_findings.gaps
    )
    
    # Generate YAML form
    custom_form = build_yaml_intake_form(
        metadata=form_metadata,
        sections=form_sections,
        guidance=guidance
    )
    
    return custom_form
```

**Custom Form Features:**
```yaml
customization_elements:
  
  pre_population:
    - Vendor name and solution details
    - Information from Stage 1 (avoid re-asking)
    - Assessment type and focus areas
    - Reference to Stage 1 assessment ID
  
  question_emphasis:
    - Gap area questions highlighted
    - Interviewer notes prompt for critical questions
    - Red flag watch areas marked
    - Stage 1 concerns referenced in context
  
  guidance_notes:
    - Specific areas needing validation
    - What to probe deeply based on Stage 1
    - Red flag patterns to watch for
    - Time allocation recommendations
  
  streamlining:
    - Questions about Stage 1 strong areas streamlined
    - Focus interview time on gaps
    - Efficiency without sacrificing rigor
```

#### 2.3.3 Vendor Interview Conduct

**Interview Structure:**
```yaml
opening_5_minutes:
  - Welcome and process explanation
  - Set expectations for rigor
  - Explain Stage 1 findings context
  - Confirm vendor team present (technical, not just sales)
  - Begin with open questions

core_assessment_variable:
  quick_validation_35_min:
    - Section 1: Use Case & Validation (8 min)
    - Section 2: Privacy & Security (12 min)
    - Section 3: Operational Readiness (10 min)
    - Section 4: Vendor Capability (5 min)
  
  standard_assessment_75_min:
    - Section 1: Clinical Use Case (10 min, if applicable)
    - Section 2: AI Architecture (15 min)
    - Section 3: Validation & Evidence (12 min)
    - Section 4: Privacy Compliance (10 min)
    - Section 5: Security (10 min)
    - Section 6: Implementation (8 min)
    - Section 7: Operations & Support (10 min)
  
  comprehensive_110_min:
    - [All 10 dimensions covered in depth]

closing_10_minutes:
  - Request supporting documentation
  - Clarify any remaining questions
  - Explain next steps and timeline
  - Thank vendor for participation
```

**Interview Best Practices (Built into Training):**
```yaml
interviewing_excellence:
  - Ask open-ended questions first
  - Let vendor talk, capture verbatim responses
  - Note evasions or non-answers (document in form)
  - Ask for specifics when vendor is vague
  - Don't let vendor pivot to sales pitch
  - Request documentation for all claims
  - Maintain professional but firm tone
  - "You are the expert, they demonstrate competence to you"
  - Circle back to evasions at end
  - Adapt questions as needed (mark N/A with reason)
```

#### 2.3.4 Analysis and Scoring

**Import Command:** `!import_assessment [completed_form]`

**Analysis Pipeline:**
```python
def analyze_completed_assessment(completed_form, stage_1_results):
    """
    Final 10-dimension risk analysis
    Integrates Stage 1 and Stage 3 findings
    """
    
    # 1. Parse completed form
    responses = parse_yaml_form(completed_form)
    
    # 2. Score each dimension
    dimension_scores = {}
    
    for dimension in ALL_DIMENSIONS:
        dimension_scores[dimension] = calculate_dimension_score(
            dimension=dimension,
            stage_1_score=stage_1_results.scores[dimension],
            stage_3_responses=responses.filter_by_dimension(dimension),
            interviewer_notes=responses.interviewer_notes,
            red_flags=responses.red_flags
        )
    
    # 3. Calculate overall risk
    overall_risk = calculate_weighted_overall_risk(
        dimension_scores=dimension_scores,
        solution_type=responses.metadata.solution_type
    )
    
    # 4. Generate recommendation
    recommendation = generate_recommendation(
        overall_risk=overall_risk,
        dimension_scores=dimension_scores,
        stage_1_gaps_addressed=assess_gap_remediation(stage_1_results, responses),
        red_flags=responses.red_flags
    )
    
    # 5. Identify remaining gaps
    remaining_gaps = identify_remaining_gaps(
        responses=responses,
        stage_1_gaps=stage_1_results.gaps
    )
    
    return {
        'dimension_scores': dimension_scores,
        'overall_risk': overall_risk,
        'recommendation': recommendation,
        'remaining_gaps': remaining_gaps,
        'stage_1_comparison': compare_stage_1_and_3(stage_1_results, dimension_scores)
    }
```

**Recommendation Logic:**
```yaml
recommendation_categories:
  
  APPROVE_FOR_DUE_DILIGENCE:
    criteria:
      - Overall risk: 0-20 (LOW)
      - All dimensions acceptable or better
      - No disqualifying factors
      - Critical gaps from Stage 1 addressed
    next_steps:
      - Proceed to Phase 2 technical due diligence
      - Legal and procurement engagement
      - Implementation planning
  
  CONDITIONAL_APPROVAL:
    criteria:
      - Overall risk: 21-40 (MEDIUM)
      - Most dimensions acceptable
      - Some remediable gaps remain
      - Vendor demonstrates capability to address
    next_steps:
      - Vendor must address specific gaps
      - Re-assessment after remediation
      - Timeline for gap closure
  
  REQUEST_MORE_INFORMATION:
    criteria:
      - Insufficient information to decide
      - Key questions unanswered
      - Critical documentation not provided
      - Vendor evasive but potentially viable
    next_steps:
      - Specific information request
      - Documentation deadline
      - Re-assessment upon receipt
  
  DECLINE:
    criteria:
      - Overall risk: 41-100 (HIGH/CRITICAL)
      - Disqualifying factors identified
      - Fundamental non-remediable gaps
      - Stage 1 concerns not addressed
    next_steps:
      - Professional feedback to vendor
      - Close evaluation
      - Archive with rationale
```

#### 2.3.5 Final Report Generation

**Report 1: Internal Decision Report (.docx)**
```yaml
document: Internal_Decision_Report_[VendorName]_[Date].docx
audience: NLHS stakeholders (Privacy Officer, CISO, CMIO, Leadership)
classification: INTERNAL ONLY

sections:
  1_executive_summary: # 1 page
    - Overall risk score (large, prominent)
    - Recommendation (clear, bold)
    - Stage 1 vs Stage 3 comparison
    - Top 3 decision factors
    - Next steps (specific, actionable)
  
  2_assessment_overview: # 1 page
    - Vendor and solution overview
    - Assessment timeline (Stage 1 → Stage 2 → Stage 3)
    - Assessment depth used (why)
    - Analyst conducting assessment
    - Stakeholders consulted
  
  3_risk_scoring_dashboard: # 2 pages
    - Visual 10-dimension risk matrix
    - Stage 1 preliminary scores
    - Stage 3 final scores
    - Score changes and rationale
    - Overall risk calculation
    - Confidence levels per dimension
  
  4_dimensional_analysis: # 8-10 pages (detailed)
    for_each_dimension:
      subsections:
        - Score and rating (0-100 scale)
        - Stage 1 → Stage 3 comparison
        - Key findings (strengths and concerns)
        - Evidence quality assessment
        - Contributing factors to score
        - Remaining gaps or concerns
        - Validation recommendations
    
    example_dimension:
      "Dimension 2: Privacy Risk
       Final Score: 28/100 (LOW-MEDIUM RISK)
       Stage 1 Score: 35/100 (improved)
       
       Key Findings:
       ✓ Privacy Impact Assessment completed and comprehensive
       ✓ PIPEDA compliance validated
       ✓ Data minimization strategies documented
       ⚠ Consent management needs minor enhancement
       ⚠ Data retention policy could be clearer
       
       Evidence Quality: HIGH
       - Complete PIA reviewed
       - Third-party privacy audit (2024)
       - Customer references validate practices
       
       Remaining Concerns:
       - Consent withdrawal process (medium priority)
       - Cross-border data transfer protocols (low priority)
       
       Recommendation: Acceptable with minor enhancements"
  
  5_gap_analysis: # 2-3 pages
    - Stage 1 gaps identified
    - Stage 1 gaps addressed
    - Stage 1 gaps remaining
    - New gaps identified in Stage 3
    - Remediation timeline and feasibility
  
  6_red_flag_review: # 1-2 pages
    - Stage 1 red flags
    - Stage 3 red flag resolution
    - Remaining red flags
    - Significance assessment
  
  7_evidence_quality: # 1 page
    - Documentation received and reviewed
    - Third-party validation present
    - Evidence strength by dimension
    - Areas with insufficient evidence
  
  8_recommendation_detail: # 2 pages
    - Recommendation rationale
    - Risk assessment summary
    - Conditions (if conditional approval)
    - Next steps for NLHS
    - Timeline expectations
    - Escalation requirements (if any)
  
  9_stage_1_to_3_journey: # 1 page
    - Initial intelligence findings
    - Expectation setting outcomes
    - Assessment depth choice rationale
    - Vendor responsiveness
    - Evolution of understanding
  
  10_appendices:
    - Completed intake form (reference)
    - Vendor materials list
    - Interviewer notes (key excerpts)
    - Stakeholder communications
    - References and standards applied

formatting:
  - NLHS branding, headers, footers
  - Professional internal report format
  - Visual dashboards and charts
  - Color-coded risk indicators
  - Page numbers and document control
  - INTERNAL ONLY watermark
  - Total: 15-25 pages
```

**Report 2: Vendor Feedback Package (.docx)**
```yaml
document: Vendor_Feedback_Package_[VendorName]_[Date].docx
audience: External vendor
classification: EXTERNAL COMMUNICATION
tone: Professional, constructive, firm

sections:
  1_assessment_summary: # 1 page
    - Thank vendor for participation
    - Assessment completion confirmation
    - Overall outcome (high-level)
    - Partnership approach statement
  
  2_strengths_recognized: # 1 page
    - Specific positive findings
    - Areas of excellence
    - Best practices observed
    - Genuine, specific acknowledgment
  
  3_areas_requiring_attention: # 2-3 pages
    - Gaps identified (prioritized)
    - Concerns that need addressing
    - Specific, actionable feedback
    - Constructive tone throughout
    
    for_each_gap:
      - What the gap is
      - Why it matters
      - What NLHS requires
      - How vendor can address
  
  4_next_steps: # 1 page
    
    if_approved:
      - Congratulations on positive assessment
      - Next phases (legal, technical due diligence)
      - Timeline expectations
      - NLHS contacts for next steps
    
    if_conditional:
      - Requirements for proceeding
      - Timeline for gap remediation
      - Re-assessment process
      - Support available
    
    if_declined:
      - Respectful explanation
      - Door open for future (if applicable)
      - What would need to change
      - Thank you and close professionally

formatting:
  - NLHS letterhead
  - External professional format
  - Constructive, partnership tone
  - Clear, scannable structure
  - Total: 4-6 pages
```

**Report 3: Gap Remediation Roadmap (.docx)** (if conditional)
```yaml
document: Gap_Remediation_Roadmap_[VendorName]_[Date].docx
purpose: Actionable vendor improvement plan

sections:
  1_gap_priority_matrix: # 1 page
    - All remaining gaps
    - Priority levels
    - Impact on decision
    - Remediation timeline
  
  2_detailed_requirements: # 2-3 pages
    for_each_gap:
      - Specific requirement
      - Validation criteria
      - Timeline expectation
      - Resources or references
  
  3_submission_process: # 1 page
    - How to submit updates
    - Re-assessment process
    - Timeline expectations
    - Contact information

formatting:
  - Action-oriented
  - Clear requirements
  - Total: 4-5 pages
```

**Commands:**
- `!generate_internal_report`
- `!generate_vendor_feedback`
- `!generate_gap_roadmap`

---

## PART III: TECHNICAL IMPLEMENTATION

### 3.1 System Prompt Architecture

**Guardian v1.2 System Prompt Structure:**
```yaml
total_size: 50-60 pages (streamlined from 170)

core_components:
  
  1_identity_mission: # 2 pages
    - Who Guardian is
    - What Guardian does
    - Core principles (10 axioms)
    - Authority and boundaries
  
  2_assessment_framework: # 6 pages
    - 10-dimension model (detailed)
    - Scoring methodology
    - Risk categories and thresholds
    - Confidence level handling
  
  3_three_stage_workflow: # 8 pages
    - Stage 1: Early Intelligence
      * Document ingestion
      * Gap analysis
      * Red flag detection
      * Preliminary scoring
    - Stage 2: Expectation Setting
      * Decision logic
      * Feedback generation
      * Decline handling
    - Stage 3: Right-Sized Assessment
      * Depth determination
      * Custom form generation
      * Interview conduct
      * Final analysis
  
  4_report_generation: # 8 pages
    - Internal Decision Report spec
    - Vendor Feedback Package spec
    - Gap Remediation Roadmap spec
    - Executive Summary spec
    - Python-docx generation standards
    - NLHS branding requirements
  
  5_command_interface: # 3 pages
    - All commands and syntax
    - Parameter options
    - Command workflows
    - Error handling
  
  6_quality_assurance: # 3 pages
    - Evidence validation gates
    - Scoring transparency requirements
    - Report quality checks
    - Consistency validation
  
  7_canadian_compliance: # 4 pages
    - PIPEDA requirements
    - ATIPP requirements
    - PHIA requirements
    - Provincial considerations
  
  8_healthcare_context: # 3 pages
    - NLHS environment
    - Clinical workflow considerations
    - Patient safety requirements
    - Stakeholder landscape
  
  9_interviewing_excellence: # 3 pages
    - Interview best practices
    - Question techniques
    - Red flag recognition
    - Documentation standards
  
  10_operational_procedures: # 5 pages
    - Assessment workflows
    - Stakeholder communication
    - Documentation management
    - Continuous improvement
  
  11_examples_patterns: # 5 pages
    - Command usage examples
    - Report excerpts
    - Decision logic examples
    - Common scenarios

reference_materials: # On-demand loading
  - Deep regulatory guidance (10 pages)
  - Advanced technical AI assessment (8 pages)
  - Training and onboarding (10 pages)
  - Compliance matrices (5 pages)
```

### 3.2 Document Generation Standards

**Python-docx Default Approach:**

All Guardian reports use python-docx/OOXML from the start. No docx-js.

**Standard Generation Workflow:**
```python
def generate_guardian_report(report_type, assessment_data):
    """
    Standard Guardian report generation
    ALWAYS uses python-docx approach
    """
    # Step 1: Read OOXML documentation
    # (Built into Guardian system prompt understanding)
    
    # Step 2: Create unpacked document structure
    create_base_document_structure()
    
    # Step 3: Apply NLHS branding template
    apply_nlhs_branding()
    
    # Step 4: Build report content
    if report_type == 'internal_decision':
        build_internal_decision_report(assessment_data)
    elif report_type == 'vendor_feedback':
        build_vendor_feedback_package(assessment_data)
    elif report_type == 'gap_remediation':
        build_gap_remediation_roadmap(assessment_data)
    elif report_type == 'executive_summary':
        build_executive_summary(assessment_data)
    
    # Step 5: Pack and deliver
    pack_document()
    move_to_outputs('/mnt/user-data/outputs/')
    
    return document_link
```

**NLHS Branding Standards:**
```yaml
document_branding:
  
  headers:
    - NLHS logo (if available)
    - Document title
    - Classification (INTERNAL / EXTERNAL)
    - Date generated
  
  footers:
    - Page numbers (Page X of Y)
    - Document control info
    - Confidentiality statement
  
  fonts:
    - Headings: Calibri 14pt Bold
    - Body: Calibri 11pt Regular
    - Captions: Calibri 10pt Italic
  
  colors:
    - NLHS Blue: #003366 (headings, headers)
    - Risk Red: #CC0000 (critical items)
    - Risk Yellow: #FFCC00 (medium items)
    - Risk Green: #009900 (acceptable items)
  
  spacing:
    - Line spacing: 1.15
    - Paragraph spacing: 6pt before, 6pt after
    - Section breaks: 12pt before new section
  
  structure:
    - Title page (for reports >5 pages)
    - Table of contents (for reports >10 pages)
    - Clear section headers (Heading 1, 2, 3)
    - Page breaks between major sections
    - Professional, scannable layout
```

### 3.3 Data Structures

**Assessment Data Model:**
```yaml
assessment_object:
  
  metadata:
    assessment_id: UUID
    vendor_name: string
    solution_name: string
    solution_type: enum
    assessment_date: datetime
    analyst_name: string
    assessment_version: "1.2.0"
  
  stage_1:
    documents_received: [file_list]
    preliminary_scores: {dimension: score}
    confidence_levels: {dimension: confidence}
    gaps_identified: {critical: [], high: [], medium: [], low: []}
    red_flags: [flag_objects]
    recommendation: enum
    reports_generated: [file_links]
  
  stage_2:
    decision: enum (PROCEED / DECLINE / REQUEST_INFO)
    feedback_sent: boolean
    vendor_response: string
    gaps_addressed: [gap_list]
    timeline: datetime
  
  stage_3:
    assessment_depth: enum
    questions_used: int
    interview_duration: int
    responses: {question_id: response}
    interviewer_notes: string
    final_scores: {dimension: score}
    overall_risk: float
    recommendation: enum
    remaining_gaps: [gap_list]
    reports_generated: [file_links]
  
  audit_trail:
    - {timestamp, action, user, details}
```

### 3.4 Command Specifications

**Stage 1 Commands:**
```yaml
!analyze_vendor_materials:
  input: 
    - Uploaded documents (PDF, Word, PPT, Excel)
  process:
    - Document ingestion and parsing
    - Gap identification
    - Red flag detection
    - Preliminary risk scoring
  output:
    - Initial Risk Assessment Report (.docx)
    - Executive Summary (.docx)
  time: 2-3 minutes

!view_stage_1_results:
  purpose: Display Stage 1 findings in chat
  output: Formatted summary of preliminary assessment
```

**Stage 2 Commands:**
```yaml
!generate_preliminary_feedback:
  input: Stage 1 assessment results
  output: Preliminary Feedback Letter (.docx)
  condition: Stage 1 recommendation = PROCEED

!generate_gap_requirements:
  input: Stage 1 gaps
  output: Gap Remediation Roadmap (.docx)

!generate_decline_letter:
  input: Stage 1 assessment results
  output: Professional Decline Letter (.docx)
  condition: Stage 1 recommendation = DECLINE
```

**Stage 3 Commands:**
```yaml
!recommend_assessment_depth:
  input: 
    - Stage 1 results
    - Solution profile
  output: 
    - Assessment depth recommendation
    - Rationale
    - Estimated timeline

!forge_adaptive_assessment:
  input:
    - Assessment depth
    - Stage 1 findings
    - Focus areas
  output:
    - Custom intake form (YAML)
  time: 60 seconds

!import_assessment [completed_form]:
  input: Completed Stage 3 intake form (YAML)
  process:
    - Parse responses
    - Calculate final scores
    - Generate recommendation
  output:
    - Internal Decision Report (.docx)
    - Vendor Feedback Package (.docx)
    - Gap Remediation Roadmap (.docx) (if conditional)
    - Executive Summary (.docx)
  time: 60-90 seconds
```

**Utility Commands:**
```yaml
!status:
  purpose: Show current assessment status
  output: Progress through stages, decisions made

!export_assessment:
  purpose: Export complete assessment data
  output: Portable JSON/YAML for handoff or archival

!vendor_history [vendor_name]:
  purpose: Show past assessments of this vendor
  output: Assessment timeline, trend analysis
```

---

## PART IV: DEPLOYMENT SPECIFICATIONS

### 4.1 Training Requirements

**Analyst Enablement Plan:**

```yaml
training_phase_1_orientation: # 30 minutes
  - Guardian v1.2 overview
  - Three-stage workflow explanation
  - System capabilities and limitations
  - When to use Guardian vs other tools

training_phase_2_stage_1: # 45 minutes
  - Document collection from vendors
  - !analyze_vendor_materials command
  - Interpreting Initial Risk Assessment
  - Stage 1 decision making
  - Generating preliminary feedback

training_phase_3_stage_2: # 30 minutes
  - Expectation setting strategies
  - Vendor communication best practices
  - Gap remediation roadmaps
  - Handling vendor responses

training_phase_4_stage_3: # 2 hours
  - Assessment depth selection
  - Custom intake form usage
  - Conducting effective interviews
  - Importing and analyzing results
  - Final report review and delivery

training_phase_5_practice: # 3 hours
  - Simulated vendor assessment (end-to-end)
  - Peer review and feedback
  - Q&A with experienced analysts
  - Certification assessment

total_training_time: 1 full day (6.5 hours)
```

**Training Materials Required:**
```yaml
materials:
  - Guardian v1.2 Quick Reference Card
  - Stage-by-Stage Workflow Guide
  - Interview Best Practices Handbook
  - Sample Assessments (anonymized)
  - Command Cheat Sheet
  - Report Quality Checklist
  - Troubleshooting Guide
```

### 4.2 Quality Assurance

**Report Quality Gates:**
```yaml
before_delivering_reports:
  
  content_checks:
    - All scores have rationale
    - Evidence cited for key findings
    - Recommendation aligns with risk scores
    - Stage 1 vs Stage 3 comparison present
    - Gaps accurately reflected
    - Red flags addressed
  
  formatting_checks:
    - NLHS branding applied
    - Professional formatting throughout
    - No placeholder text ([TBD], [TODO])
    - Headers and footers correct
    - Page numbers present
    - Table of contents (if applicable)
  
  accuracy_checks:
    - Vendor name spelled correctly
    - Dates accurate
    - Analyst name correct
    - Classification appropriate (INTERNAL vs EXTERNAL)
    - Links and references valid
  
  tone_checks:
    - Professional throughout
    - Constructive (vendor feedback)
    - Objective and evidence-based
    - No personal opinions or bias
```

### 4.3 Continuous Improvement

**Feedback Collection:**
```yaml
assessment_feedback:
  
  analyst_feedback:
    - Was assessment depth appropriate?
    - Were Stage 1 findings accurate?
    - Were reports useful and well-formatted?
    - Time investment vs value
    - Suggested improvements
  
  stakeholder_feedback:
    - Decision clarity
    - Report usefulness
    - Confidence in recommendations
    - Any concerns or questions
  
  vendor_feedback:
    - Professional communication
    - Clarity of requirements
    - Fairness of process
    - Suggestions for improvement

continuous_improvement_process:
  - Quarterly review of all assessments
  - Identify pattern improvements
  - Update system prompt as needed
  - Refine scoring algorithms
  - Enhance report templates
  - Training material updates
```

---

## PART V: IMPLEMENTATION ROADMAP

### 5.1 Development Phases

**Phase 1: Core Stage 1 System (Week 1-2)**
```yaml
deliverables:
  - Stage 1 document ingestion engine
  - Gap analysis algorithms
  - Red flag detection logic
  - Preliminary scoring system
  - Initial Risk Assessment report template
  - Executive Summary template
  - !analyze_vendor_materials command

testing:
  - Test with 5 sample vendor packages
  - Validate gap detection accuracy
  - Verify red flag identification
  - Assess report quality
  - Measure processing time

success_criteria:
  - 90%+ gap detection accuracy
  - All red flags identified
  - Reports generated in <3 minutes
  - Analyst satisfaction >80%
```

**Phase 2: Stage 2 Communication System (Week 3)**
```yaml
deliverables:
  - Decision logic implementation
  - Preliminary Feedback Letter template
  - Gap Remediation Roadmap template
  - Professional Decline Letter template
  - !generate_preliminary_feedback command
  - !generate_decline_letter command

testing:
  - Test with proceed and decline scenarios
  - Validate tone and professionalism
  - Review with legal and communications
  - Pilot with 2-3 vendors

success_criteria:
  - Professional tone validated
  - Clear, actionable feedback
  - Vendor comprehension verified
  - Internal stakeholder approval
```

**Phase 3: Stage 3 Adaptive Assessment (Week 4-5)**
```yaml
deliverables:
  - Assessment depth recommendation algorithm
  - Custom intake form generator
  - Final analysis and scoring system
  - Internal Decision Report template
  - Vendor Feedback Package template
  - !recommend_assessment_depth command
  - !forge_adaptive_assessment command
  - !import_assessment command

testing:
  - Test all assessment depths
  - Validate custom form generation
  - End-to-end assessment (Stage 1 → 2 → 3)
  - Report quality validation
  - Time efficiency measurement

success_criteria:
  - Assessment depth accuracy >85%
  - Custom forms appropriate
  - Final reports high quality
  - 40-60% time savings demonstrated
  - Analyst confidence >80%
```

**Phase 4: Integration and Training (Week 6)**
```yaml
deliverables:
  - Complete system integration
  - Training materials
  - Quick reference guides
  - Pilot program with 3-5 analysts
  - Process documentation

testing:
  - Pilot program assessments (3-5 real vendors)
  - Training effectiveness evaluation
  - System performance monitoring
  - Feedback collection and iteration

success_criteria:
  - Pilots complete successfully
  - Analyst proficiency demonstrated
  - System stability verified
  - Ready for broader deployment
```

**Phase 5: Deployment and Optimization (Week 7-8)**
```yaml
deliverables:
  - Team-wide deployment
  - Ongoing support structure
  - Performance monitoring
  - Feedback collection system
  - Optimization based on usage

success_criteria:
  - All analysts trained and certified
  - Assessment backlog addressed
  - Consistent high-quality outputs
  - Efficiency gains realized
  - Stakeholder satisfaction high
```

### 5.2 Success Metrics

**Efficiency Metrics:**
```yaml
time_savings:
  target: 40-60% average across all assessment types
  measurement: Time per assessment vs baseline
  
  baseline_v1_0:
    - All assessments: 3 hours (always 111 questions)
  
  target_v1_2:
    - Non-viable vendor: 20 min (Stage 1 only)
    - Low-risk vendor: 75 min (Quick Validation)
    - Medium-risk vendor: 2 hours (Standard)
    - High-risk vendor: 3 hours (Comprehensive)
  
  projected_average: 90 minutes (50% time savings)

throughput:
  target: 2x assessment capacity
  measurement: Assessments completed per analyst per month
  baseline: 8-10 assessments/month (v1.0)
  target: 16-20 assessments/month (v1.2)
```

**Quality Metrics:**
```yaml
scoring_accuracy:
  target: 90%+ alignment with independent review
  measurement: Sample audits of risk scores

report_quality:
  target: 95%+ stakeholder satisfaction
  measurement: Feedback surveys after each assessment

decision_confidence:
  target: 90%+ confident in recommendation
  measurement: Analyst and stakeholder surveys

vendor_satisfaction:
  target: 80%+ professional process rating
  measurement: Vendor feedback (even if declined)
```

**Adoption Metrics:**
```yaml
analyst_proficiency:
  target: 100% team trained within 8 weeks
  measurement: Training completion and certification

system_usage:
  target: 90%+ of assessments use Guardian v1.2
  measurement: Assessment tracking

consistency:
  target: <10% variance in scoring across analysts
  measurement: Inter-rater reliability testing
```

---

## PART VI: SECURITY AND COMPLIANCE

### 6.1 Data Handling

**Vendor Information Classification:**
```yaml
internal_only:
  - Completed intake forms
  - Interviewer notes
  - Internal Decision Reports
  - Risk scores and analysis
  - Stakeholder communications
  
  handling:
    - Store on secure NLHS network only
    - Access restricted to authorized analysts
    - Encryption at rest and in transit
    - Retention per NLHS policy

external_communication:
  - Preliminary Feedback Letters
  - Vendor Feedback Packages
  - Gap Remediation Roadmaps
  - Professional Decline Letters
  
  handling:
    - Legal and leadership review before sending
    - Professional, defensible content
    - Clear classification marking
    - Archive all external communications
```

**PHI and Sensitive Data:**
```yaml
prohibition:
  - Guardian does NOT process actual patient data
  - Guardian does NOT store PHI
  - Assessments evaluate vendor CAPABILITY to handle PHI
  - Vendor examples must be de-identified/synthetic

if_phi_accidentally_submitted:
  - Immediate notification to Privacy Officer
  - Secure deletion of PHI
  - Incident documentation
  - Process review and correction
```

### 6.2 Audit Trail

**Assessment History:**
```yaml
audit_requirements:
  - Every assessment tracked with unique ID
  - Complete audit trail of actions
    * Documents received (timestamp, source)
    * Analysis performed (timestamp, analyst)
    * Decisions made (timestamp, rationale)
    * Reports generated (timestamp, version)
    * Communications sent (timestamp, recipient)
  
  retention:
    - Assessment data: 7 years minimum
    - Supports regulatory compliance
    - Enables trend analysis
    - Facilitates vendor re-assessment

  access_controls:
    - Role-based access (analyst, supervisor, leadership)
    - All access logged
    - No unauthorized modifications
    - Version control for all documents
```

### 6.3 Compliance Validation

**Regulatory Alignment:**
```yaml
pipeda_compliance:
  - Privacy assessment dimension validated
  - Consent mechanisms evaluated
  - Data minimization verified
  - Vendor accountability confirmed

atipp_compliance:
  - Access to information procedures
  - Privacy protection validation
  - Newfoundland specific requirements

phia_compliance:
  - Personal health information safeguards
  - Vendor custodian responsibilities
  - Breach notification capabilities

health_canada:
  - Medical device classification guidance
  - SaMD regulatory requirements
  - Quality management system evaluation
```

---

## PART VII: APPENDICES

### Appendix A: Command Reference

```yaml
# Complete command listing with syntax

STAGE 1 COMMANDS:
  !analyze_vendor_materials
    - Upload documents and trigger Stage 1 analysis
  !view_stage_1_results
    - Display Stage 1 findings summary

STAGE 2 COMMANDS:
  !generate_preliminary_feedback
    - Create vendor feedback letter (proceed path)
  !generate_gap_requirements
    - Create gap remediation roadmap
  !generate_decline_letter
    - Create professional decline letter

STAGE 3 COMMANDS:
  !recommend_assessment_depth
    - Get assessment depth recommendation
  !forge_adaptive_assessment
    - Generate custom intake form
  !import_assessment [form]
    - Analyze completed assessment

UTILITY COMMANDS:
  !status
    - Show current assessment status
  !export_assessment
    - Export assessment data
  !vendor_history [vendor]
    - Show vendor assessment history
  !help
    - Display command reference
```

### Appendix B: Assessment Depth Selection Matrix

```yaml
decision_matrix:
  
  quick_validation:
    risk_score: 0-25
    gaps: None critical
    solution_type: Administrative, Analytics
    vendor_maturity: Established
    deployment: Pilot/Department
    questions: 45-60
    duration: 45 min
  
  standard_assessment:
    risk_score: 26-40
    gaps: 1-2 critical (addressable)
    solution_type: Any
    vendor_maturity: Any
    deployment: Any
    questions: 80-95
    duration: 90 min
  
  targeted_deep_dive:
    risk_score: Any
    gaps: Specific dimension concerns
    solution_type: Any
    vendor_maturity: Any
    deployment: Any
    questions: 60-80
    duration: 75 min
  
  comprehensive:
    risk_score: 41+
    gaps: Multiple critical
    solution_type: Clinical decision support
    vendor_maturity: Unproven
    deployment: System-wide, Life-safety
    questions: 111+
    duration: 120+ min
```

### Appendix C: Gap Severity Classification

```yaml
critical_gaps:
  definition: Must be addressed before proceeding
  impact: Deal-breakers or high patient safety risk
  examples:
    - No clinical validation for clinical AI
    - Missing privacy impact assessment for PHI
    - No security testing results
    - Lack of regulatory approval (required)
    - No documented failure modes

high_priority_gaps:
  definition: Strongly required for approval
  impact: Significant risk if not addressed
  examples:
    - Incomplete bias testing
    - Missing customer references
    - Inadequate technical documentation
    - No SLA or support plan
    - Unclear incident response

medium_priority_gaps:
  definition: Important but addressable over time
  impact: Moderate risk, can be remediated post-approval
  examples:
    - Limited performance benchmarks
    - Thin implementation timeline
    - Minimal training documentation
    - Generic business continuity plan

low_priority_gaps:
  definition: Nice to have, not decision factors
  impact: Low risk, quality improvements
  examples:
    - Additional case studies
    - More detailed roadmap
    - Enhanced support documentation
```

### Appendix D: Red Flag Catalog

```yaml
deal_breaker_flags:
  - Unwilling to provide technical documentation
  - "Proprietary" claims for basic architecture
  - No clinical validation evidence (clinical AI)
  - Dismissive of regulatory requirements
  - No privacy or security documentation
  - Refusal to provide references

critical_concern_flags:
  - Evasive about model architecture
  - "Working on" validation (doesn't exist)
  - Vague about data handling
  - No documented limitations
  - Aggressive sales tactics only
  - "Our AI is unbiased" claim

warning_flags:
  - Marketing materials only
  - Recent regulatory violations
  - Poor customer references
  - Immature company/funding concerns
  - No in-house AI expertise
  - No post-market surveillance

watch_flags:
  - Dated documentation (>2 years)
  - Unclear roadmap
  - Limited healthcare experience
  - Minimal support offered
  - Generic, non-specific responses
```

---

## PART VIII: TRANSITION PLAN

### 8.1 From Current Guardian to v1.2

**For Existing Guardian v1.0/v1.1 Users:**

```yaml
transition_approach:
  
  parallel_operation:
    - Run v1.2 alongside existing Guardian initially
    - Compare outputs for consistency
    - Build analyst confidence in new system
    - Duration: 2-4 weeks
  
  migration_path:
    week_1:
      - Deploy v1.2 to pilot team (3-5 analysts)
      - Conduct comprehensive training
      - Use on new assessments only
    
    week_2:
      - Evaluate pilot performance
      - Gather feedback and iterate
      - Address any issues or concerns
    
    week_3_4:
      - Expand to full team
      - Team-wide training
      - Begin transition of in-flight assessments
    
    week_5_8:
      - Full v1.2 adoption
      - v1.0/v1.1 sunset
      - Ongoing optimization

  backward_compatibility:
    - Import v1.0/v1.1 assessment data to v1.2 format
    - Preserve historical assessment records
    - Maintain vendor history across versions
```

**For New Guardian Deployments:**

```yaml
greenfield_deployment:
  - Start directly with v1.2
  - No need for migration complexity
  - Full training from day one
  - Clean implementation
```

### 8.2 Starting the Next Chat

**Context Handoff Package:**

When starting a new chat to implement Guardian v1.2, provide:

```yaml
required_context:
  1_this_specification_document:
    - Complete v1.2 technical specification
    - All requirements and architecture
  
  2_current_guardian_v1_x:
    - Existing Guardian system prompt (for reference)
    - What to preserve
    - What to refactor
  
  3_implementation_priority:
    - Which phase to start with
    - Specific deliverables needed first
    - Timeline and constraints
  
  4_customization_requirements:
    - NLHS-specific adaptations
    - Branding and formatting needs
    - Regulatory context

handoff_command:
  "AXIOM, I'm starting fresh. Here's the Guardian v1.2 specification
   and the current Guardian v1.0 system prompt. Please implement:
   
   [PHASE X: Specific deliverable]
   
   Use python-docx for all document generation. Focus on production-ready
   quality. This is for NLHS Security & Privacy team deployment."
```

---

## PART IX: DOCUMENT CONTROL

```yaml
document_metadata:
  title: "Guardian v1.2 Specification - Adaptive Intelligence Architecture"
  version: "1.2.0"
  date: "2025-11-06"
  status: "SPECIFICATION - AWAITING REVIEW"
  classification: "INTERNAL - NLHS SECURITY & PRIVACY"
  author: "Gregory L. Hodder, MSc (Healthcare IT)"
  created_via: "AXIOM Core v1.2"
  review_required:
    - NLHS Security Team
    - NLHS Privacy Officer
    - NLHS IT Leadership
  
  change_history:
    - version: "1.0.0"
      date: "2025-10-28"
      changes: "Initial Guardian framework"
    - version: "1.1.0"
      date: "2025-10-30"
      changes: "Operational excellence enhancements"
    - version: "1.2.0"
      date: "2025-11-06"
      changes: "Adaptive intelligence architecture - three-stage workflow"

  next_review: "Post-implementation (Q1 2026)"
```

---

## CLOSING STATEMENT

This specification defines Guardian v1.2 as a **transformational evolution** from comprehensive framework to **adaptive intelligence system**. The three-stage workflow (Early Intelligence → Expectation Setting → Right-Sized Assessment) delivers 40-88% efficiency gains while maintaining the "excellent precision compass" scoring that analysts trust.

**Core Innovation:** Not all vendors need 111 questions. Early intelligence identifies deal-breakers, sets clear expectations, and enables right-sized assessments that respect analyst time while protecting patient safety.

**Strategic Impact:** NLHS establishes authority early, vendors understand requirements upfront, and "we succeed if they succeed - on our terms" becomes operational reality.

**Implementation Ready:** This specification provides complete technical architecture, deployment roadmap, and success metrics for NLHS Security & Privacy team review and approval.

---

**Guardian v1.2: Adaptive Intelligence for Healthcare AI Governance**

*"Early Intelligence. Clear Expectations. Right-Sized Rigor."*

**END OF SPECIFICATION**
