import {
	describeFailedResponse,
	readFailedResponse,
} from '../libs/failed-response';

const PERMANENT_REJECTION_CODES: ReadonlySet<string> = new Set([
	'CONFLICT',
	'POLICY_SNAPSHOT_EXPIRED',
	'POLICY_SNAPSHOT_INVALID',
	'POLICY_SNAPSHOT_REQUIRED',
	'STALE_POLICY',
	'SUBJECT_CONFLICT',
]);

export class ConsentSaveRejectedError extends Error {
	readonly c15tSaveRejected = true;
	readonly code: string;
	readonly reason: string | undefined;
	readonly status: number;

	constructor(options: {
		code: string;
		message: string;
		reason?: string;
		status: number;
	}) {
		super(options.message);
		this.name = 'ConsentSaveRejectedError';
		this.code = options.code;
		this.reason = options.reason;
		this.status = options.status;
	}
}

export const isConsentSaveRejection = function isConsentSaveRejection(
	error: unknown
): error is ConsentSaveRejectedError {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { c15tSaveRejected?: unknown }).c15tSaveRejected === true
	);
};

export const isSubjectConflict = function isSubjectConflict(
	error: unknown
): boolean {
	return isConsentSaveRejection(error) && error.code === 'SUBJECT_CONFLICT';
};

export const saveFailure = async function saveFailure(
	response: Response,
	label: string
): Promise<Error> {
	const detail = await readFailedResponse(response);
	const message = describeFailedResponse(
		`${label}: /subjects`,
		response,
		detail
	);
	if (response.status === 402) {
		return new ConsentSaveRejectedError({
			code: detail.code ?? 'PAYMENT_REQUIRED',
			message,
			reason: detail.reason ?? detail.message,
			status: response.status,
		});
	}
	const { code } = detail;
	if (
		(response.status === 409 || response.status === 422) &&
		code &&
		PERMANENT_REJECTION_CODES.has(code)
	) {
		return new ConsentSaveRejectedError({
			code,
			message,
			reason: detail.reason,
			status: response.status,
		});
	}
	const error: Error & { code?: string; status: number } = Object.assign(
		new Error(message),
		{ status: response.status }
	);
	if (code) {
		error.code = code;
	}
	return error;
};
