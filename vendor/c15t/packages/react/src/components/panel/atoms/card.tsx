'use client';

import brandingStyles from '@c15t/ui/styles/components/branding';
import styles from '@c15t/ui/styles/components/consent-dialog';
import { forwardRef as createForwardRef, isValidElement } from 'react';
import type { ReactNode, Ref } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { ConsentWidget } from '~/components/preferences/preferences';
import { Slot } from '~/components/shared/libs/slot';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import type { InlineLegalLinksProps } from '~/components/shared/primitives/legal-links';
import { InlineLegalLinks } from '~/components/shared/primitives/legal-links';
import { BrandingLink } from '~/components/shared/ui/branding';
import type {
	BrandingSlotContext,
	BrandingVariant,
} from '~/components/shared/ui/branding';
import { useTheme } from '~/hooks/use-theme';
import type { ClassNameStyle } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { mergeSlotProps } from '~/utils/merge-slot-props';

type ConsentDialogCardProps = {
	children?: ReactNode;
} & ClassNameStyle;

const ConsentDialogCard = createForwardRef<
	HTMLDivElement,
	ConsentDialogCardProps
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.card}
		{...props}
		slotKey="dialog.card"
		data-testid="consent-dialog-card"
		tabIndex={-1}
	>
		{children}
	</Box>
));
ConsentDialogCard.displayName = 'ConsentDialogCard';

const ConsentDialogHeader = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.header}
		{...props}
		slotKey="dialog.header"
		data-testid="consent-dialog-header"
	>
		{children}
	</Box>
));
ConsentDialogHeader.displayName = 'ConsentDialogHeader';

const ConsentDialogHeaderTitle = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, asChild, ...props }, ref) => {
	const { consentManagerDialog: consentDialog } = useTranslations();
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.title}
			slotKey="dialog.title"
			{...props}
			id="consent-dialog-title"
			data-testid="consent-dialog-title"
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<h2>{children ?? consentDialog.title}</h2>
			)}
		</Box>
	);
});
ConsentDialogHeaderTitle.displayName = 'ConsentDialogHeaderTitle';

const ConsentDialogHeaderDescription = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'> & {
		legalLinks?: InlineLegalLinksProps['links'];
	}
>(
	(
		{ children, legalLinks, asChild, className, style, noStyle, ...props },
		ref
	) => {
		const { consentManagerDialog: consentDialog } = useTranslations();
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const context = 'dialog';
		const descriptionProps = mergeSlotProps(
			components?.description?.[context],
			{
				baseClassName: styles.description,
				className,
				'data-context': context,
				'data-testid': 'consent-dialog-description',
				id: 'consent-dialog-description',
				noStyle: noStyle ?? contextNoStyle,
				style,
				...props,
			}
		);

		if (asChild && isValidElement(children)) {
			return (
				<Slot
					ref={ref as Ref<HTMLDivElement>}
					{...descriptionProps}
				>
					{children}
				</Slot>
			);
		}
		return (
			<div
				ref={ref as Ref<HTMLDivElement>}
				{...descriptionProps}
			>
				{children ?? consentDialog.description}
				<InlineLegalLinks
					links={legalLinks}
					context="dialog"
					testIdPrefix="consent-dialog-legal-link"
				/>
			</div>
		);
	}
);
ConsentDialogHeaderDescription.displayName = 'ConsentDialogHeaderDescription';

const ConsentDialogContent = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.content}
		slotKey="dialog.content"
		data-testid="consent-dialog-content"
		{...props}
	>
		{children}
	</Box>
));
ConsentDialogContent.displayName = 'ConsentDialogContent';

export const Branding = (props: BrandingProps) => <BrandingLink {...props} />;
const ConsentDialogFooter = createForwardRef<
	HTMLDivElement,
	BoxProps & { hideBranding?: boolean; 'data-testid'?: string }
>(({ children, hideBranding, 'data-testid': testId, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={cn(
			styles.footer,
			(children === null || children === undefined) &&
				!hideBranding &&
				brandingStyles.brandingFooter
		)}
		data-testid={testId ?? 'consent-dialog-footer'}
		{...props}
		slotKey="manager.footer"
	>
		{children ?? (
			<Branding
				hideBranding={hideBranding ?? false}
				variant="dialog-tag"
				slotContext="dialog"
				data-testid="consent-dialog-branding"
			/>
		)}
	</Box>
));
ConsentDialogFooter.displayName = 'ConsentDialogFooter';

interface BrandingProps {
	hideBranding: boolean;
	variant?: BrandingVariant;
	slotContext?: BrandingSlotContext;
	className?: string;
	'data-testid'?: string;
}

const ConsentCustomizationCard = ({
	noStyle,
	legalLinks,
	hideBranding,
}: {
	noStyle?: boolean;
	legalLinks?: InlineLegalLinksProps['links'];
	hideBranding?: boolean;
}) => (
	<ConsentDialogCard>
		<ConsentDialogHeader>
			<ConsentDialogHeaderTitle />
			<ConsentDialogHeaderDescription legalLinks={legalLinks} />
		</ConsentDialogHeader>
		<ConsentDialogContent>
			<ConsentWidget
				hideBranding
				noStyle={noStyle}
				useProvider={true}
			/>
		</ConsentDialogContent>
		<Branding
			hideBranding={hideBranding ?? false}
			variant="dialog-tag"
			slotContext="dialog"
			data-testid="consent-dialog-branding"
		/>
	</ConsentDialogCard>
);

const Card = ConsentDialogCard;
const Header = ConsentDialogHeader;
const HeaderTitle = ConsentDialogHeaderTitle;
const HeaderDescription = ConsentDialogHeaderDescription;
const Content = ConsentDialogContent;
const Footer = ConsentDialogFooter;

export {
	Card,
	ConsentCustomizationCard,
	ConsentDialogCard,
	ConsentDialogContent,
	ConsentDialogFooter,
	ConsentDialogHeader,
	ConsentDialogHeaderDescription,
	ConsentDialogHeaderTitle,
	Content,
	Footer,
	Header,
	HeaderDescription,
	HeaderTitle,
};
