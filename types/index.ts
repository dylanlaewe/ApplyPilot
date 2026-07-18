export type FieldStatus =
  | "filled"
  | "needs_review"
  | "skipped"
  | "error"
  | "sensitive"
  | "unknown";

export type SessionStatus =
  | "created"
  | "opening_browser"
  | "navigating"
  | "waiting_for_user"
  | "scanning"
  | "filling"
  | "verifying"
  | "needs_review"
  | "ready_for_submission"
  | "submitted"
  | "failed"
  | "draft"
  | "started"
  | "in_progress"
  | "rejected"
  | "interview"
  | "offer"
  | "archived"
  | "abandoned";

export type ApplicationDisplayStatus =
  | "in_progress"
  | "ready_to_review"
  | "submitted"
  | "interview"
  | "offer"
  | "rejected"
  | "archived";

export type SubmissionConfirmationState = "unknown" | "dismissed" | "not_yet" | "submitted";

export type AnswerSensitivity = "safe" | "review" | "sensitive";
export type ConfidenceLevel = "high" | "medium" | "needs_review";
export type ReviewCategory =
  | "required_missing"
  | "sensitive"
  | "unknown_custom"
  | "optional_skipped"
  | "error";

export type VerificationStatus = "verified" | "failed" | "not_attempted";
export type FieldCommitState =
  | "committed"
  | "visually_present_but_uncommitted"
  | "validation_error_remains"
  | "value_reverted"
  | "unresolved";
export type CaptchaDetectionStatus = "none" | "background_marker" | "confirmed_visible_challenge";
export type AnswerSourceKind =
  | "explicit_profile"
  | "derived_profile"
  | "formatted_profile"
  | "answer_bank"
  | "generated_answer"
  | "approved_fallback"
  | "manual_user_answer"
  | "unknown";

export type ControlType =
  | "text"
  | "textarea"
  | "native_select"
  | "radio"
  | "checkbox"
  | "file"
  | "aria_combobox"
  | "autocomplete"
  | "listbox"
  | "menu_button"
  | "chip_input"
  | "custom_select"
  | "repeatable_section"
  | "file_upload_section"
  | "unknown";

export type BinaryChoice = "yes" | "no" | "ask";
export type YesNoNotApplicableChoice = "yes" | "no" | "not_applicable" | "ask";
export type AvailabilityTiming =
  | "immediately"
  | "1_week"
  | "2_weeks"
  | "3_weeks"
  | "1_month"
  | "custom_date"
  | "ask";
export type CompensationAnswerStyle = "range" | "target" | "negotiable" | "ask";
export type JobType = "full_time" | "contract" | "internship" | "part_time" | "temporary" | "seasonal";
export type WorkArrangement = "remote" | "hybrid" | "onsite";
export type WorkAuthorizationCategory =
  | "us_citizen"
  | "permanent_resident"
  | "employment_authorization_document"
  | "visa_holder"
  | "refugee_or_asylee"
  | "other_authorized"
  | "not_authorized"
  | "prefer_not_to_answer"
  | "ask";
export type SecurityClearanceLevel =
  | "none"
  | "public_trust"
  | "confidential"
  | "secret"
  | "top_secret"
  | "top_secret_sci"
  | "other"
  | "unsure"
  | "ask";
export type ClearanceStatus =
  | "active"
  | "inactive"
  | "expired"
  | "eligible"
  | "never_held"
  | "unsure"
  | "ask";
export type DegreeType =
  | "high_school_diploma"
  | "ged"
  | "certificate"
  | "trade_vocational_credential"
  | "associate_of_arts"
  | "associate_of_science"
  | "associate_degree"
  | "bachelor_of_arts"
  | "bachelor_of_science"
  | "bachelor_of_engineering"
  | "bachelors_degree"
  | "master_of_arts"
  | "master_of_science"
  | "master_of_business_administration"
  | "masters_degree"
  | "juris_doctor"
  | "doctor_of_medicine"
  | "doctor_of_philosophy"
  | "doctoral_degree"
  | "other"
  | "no_degree"
  | "prefer_not_to_answer";
