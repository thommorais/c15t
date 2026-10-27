'use client';

import { forwardRef as createForwardRef } from 'react';
import type { ElementType } from 'react';

import * as atoms from './atoms';
import { ConsentGate as ConsentGateComponent } from './consent-gate';
import type { ConsentGateCompoundComponent, ConsentGateProps } from './types';

declare const process: { env: { NODE_ENV?: string } };

const warned = new Set<string>();

const warnDeprecated = function warnDeprecated(
	name: string,
	replacement: string
): void {
	if (process.env.NODE_ENV === 'production' || warned.has(name)) {
		return;
	}
	warned.add(name);
	// oxlint-disable-next-line no-console -- Development-only deprecation notice.
	console.warn(
		`c15t: \`${name}\` is deprecated and will be removed in a future major release. Use \`${replacement}\` instead.`
	);
};

const deprecatedPart = function deprecatedPart<PartType>(
	part: PartType,
	name: string,
	replacement: string
): PartType {
	const Part = part as ElementType;
	const Deprecated = createForwardRef<unknown, object>((props, ref) => {
		warnDeprecated(name, replacement);
		return (
			<Part
				{...props}
				ref={ref}
			/>
		);
	});
	Deprecated.displayName = name;
	return Deprecated as unknown as PartType;
};

const FrameRoot: typeof atoms.ConsentGateRoot = deprecatedPart(
	atoms.ConsentGateRoot,
	'FrameRoot',
	'ConsentGate.Root'
);

const FrameTitle: typeof atoms.ConsentGateTitle = deprecatedPart(
	atoms.ConsentGateTitle,
	'FrameTitle',
	'ConsentGate.Title'
);

const FrameButton: typeof atoms.ConsentGateButton = deprecatedPart(
	atoms.ConsentGateButton,
	'FrameButton',
	'ConsentGate.Button'
);

const Frame: ConsentGateCompoundComponent = Object.assign(
	deprecatedPart(ConsentGateComponent, 'Frame', 'ConsentGate'),
	{ Button: FrameButton, Root: FrameRoot, Title: FrameTitle }
);

type FrameProps = ConsentGateProps;

type FrameCompoundComponent = ConsentGateCompoundComponent;

export type { FrameCompoundComponent, FrameProps };
export { Frame, FrameButton, FrameRoot, FrameTitle };
