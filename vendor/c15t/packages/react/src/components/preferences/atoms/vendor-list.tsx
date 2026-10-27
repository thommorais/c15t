import type { AllConsentNames, ResolvedVendor } from '@c15t/core';
import vendorListStyles from '@c15t/ui/styles/components/vendor-list';
import { useId, useState } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { useVendorsListedUnder } from '~/component-hooks/use-vendors-listed-under';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import * as PreferenceItem from '~/components/shared/ui/preference-item';
import * as RadixSwitch from '~/components/shared/ui/switch';
import { useConsentDraftSlice, useConsentDraftStore } from '~/draft';
import { useTheme } from '~/hooks/use-theme';

export interface ConsentWidgetVendorListProps extends Omit<
	BoxProps,
	'children' | 'slotKey'
> {
	category: AllConsentNames;
}

const ToggleIcon = ({ open }: { open: boolean }) => (
	<svg
		aria-hidden="true"
		fill="none"
		focusable="false"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth="2"
		viewBox="0 0 24 24"
	>
		<title>{open ? 'Close' : 'Open'}</title>
		{open ? <path d="M5 12h14" /> : <path d="M5 12h14M12 5v14" />}
	</svg>
);

const DEFAULT_COPY = {
	disabledByCategory: 'Turn on this category to choose vendors.',
	privacyPolicy: 'Privacy policy',
	switchLabel: 'Allow {vendor}',
	title: 'Vendors ({count})',
};

type Copy = typeof DEFAULT_COPY;

interface VendorRowProps {
	category: AllConsentNames;
	categoryOn: boolean;
	checked: boolean;
	copy: Copy;
	labelId: string;
	noStyle: boolean;
	onCheckedChange: (next: boolean) => void;
	styles: typeof vendorListStyles | undefined;
	vendor: ResolvedVendor;
}

const VendorRow = ({
	category,
	categoryOn,
	checked,
	copy,
	labelId,
	noStyle,
	onCheckedChange,
	styles,
	vendor,
}: VendorRowProps) => {
	const [open, setOpen] = useState(false);
	const name = vendor.name ?? vendor.id;
	const toggleable = vendor.disabled !== true;
	const hasDetails = Boolean(vendor.description || vendor.privacyPolicyUrl);

	return (
		<PreferenceItem.Root
			className={styles?.item}
			data-testid={`consent-widget-vendor-item-${category}-${vendor.id}`}
			disabled={!hasDetails}
			noStyle={noStyle}
			onOpenChange={setOpen}
			open={open}
			slotKey="vendor-list.item"
		>
			<Box
				noStyle={noStyle}
				baseClassName={styles?.header}
				slotKey="vendor-list.header"
			>
				<PreferenceItem.Trigger
					className={styles?.trigger}
					data-testid={`consent-widget-vendor-trigger-${category}-${vendor.id}`}
					noStyle={noStyle}
					slotKey="vendor-list.trigger"
				>
					<PreferenceItem.Leading
						className={styles?.arrow}
						noStyle={noStyle}
					>
						<ToggleIcon open={open} />
					</PreferenceItem.Leading>
					<Box
						asChild
						noStyle={noStyle}
						baseClassName={styles?.name}
						slotKey="vendor-list.name"
					>
						<span
							data-testid={`consent-widget-vendor-name-${category}-${vendor.id}`}
							id={labelId}
						>
							{name}
						</span>
					</Box>
				</PreferenceItem.Trigger>
				{toggleable ? (
					<Box
						noStyle={noStyle}
						baseClassName={styles?.control}
						slotKey="vendor-list.control"
					>
						<RadixSwitch.Root
							aria-label={copy.switchLabel.replace('{vendor}', name)}
							aria-describedby={labelId}
							checked={checked}
							data-testid={`consent-widget-vendor-switch-${category}-${vendor.id}`}
							disabled={!categoryOn}
							onCheckedChange={onCheckedChange}
							size="small"
						/>
					</Box>
				) : null}
			</Box>
			{hasDetails ? (
				<PreferenceItem.Content
					className={styles?.content}
					data-testid={`consent-widget-vendor-content-${category}-${vendor.id}`}
					innerClassName={styles?.contentInner}
					noStyle={noStyle}
					slotKey="vendor-list.content"
				>
					{vendor.description ? (
						<Box
							asChild
							noStyle={noStyle}
							baseClassName={styles?.description}
							slotKey="vendor-list.description"
						>
							<p>{vendor.description}</p>
						</Box>
					) : null}
					{vendor.privacyPolicyUrl ? (
						<Box
							asChild
							noStyle={noStyle}
							baseClassName={styles?.link}
							slotKey="vendor-list.link"
						>
							<a
								href={vendor.privacyPolicyUrl}
								rel="noopener noreferrer"
								target="_blank"
							>
								{copy.privacyPolicy}
							</a>
						</Box>
					) : null}
				</PreferenceItem.Content>
			) : null}
		</PreferenceItem.Root>
	);
};

export const ConsentWidgetVendorList = ({
	category,
	className,
	noStyle,
	...props
}: ConsentWidgetVendorListProps) => {
	const vendors = useVendorsListedUnder(category);
	const draft = useConsentDraftStore();
	const categoryOn = useConsentDraftSlice(
		draft,
		(snapshot) => snapshot.values[category] === true
	);
	const selectedVendors = useConsentDraftSlice(
		draft,
		(snapshot) => snapshot.vendors
	);
	const { consentManagerDialog } = useTranslations();
	const { noStyle: contextNoStyle } = useTheme();
	const instanceId = useId();
	const finalNoStyle = noStyle ?? contextNoStyle ?? false;
	if (vendors.length === 0) {
		return null;
	}
	const copy = { ...DEFAULT_COPY, ...consentManagerDialog.vendors };
	const styles = finalNoStyle ? undefined : vendorListStyles;
	const title = copy.title.replace('{count}', String(vendors.length));

	return (
		<Box
			asChild
			className={className}
			data-testid={`consent-widget-vendor-list-${category}`}
			noStyle={finalNoStyle}
			baseClassName={styles?.root}
			slotKey="vendor-list.root"
			{...props}
		>
			<section aria-label={title}>
				{categoryOn ? null : (
					<p
						className={styles?.hint}
						data-testid={`consent-widget-vendor-hint-${category}`}
					>
						{copy.disabledByCategory}
					</p>
				)}
				{vendors.map((vendor) => (
					<VendorRow
						key={vendor.id}
						category={category}
						categoryOn={categoryOn}
						checked={selectedVendors[vendor.id] ?? true}
						copy={copy}
						labelId={`${instanceId}vendor-${category}-${vendor.id}`}
						noStyle={finalNoStyle}
						onCheckedChange={(next) => draft.setVendor(vendor.id, next)}
						styles={styles}
						vendor={vendor}
					/>
				))}
			</section>
		</Box>
	);
};