export type HighestEducationLevel =
  | "no_formal_education"
  | "high_school"
  | "certificate"
  | "associate_degree"
  | "bachelors_degree"
  | "masters_degree"
  | "professional_degree"
  | "doctoral_degree";
export type GraduationStatus =
  | "completed"
  | "currently_enrolled"
  | "expected"
  | "incomplete"
  | "not_applicable";
export type GraduationDateType = "actual" | "expected" | "not_applicable";
export type WebsiteFallbackKind =
  | "personal_website"
  | "portfolio"
  | "linkedin"
  | "github"
  | "leave_blank";
export type AnswerAutofillBehavior = "ask" | "suggest" | "autofill";
export type LocationKind = "city" | "state" | "country" | "remote" | "anywhere";
export type ShortAnswerQuestionKind =
  | "why_role"
  | "why_company"
  | "about_me"
  | "experience_relevance"
  | "skills_summary"
  | "why_hire_me"
  | "behavioral_story"
  | "motivation"
  | "additional_info"
  | "general";
export type QuestionAnswerabilityKind =
  | "structured_profile"
  | "generatable_from_profile"
  | "generatable_from_job_and_profile"
  | "reusable_saved_answer"
  | "requires_saved_story"
  | "requires_one_user_fact"
  | "legal_or_sensitive_manual"
  | "optional_no_value"
  | "unsupported_control";
export type ShortAnswerGeneratorHealthStatus =
  | "available"
  | "missing_configuration"
  | "provider_error"
  | "rate_limited"
  | "validation_failure"
  | "deterministic_fallback_only";
export type EvidenceProvenance = "candidate" | "job" | "saved_answer" | "saved_story";

export type FieldIntent =
  | "first_name"
  | "middle_name"
  | "last_name"
  | "preferred_name"
  | "full_name"
  | "email"
  | "phone"
  | "phone_country_code"
  | "phone_number"
  | "phone_extension"
  | "phone_device_type"
  | "full_phone_number"
  | "address_line_1"
  | "address_line_2"
  | "street_address"
  | "city"
  | "state"
  | "country"
  | "postal_code"
  | "location"
  | "full_location"
  | "linkedin"
  | "github"
  | "portfolio"
  | "website"
  | "resume_upload"
  | "cover_letter_upload"
  | "work_authorization"
  | "work_authorization_category"
  | "sponsorship"
  | "sponsorship_now"
  | "sponsorship_future"
  | "work_without_sponsorship"
  | "relocation"
  | "remote_preference"
  | "onsite_preference"
  | "hybrid_preference"
  | "availability"
  | "desired_salary"
  | "hourly_rate"
  | "education_school"
  | "education_degree"
  | "education_major"
  | "education_highest_completed"
  | "education_highest_attended"
  | "graduation_date"
  | "expected_graduation_date"
  | "graduated_question"
  | "graduation_status"
  | "employer"
  | "job_title"
  | "employment_start_date"
  | "employment_end_date"
  | "previous_employment"
  | "skills"
  | "security_clearance_level"
  | "security_clearance_status"
  | "security_clearance_active"
  | "security_clearance_eligible"
  | "valid_drivers_license"
  | "reliable_transportation"
  | "minimum_working_age"
  | "background_check"
  | "drug_screen"
  | "travel_willingness"
  | "travel_percentage"
  | "shift_availability"
  | "weekend_availability"
  | "overtime_availability"
  | "notice_period"
  | "referral_source"
  | "why_interested"
  | "tell_us_about_yourself"
  | "years_experience"
  | "eeoc_gender"
  | "eeoc_race"
  | "eeoc_veteran"
  | "eeoc_disability"
  | "legal_attestation"
  | "unknown";

export interface ResumeMetadata {
  originalFilename: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  fileExists: boolean;
}

export interface LocationPreference {
  type: LocationKind;
  label: string;
  city: string;
  stateProvince: string;
  country: string;
  normalizedKey: string;
  geoId?: string;
  aliases?: string[];
}

