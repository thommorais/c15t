import { appendJourneyParams } from '@c15t/schema/types';
import type { SubjectChoiceWire, VendorChoiceWire } from '@c15t/schema/types';

import { OPTIONAL_CONSENT_CATEGORIES } from '../consent-record/types';
import type {
	ExplicitChoice,
	OptionalConsentCategory,
} from '../consent-record/types';
import type { ExperimentAssignment } from '../libs/experiment';
import type { SavePayload } from '../types';

export const subjectsURL = function subjectsURL(
	base: string,
	journey: SavePayload['journey']
): string {
	const url = `${base}/subjects`;
	return journey
		? appendJourneyParams(url, { id: journey.id, scope: journey.scope })
		: url;
};

export interface BuildSubjectPostBodyOptions {
	domain: string;
}

export type SubjectSavePayload = SavePayload;

export interface SubjectPostBody {
	subjectId: string;
	externalSubjectId?: string;
	identityProvider?: string;
	identityToken?: string;
	domain: string;
	type: 'cookie_banner';
	preferences: Record<string, boolean>;
	givenAt: number;
	choice?: SubjectChoiceWire;
	model?: NonNullable<SavePayload['model']>;
	uiSource?: NonNullable<SavePayload['uiSource']>;
	consentAction: SavePayload['consentAction'];
	policySnapshotToken?: string;
	tcString?: string;
	addtlConsent?: string;
	vendorChoice?: VendorChoiceWire;
	metadata?: Record<string, unknown> & {
		userProperties?: NonNullable<SavePayload['user']>['properties'];
		timeToDecisionMs?: number;
		experiment?: ExperimentAssignment;
	};
}

const buildMetadata = function buildMetadata(
	payload: SubjectSavePayload
): SubjectPostBody['metadata'] {
	const metadata: SubjectPostBody['metadata'] = {};
	if (payload.user?.properties) {
		metadata.userProperties = payload.user.properties;
	}
	if (payload.timeToDecisionMs !== undefined) {
		metadata.timeToDecisionMs = payload.timeToDecisionMs;
	}
	if (payload.experiment) {
		metadata.experiment = { ...payload.experiment };
	}
	return Object.keys(metadata).length > 0 ? metadata : undefined;
};

export const buildConfirmedChoiceWire = function buildConfirmedChoiceWire(
	payload: Pick<SavePayload, 'choice' | 'confirmed'>
): SubjectChoiceWire | undefined {
	const { choice, confirmed } = payload;
	if (!choice || !confirmed) {
		return undefined;
	}
	const categories: SubjectChoiceWire['categories'] = {};
	for (const key of Object.keys(confirmed.categories)) {
		const category = key as OptionalConsentCategory;
		const receipt = choice.categories[category];
		if (receipt === undefined) {
			continue;
		}
		categories[category] = {
			basis:
				receipt.basis.kind === 'choice-v1'
					? { fingerprint: receipt.basis.fingerprint, kind: 'choice-v1' }
					: {
							kind: 'legacy-v2',
							...(receipt.basis.materialFingerprint !== undefined && {
								materialFingerprint: receipt.basis.materialFingerprint,
							}),
						},
			confirmedAt: receipt.confirmedAt,
			value: receipt.value,
		};
	}
	return { categories, version: 3 };
};

export const explicitPreferences = function explicitPreferences(
	choice: Readonly<ExplicitChoice>
): Record<string, boolean> {
	const preferences: Record<string, boolean> = { necessary: true };
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const receipt = choice.categories[category];
		if (receipt !== undefined) {
			preferences[category] = receipt.value;
		}
	}
	return preferences;
};

export const buildSubjectPostBody = function buildSubjectPostBody(
	payload: SubjectSavePayload,
	opts: BuildSubjectPostBodyOptions
): SubjectPostBody {
	const choice = buildConfirmedChoiceWire(payload);
	return {
		consentAction: payload.consentAction,
		domain: opts.domain,
		externalSubjectId: payload.user?.externalId,
		givenAt: payload.confirmed.actionAt,
		identityProvider: payload.user?.identityProvider,
		identityToken: payload.user?.identityToken,
		metadata: buildMetadata(payload),
		model: payload.model ?? undefined,
		policySnapshotToken: payload.policySnapshotToken ?? undefined,
		preferences: explicitPreferences(payload.choice),
		subjectId: payload.subjectId,
		tcString: payload.tcString ?? undefined,
		type: 'cookie_banner',
		uiSource: payload.uiSource ?? undefined,
		...(choice !== undefined && { choice }),
		...(payload.tcString &&
			payload.addtlConsent && { addtlConsent: payload.addtlConsent }),
		...(payload.vendorChoice !== undefined && {
			vendorChoice: {
				confirmedAt: payload.vendorChoice.confirmedAt,
				grants: { ...payload.vendorChoice.grants },
				version: 1 as const,
			},
		}),
	};
};
