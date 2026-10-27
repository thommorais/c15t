const MAX_BODY_BYTES = 16 * 1024;
const BODY_TIMEOUT_MS = 2000;
const MAX_MESSAGE_LENGTH = 500;

export interface FailedResponseDetail {
	code?: string;
	message?: string;
	reason?: string;
}

export type FailedResponseError = Error & {
	code?: string;
	status: number;
};

const readNonEmptyString = function readNonEmptyString(
	value: unknown
): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const dropRest = async function dropRest(
	reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
	try {
		await reader.cancel();
	} catch {
	}
};

const readStream = async function readStream(
	body: ReadableStream<Uint8Array>
): Promise<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let text = '';
	let bytes = 0;
	const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined };
	const timeout = new Promise<'timeout'>((resolve) => {
		timer.id = setTimeout(() => resolve('timeout'), BODY_TIMEOUT_MS);
	});
	try {
		while (bytes <= MAX_BODY_BYTES) {
			// oxlint-disable-next-line no-await-in-loop -- Chunks arrive in order.
			const chunk = await Promise.race([reader.read(), timeout]);
			if (chunk === 'timeout' || chunk.done) {
				break;
			}
			bytes += chunk.value.byteLength;
			text += decoder.decode(chunk.value, { stream: true });
		}
	} finally {
		clearTimeout(timer.id);
		void dropRest(reader);
	}
	return bytes > MAX_BODY_BYTES ? '' : text + decoder.decode();
};

const readText = async function readText(response: Response): Promise<string> {
	if (response.body) {
		return await readStream(response.body);
	}
	return typeof response.text === 'function' ? await response.text() : '';
};

export const readFailedResponse = async function readFailedResponse(
	response: Response
): Promise<FailedResponseDetail> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readText(response));
	} catch {
		return {};
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return {};
	}
	const body = parsed as {
		cause?: { code?: unknown; reason?: unknown } | null;
		code?: unknown;
		message?: unknown;
	};
	const cause =
		typeof body.cause === 'object' && body.cause !== null
			? body.cause
			: undefined;
	const detail: FailedResponseDetail = {};
	const code = readNonEmptyString(cause?.code) ?? readNonEmptyString(body.code);
	if (code) {
		detail.code = code;
	}
	const message = readNonEmptyString(body.message);
	if (message) {
		detail.message =
			message.length > MAX_MESSAGE_LENGTH
				? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
				: message;
	}
	const reason = readNonEmptyString(cause?.reason);
	if (reason) {
		detail.reason = reason;
	}
	return detail;
};

export const describeFailedResponse = function describeFailedResponse(
	prefix: string,
	response: Response,
	detail: FailedResponseDetail
): string {
	const said = detail.message
		? `: ${detail.message}`
		: ` ${response.statusText ?? ''}`;
	const code = detail.code ? ` (${detail.code})` : '';
	return `${prefix} responded ${response.status}${said}${code}`;
};

export const failedResponseError = async function failedResponseError(
	prefix: string,
	response: Response
): Promise<FailedResponseError> {
	const detail = await readFailedResponse(response);
	const error: FailedResponseError = Object.assign(
		new Error(describeFailedResponse(prefix, response, detail)),
		{ status: response.status }
	);
	if (detail.code) {
		error.code = detail.code;
	}
	return error;
};