export interface EducationEntry {
  id: string;
  school: string;
  normalizedSchoolName: string;
  degree: string;
  degreeType: DegreeType | "";
  degreeCustomValue: string;
  degreeLevel: HighestEducationLevel | "";
  major: string;
  fieldOfStudy: string;
  normalizedFieldOfStudy: string;
  displayFieldOfStudy: string;
  graduationStatus: GraduationStatus;
  graduationDate: string;
  graduationDateType: GraduationDateType;
  gpa: string;
  startDate: string;
  endDate: string;
  location: string;
}

export interface ExperienceEntry {
  id: string;
  company: string;
  normalizedCompanyName: string;
  aliases: string[];
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  currentRole: boolean;
  summary: string;
  bullets: string[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  summary: string;
  technologies: string[];
  url: string;
}

export interface CertificationEntry {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface IdentityProfile {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  fullName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  phoneCountryCode: string;
  phoneNationalNumber: string;
  phoneExtension: string | null;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  locationLabel: string;
  locationKey: string;
  linkedin: string;
  github: string;
  portfolio: string;
  website: string;
  otherLink: string;
  genericWebsiteFallback: WebsiteFallbackKind;
}

export interface WorkAuthorizationProfile {
  authorizedInUS: BinaryChoice;
  usWorkAuthorizationCategory: WorkAuthorizationCategory;
  requiresSponsorshipNow: BinaryChoice;
  requiresSponsorshipFuture: BinaryChoice;
  visaType: string;
  authorizationExpirationDate: string;
  openToRelocation: BinaryChoice;
  openToRemote: BinaryChoice;
  openToHybrid: BinaryChoice;
  openToOnsite: BinaryChoice;
}

export interface SecurityProfile {
  clearanceLevel: SecurityClearanceLevel;
  clearanceStatus: ClearanceStatus;
  clearanceExpirationDate: string;
  issuingAuthority: string;
}

export interface AvailabilityProfile {
  startTiming: AvailabilityTiming;
  customStartDate: string;
}

export interface CompensationProfile {
  minimumSalary: number | null;
  targetSalary: number | null;
  highSalary: number | null;
  hourlyMinimum: number | null;
  hourlyTarget: number | null;
  answerStyle: CompensationAnswerStyle;
}

export interface StructuredSkillsProfile {
  skills: string[];
}

export interface PreferencesProfile {
  jobTypes: JobType[];
  locationsOpenTo: LocationPreference[];
}

export interface EeocSingleAnswerSetting {
  value: string;
  customValue: string;
}

export interface EeocRaceAnswerSetting {
  values: string[];
  customValue: string;
}

export interface EeocDefaultsProfile {
  gender: EeocSingleAnswerSetting;
  raceEthnicity: EeocRaceAnswerSetting;
  veteranStatus: EeocSingleAnswerSetting;
  disabilityStatus: EeocSingleAnswerSetting;
}

export interface AdditionalApplicationFacts {
  validDriversLicense: YesNoNotApplicableChoice;
  reliableTransportation: YesNoNotApplicableChoice;
  meetsMinimumWorkingAge: YesNoNotApplicableChoice;
  willingBackgroundCheck: YesNoNotApplicableChoice;
  willingDrugScreen: YesNoNotApplicableChoice;
  relatedFamilyAtCompany: YesNoNotApplicableChoice;
  boundByNonCompete: YesNoNotApplicableChoice;
  governmentEmploymentHistory: YesNoNotApplicableChoice;
  willingToTravel: YesNoNotApplicableChoice;
  willingToTravelPercentage: string;
  shiftAvailability: string;
  weekendAvailability: YesNoNotApplicableChoice;
  overtimeAvailability: YesNoNotApplicableChoice;
  preferredEmploymentType: string;
  referralSource: string;
  phoneDeviceType: string;
  noticePeriod: string;
}

export interface ProfessionalBackgroundProfile {
  professionalSummary: string;
  currentIdentity: string;
  targetRoleCategories: string[];
  industriesOfInterest: string[];
  careerDirection: string;
  keyStrengths: string[];
  keyAccomplishments: string[];
  importantProjects: string[];
  reasonsForSeeking: string[];
}

export interface BehavioralStory {
  id: string;
  title: string;
  tags: string[];
  situation: string;
  action: string;
  result: string;
}

export interface ApplicantKnowledgeProfile {
  identity: {
    firstName: string;
    middleName: string;
    lastName: string;
    preferredName: string;
    email: string;
    phoneCountryCode: string;
    phoneNationalNumber: string;
    phoneExtension: string | null;
    country: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    stateProvince: string;
    postalCode: string;
  };
  professionalLinks: {
    linkedInUrl: string;
    portfolioUrl: string;
    githubUrl: string;
    personalWebsiteUrl: string;
    genericWebsiteFallback: WebsiteFallbackKind;
    genericWebsiteFallbackValue: string;
  };
  workAuthorization: {
    authorizedToWorkInUS: boolean | null;
    usWorkAuthorizationCategory: WorkAuthorizationCategory;
    requiresSponsorshipNow: boolean | null;
    requiresSponsorshipFuture: boolean | null;
    visaType: string;
    authorizationExpirationDate: string;
  };
  security: {
    securityClearanceLevel: SecurityClearanceLevel;
    clearanceStatus: ClearanceStatus;
    clearanceExpirationDate: string;
    issuingAuthority: string;
  };
  education: {
    institutions: EducationEntry[];
    degreeLevel: HighestEducationLevel | "";
    degreeType: DegreeType | "";
    fieldOfStudy: string;
    graduationStatus: GraduationStatus;
    graduationDate: string;
    graduationDateType: GraduationDateType;
    highestEducationLevel: HighestEducationLevel | "";
  };
  employment: {
    employers: string[];
    employerAliases: string[];
    workHistoryComplete: boolean;
    currentEmployer: string;
    currentTitle: string;
  };
  compensation: {
    minimumSalary: number | null;
    targetSalary: number | null;
    maximumSalary: number | null;
    minimumHourlyRate: number | null;
    targetHourlyRate: number | null;
  };
  availabilityAndPreferences: {
    availableStartType: AvailabilityTiming;
    availableStartDate: string;
    willingToRelocate: boolean | null;
    openToRemote: boolean | null;
    openToHybrid: boolean | null;
    openToOnsite: boolean | null;
    preferredLocations: LocationPreference[];
  };
  sensitive: {
    gender: EeocSingleAnswerSetting;
    raceEthnicity: EeocRaceAnswerSetting;
    veteranStatus: EeocSingleAnswerSetting;
    disabilityStatus: EeocSingleAnswerSetting;
  };
  files: {
    defaultResume: ResumeMetadata;
    additionalResumes: ResumeMetadata[];
    defaultCoverLetter: ResumeMetadata | null;
  };
  additionalQuestions: AdditionalApplicationFacts;
}

export interface ApplicantProfile {
  id: string;
  identity: IdentityProfile;
  workAuthorizationProfile: WorkAuthorizationProfile;
  securityProfile: SecurityProfile;
  availabilityProfile: AvailabilityProfile;
  compensationProfile: CompensationProfile;
  skillsProfile: StructuredSkillsProfile;
  preferencesProfile: PreferencesProfile;
  professionalBackground: ProfessionalBackgroundProfile;
  stories: BehavioralStory[];
  eeocDefaults: EeocDefaultsProfile;
  additionalApplicationFacts: AdditionalApplicationFacts;
  workHistoryComplete: boolean;
  resume: ResumeMetadata;
  knowledgeProfile: ApplicantKnowledgeProfile;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
  resumePath: string;
  resumeOriginalFilename: string;
  resumeStoredPath: string;
  resumeMimeType: string;
  resumeFileSize: number;
  resumeUploadedAt: string;
  resumeFileExists: boolean;
  resumeExtractedTextHash: string;
  parsedFromResume: boolean;
  profileCompletenessScore: number;
  lastParsedAt: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  certifications: CertificationEntry[];
  skills: string[];
  workAuthorization: string;
  requiresSponsorship: string;
  desiredSalary: string;
  availability: string;
  demographicDefaults: {
    gender: string;
    ethnicity: string | string[];
    veteranStatus: string;
    disabilityStatus: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AnswerBankItem {
  id: string;
  label: string;
  canonicalQuestion: string;
  normalizedQuestion: string;
  questionPatterns: string[];
  answer: string;
  intent?: FieldIntent;
  fieldType?: string;
  optionLabel?: string;
  sensitivity: AnswerSensitivity;
  autofillBehavior: AnswerAutofillBehavior;
  autoFillAllowed: boolean;
  usageCount: number;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerConstraints {
  maxWords: number | null;
  maxCharacters: number | null;
  maxSentences: number | null;
  requiresConcise: boolean;
  requestedTopics: string[];
  requestedEvidence: string[];
}

export interface StoryBankItem {
  id: string;
  title: string;
  summary: string;
  evidenceIds: string[];
  keywords: string[];
}

export interface CandidateEvidenceItem {
  id: string;
  kind: "experience" | "project" | "education" | "skill" | "profile" | "answer_bank" | "story";
  title: string;
  summary: string;
  claims: string[];
  keywords: string[];
  sourceLabel: string;
  provenance: EvidenceProvenance;
}

export interface CandidateEvidencePack {
  items: CandidateEvidenceItem[];
  stories: StoryBankItem[];
}

export interface JobEvidenceItem {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  provenance: "job";
}

export interface NormalizedJobContext {
  company: string;
  roleTitle: string;
  source: string;
  headline: string;
  summary: string;
  focusTerms: string[];
  responsibilities: string[];
  qualifications: string[];
  normalizedText: string;
  fieldQuestion?: string;
  evidence: JobEvidenceItem[];
}

export interface GeneratedAnswerValidation {
  valid: boolean;
  clipped: boolean;
  warnings: string[];
  unsupportedTerms: string[];
}

export interface AnswerQualityResult {
  passed: boolean;
  factualGrounding: number;
  questionRelevance: number;
  jobRelevance: number;
  candidateRelevance: number;
  fluency: number;
  specificity: number;
  concision: number;
  hasUnsupportedClaims: boolean;
  hasRepetition: boolean;
  hasKeywordStuffing: boolean;
  hasJobEvidenceContamination: boolean;
  reasons: string[];
}

export interface ShortAnswerSuggestion {
  kind: ShortAnswerQuestionKind;
  classificationConfidence: number;
  answerability: QuestionAnswerabilityKind;
  canonicalQuestion: string;
  questionText: string;
  constraints: AnswerConstraints;
  focusTerms: string[];
  evidenceIds: string[];
  evidenceTitles: string[];
  storyIds: string[];
  provider: string;
  generatorHealth: ShortAnswerGeneratorHealthStatus;
  generated: boolean;
  reusedAnswerBankItemId?: string;
  missingEvidence: string[];
  warnings: string[];
  validation: GeneratedAnswerValidation;
  quality?: AnswerQualityResult;
  jobEvidenceIds?: string[];
  jobEvidenceTitles?: string[];
  regenerationNotes?: string[];
  jobContextSummary?: string;
  followUpQuestion?: string;
}

export interface DetectedField {
  id: string;
  label: string;
  name: string;
  domId: string;
  type: string;
  selector: string;
  detectedValue: string;
  suggestedValue: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  status: FieldStatus;
  reason: string;
  sensitivity: AnswerSensitivity;
  autoFillAllowed: boolean;
  intent: FieldIntent;
  reviewCategory: ReviewCategory | null;
  matchedOption?: string;
  answerSource: AnswerSourceKind;
  verificationStatus: VerificationStatus;
  verificationMessage?: string;
  commitState?: FieldCommitState;
  controlType?: ControlType;
  questionText?: string;
  placeholder?: string;
  ariaLabel?: string;
  nearbyText?: string;
  selectOptions?: string[];
  frameUrl?: string;
  frameName?: string;
  isRequired?: boolean;
  isVisible?: boolean;
  isDisabled?: boolean;
  autocomplete?: string;
  accept?: string;
  role?: string;
  shortAnswer?: ShortAnswerSuggestion | null;
}

export interface AuditLogEntry {
  id: string;
  sessionId: string;
  fieldId?: string;
  action:
    | "session_created"
    | "browser_opened"
    | "scan_completed"
    | "field_suggested"
    | "field_filled"
    | "field_skipped"
    | "needs_review"
    | "error"
    | "status_changed"
    | "session_saved"
    | "answer_saved"
    | "autofill_run_completed"
    | "page_changed"
    | "correction_reported"
    | "correction_learned";
  message: string;
  reason?: string;
  timestamp: string;
}

export interface CaptchaEvidence {
  kind: string;
  selector?: string;
  frameUrl?: string;
  visible: boolean;
  interactive: boolean;
  width?: number;
  height?: number;
  provider?: "recaptcha" | "hcaptcha" | "turnstile" | "arkose" | "unknown";
  reason: string;
}

export interface CaptchaDetectionResult {
  status: CaptchaDetectionStatus;
  provider?: "recaptcha" | "hcaptcha" | "turnstile" | "arkose" | "unknown";
  evidence: CaptchaEvidence[];
  blocking: boolean;
  userMessage?: string;
}

export interface ApplicationStatusHistoryEntry {
  id: string;
  previousStatus: ApplicationDisplayStatus | null;
  newStatus: ApplicationDisplayStatus;
  timestamp: string;
}

export interface ApplicationNextStep {
  description: string;
  dueDate: string;
  completed: boolean;
}

export interface ApplicationPreparationSummary {
  durationSeconds: number | null;
  fieldsCompleted: number;
  questionsAnsweredByUser: number;
  suggestedAnswersUsed: number;
  correctionsMade: number;
  retryCount: number;
}

export type ApplyReadinessState = "ready" | "recommended" | "required";

export interface ApplyReadinessItem {
  id: string;
  label: string;
  detail: string;
  state: ApplyReadinessState;
  blocking: boolean;
}

export interface ApplyReadinessEnvironment {
  browserAutomationAvailable: boolean;
  browserAutomationDetail: string;
  localStorageWritable: boolean;
  localStorageDetail: string;
  generatorHealth: {
    status: ShortAnswerGeneratorHealthStatus;
    provider: string;
    detail: string;
  };
}

export interface ApplyReadinessReport {
  status: "ready" | "action_needed";
  canStart: boolean;
  requiredCount: number;
  recommendedCount: number;
  items: ApplyReadinessItem[];
}

export type CorrectionReportClassification =
  | "profile_data_correction"
  | "answer_memory_correction"
  | "field_intent_mapping_issue"
  | "option_matching_issue"
  | "ats_control_issue"
  | "generated_answer_issue"
  | "one_time_job_specific_correction";

export type CorrectionLearningTarget = "profile" | "saved_answer" | "regression";

export interface CorrectionReport {
  id: string;
  sessionId: string;
  fieldId: string;
  company: string;
  roleTitle: string;
  atsProvider: ApplicationSession["atsProvider"];
  visibleFieldQuestion: string;
  enteredValue: string;
  correctedValue: string;
  note: string;
  classification: CorrectionReportClassification;
  learningApproved: boolean;
  learningTargets: CorrectionLearningTarget[];
  severe: boolean;
  answerSource: AnswerSourceKind;
  intent: FieldIntent;
  controlType: ControlType;
  createdAt: string;
  updatedAt: string;
}

export interface DogfoodRegressionEntry {
  id: string;
  correctionReportId: string;
  sessionId: string;
  atsProvider: ApplicationSession["atsProvider"];
  issueType: CorrectionReportClassification;
  severity: "normal" | "severe";
  fieldQuestion: string;
  enteredValue: string;
  correctedValue: string;
  note: string;
  createdAt: string;
}

export interface DogfoodReport {
  generatedAt: string;
  applicationsPrepared: number;
  medianPreparationTimeSeconds: number | null;
  averageAutomaticCompletionRate: number;
  averageUserInputFields: number;
  averageCorrections: number;
  retryCount: number;
  severeCorrections: number;
  applicationsByAts: Array<{
    atsProvider: ApplicationSession["atsProvider"];
    count: number;
  }>;
  shortAnswersInserted: number;
  shortAnswersEdited: number;
  shortAnswersAcceptedUnchanged: number;
  finalStates: Array<{
    status: ApplicationDisplayStatus;
    count: number;
  }>;
}

export interface ApplicationSession {
  id: string;
  company: string;
  roleTitle: string;
  jobUrl: string;
  source: string;
  status: SessionStatus;
  statusMessage: string;
  nextAction: string;
  applicationStatus?: ApplicationDisplayStatus;
  statusHistory?: ApplicationStatusHistoryEntry[];
  nextStep?: ApplicationNextStep | null;
  detectedFields: DetectedField[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  auditLog: AuditLogEntry[];
  lastError?: string;
  warnings: string[];
  captchaDetection?: CaptchaDetectionResult;
  captchaOverridePageUrl?: string;
  browserStatus: "not_started" | "open" | "closed" | "error";
  atsProvider: "greenhouse" | "lever" | "ashby" | "workable" | "workday" | "generic";
  finalSubmitButtons: string[];
  resumeUsed: string;
  resumeDisplayLabel?: string;
  currentPageUrl: string;
  visitedPageUrls: string[];
  currentPageNumber: number;
  timeSpentSeconds: number;
  numberOfFieldsFilled: number;
  numberOfFieldsReviewed: number;
  numberOfFieldsSkipped: number;
  fieldsDetected: number;
  fieldsAttempted: number;
  fieldsFilledAndVerified: number;
  fieldsUnresolved: number;
  fieldsFailed: number;
  metadataSource?: string;
  jobContext?: NormalizedJobContext;
  generatorHealth?: {
    status: ShortAnswerGeneratorHealthStatus;
    provider: string;
    detail: string;
  };
  preparationSummary?: ApplicationPreparationSummary;
  submissionConfirmationState?: SubmissionConfirmationState;
  submissionConfirmationUpdatedAt?: string;
  dogfoodTelemetry?: {
    sessionStartedAt?: string;
    applicationFormReachedAt?: string;
    initialAutofillCompletedAt?: string;
    userReviewCompletedAt?: string;
    readyForSubmissionAt?: string;
    fieldsDetectedAtLastPass: number;
    fieldsFilledVerifiedAtLastPass: number;
    fieldsUnresolvedAtLastPass: number;
    userCorrections: number;
    manualAnswers: number;
    autofillRetries: number;
  };
}

export interface NewSessionInput {
  company: string;
  roleTitle: string;
  jobUrl: string;
  source: string;
  notes: string;
}

export interface DashboardStats {
  applicationsStarted: number;
  readyForReview: number;
  submittedManually: number;
  needsAttention: number;
  interviews: number;
  averageTimeMinutes: number;
}

export interface RawScannedField {
  label: string;
  name: string;
  domId: string;
  type: string;
  selector: string;
  detectedValue: string;
  controlType?: ControlType;
  role?: string;
  placeholder?: string;
  ariaLabel?: string;
  nearbyText?: string;
  selectOptions?: string[];
  frameUrl?: string;
  frameName?: string;
  isRequired?: boolean;
  isVisible?: boolean;
  isDisabled?: boolean;
  autocomplete?: string;
  accept?: string;
  explicitLabel?: string;
  ariaLabelledByText?: string;
  legendText?: string;
  questionContainerText?: string;
  optionLabel?: string;
  groupKey?: string;
  groupLabel?: string;
  labelSource?: string;
}

export interface ProfileCompletenessBreakdown {
  contactInfo: boolean;
  resumeAttached: boolean;
  workAuthorization: boolean;
  sponsorship: boolean;
  desiredSalary: boolean;
  links: boolean;
  education: boolean;
  experience: boolean;
  skills: boolean;
  answerBank: boolean;
}

export interface ResumeUploadResult {
  resume: ResumeMetadata;
  profile: ApplicantProfile;
}
