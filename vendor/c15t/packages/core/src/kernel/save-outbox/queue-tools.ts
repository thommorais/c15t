import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import {
	isPlainRecord,
	validateExplicitChoice,
} from '../../consent-record/validation';
import { generateSubjectId } from '../../libs/generate-subject-id';
import {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../transports/save-rejection';
import type { QueueTools } from './queue';
import { supersededBy, withoutSuperseded, withSubjectId } from './supersession';
import { warnInDevelopment } from './warn';

export const queueTools: QueueTools = {
	generateSubjectId,
	isConsentSaveRejection,
	isPlainRecord,
	isSubjectConflict,
	optionalCategories: OPTIONAL_CONSENT_CATEGORIES,
	supersededBy,
	validateExplicitChoice,
	warnInDevelopment,
	withSubjectId,
	withoutSuperseded,
};
