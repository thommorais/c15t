package api

const (
	codeUnauthorized          = "UNAUTHORIZED"
	codeForbidden             = "FORBIDDEN"
	codeNotFound              = "NOT_FOUND"
	codeRateLimited           = "RATE_LIMITED"
	codeInputValidationFailed = "INPUT_VALIDATION_FAILED"
	codeInternalServerError   = "INTERNAL_SERVER_ERROR"
	codeServiceUnavailable    = "SERVICE_UNAVAILABLE"
	codeSubjectIDRequired     = "SUBJECT_ID_REQUIRED"
	codeSubjectNotFound       = "SUBJECT_NOT_FOUND"
	codeExternalIDRequired    = "EXTERNAL_ID_REQUIRED"
	codeTypeRequired          = "TYPE_REQUIRED"
	codePolicyNotFound        = "POLICY_NOT_FOUND"
	codePolicyInactive        = "POLICY_INACTIVE"
	codePolicyResolution      = "POLICY_RESOLUTION_FAILED"
	codePurposeNotAllowed     = "PURPOSE_NOT_ALLOWED"
	codeSnapshotRequired      = "POLICY_SNAPSHOT_REQUIRED"
	codeSnapshotExpired       = "POLICY_SNAPSHOT_EXPIRED"
	codeSnapshotInvalid       = "POLICY_SNAPSHOT_INVALID"
	codeProofRequired         = "LEGAL_DOCUMENT_PROOF_REQUIRED"
	codeReleaseConflict       = "LEGAL_DOCUMENT_RELEASE_CONFLICT"
)

const (
	sourceSnapshot  = "snapshot_token"
	sourceWriteTime = "write_time_fallback"
)

const (
	msgUnauthorized        = "API key required. Use Authorization: Bearer <api_key>"
	msgInternalServerError = "Internal server error"
	msgPurposeNotAllowed   = "Preferences include categories not allowed by policy"
)
