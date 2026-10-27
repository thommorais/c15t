export const POLICY_EVENT_NAMES = {
	'choice-recorded': 'choice:recorded',
	'notice-dismissed': 'notice:dismissed',
	'permissions-changed': 'permissions:changed',
} as const;

export const EVENT_NAMES = [
	'onChoiceRecorded',
	'onPermissionsChanged',
	'onError',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
