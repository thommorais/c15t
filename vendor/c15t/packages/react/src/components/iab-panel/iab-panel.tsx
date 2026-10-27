'use client';

import type * as C15tCoreTypes from '@c15t/core';
import { applyPublisherRestrictionsToGVL } from '@c15t/iab/headless';
import { isDialogDismissKey } from '@c15t/ui/primitives/dialog';
import actionStyles from '@c15t/ui/styles/components/consent-actions';
import styles from '@c15t/ui/styles/components/iab-consent-dialog';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import type { ComponentPropsWithoutRef, FC, RefObject } from 'react';
import { createPortal } from 'react-dom';

import { useHeadlessIABConsentUI } from '~/component-hooks/use-headless-iab-consent-ui';
import { useTranslations } from '~/component-hooks/use-translations';
import { ConsentDialogTrigger } from '~/components/panel-trigger';
import type { ConsentDialogTriggerProps } from '~/components/panel-trigger';
import { Branding } from '~/components/panel/atoms/card';
import * as Button from '~/components/shared/ui/button';
import * as Tabs from '~/components/shared/ui/tabs';
import { ConsentTrackingContext } from '~/context/consent-tracking-context';
import { LocalThemeContext } from '~/context/theme-context';
import { useComponentConfig } from '~/hooks/use-component-config';
import { useFocusTrap } from '~/hooks/use-focus-trap';
import { useIABConsentManager } from '~/hooks/use-iab-manager';
import { useScrollLock } from '~/hooks/use-scroll-lock';
import { useTextDirection } from '~/hooks/use-text-direction';
import { useUIConfig } from '~/ui-config-context';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { IAB_DIALOG_SHEETS } from '../shared/iab-dialog-sheets';
import { SurfaceStyles, useSurfaceSheetsReady } from '../shared/surface-styles';
import { FeatureItem } from './atoms/feature-item';
import { IABConsentDialogOverlay } from './atoms/overlay';
import { PurposeItem } from './atoms/purpose-item';
import { StackItem } from './atoms/stack-item';
import { VendorList } from './atoms/vendor-list';
import { useIABDisplayModel } from './hooks/use-display-model';
import type { VendorId } from './types';
import { useIABTranslations } from './use-iab-translations';

const DEFAULT_MODELS: C15tCoreTypes.Model[] = ['iab'];

const dialogFocusTargetProps = { tabIndex: -1 } as const;

export interface IABConsentDialogProps {
	open?: boolean;

	noStyle?: boolean;

	disableAnimation?: boolean;

	scrollLock?: boolean;

	trapFocus?: boolean;

	hideBranding?: boolean;

	showTrigger?: boolean | ConsentDialogTriggerProps;

	initialTab?: 'purposes' | 'vendors';

	models?: C15tCoreTypes.Model[];

	uiSource?: string;
}

// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
export const IABConsentDialog: FC<IABConsentDialogProps> = ({
	open,
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock: localScrollLock,
	trapFocus: localTrapFocus,
	hideBranding,
	initialTab,
	showTrigger = false,
	models = DEFAULT_MODELS,
	uiSource: _uiSource,
}) => {
	const iabTranslations = useIABTranslations();
	const { common } = useTranslations();
	const { components } = useUIConfig();
	const {
		iab: iabState,
		activeUI,
		policyDialog,
		translationConfig,
		model,
	} = useIABConsentManager({
		preferences: { scrollLock: localScrollLock, trapFocus: localTrapFocus },
	});
	const { banner, closeUI, openDialog, performDialogAction } =
		useHeadlessIABConsentUI();
	const resolvedScrollLock = policyDialog.blocking;

	const textDirection = useTextDirection(translationConfig.defaultLanguage);
	const cardRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const previousHeightRef = useRef<number | null>(null);

	const [activeTab, setActiveTab] = useState<'purposes' | 'vendors'>(
		initialTab ?? iabState?.preferenceCenterTab ?? 'purposes'
	);
	const [selectedVendorId, setSelectedVendorId] = useState<VendorId | null>(
		null
	);
	const [specialPurposesExpanded, setSpecialPurposesExpanded] = useState(false);
	const [isMounted, setIsMounted] = useState(false);
	const [isVisible, setIsVisible] = useState(false);

	const sheetsReady = useSurfaceSheetsReady(IAB_DIALOG_SHEETS, localNoStyle);
	const isOpen =
		sheetsReady &&
		model !== null &&
		models.includes(model) &&
		(open ?? activeUI === 'dialog');

	const config = useComponentConfig({
		disableAnimation: localDisableAnimation,
		noStyle: localNoStyle,
		scrollLock: resolvedScrollLock,
		trapFocus: policyDialog.blocking,
	});

	const {
		consentRows,
		essentialRows,
		essentialPartnerCount,
		featureRows,
		featuresStandardText,
		purposeTabCount,
		vendorTabCount,
		data: { purposes },
	} = useIABDisplayModel();
	const gvl = iabState?.gvl ?? null;
	const publisherRestrictions = iabState?.publisherRestrictions;
	const vendorData = useMemo(
		() =>
			gvl ? applyPublisherRestrictionsToGVL(gvl, publisherRestrictions) : null,
		[gvl, publisherRestrictions]
	);

	const handlePurposeToggle = useCallback(
		(purposeId: number, value: boolean) => {
			iabState?.setPurposeConsent(purposeId, value);
		},
		[iabState]
	);

	const handleSpecialFeatureToggle = useCallback(
		(featureId: number, value: boolean) => {
			iabState?.setSpecialFeatureOptIn(featureId, value);
		},
		[iabState]
	);

	const handleVendorToggle = useCallback(
		(vendorId: VendorId, value: boolean) => {
			iabState?.setVendorConsent(vendorId, value);
		},
		[iabState]
	);

	const handleAdTechProviderToggle = useCallback(
		(providerId: number, value: boolean) => {
			iabState?.setAdTechProviderConsent(providerId, value);
		},
		[iabState]
	);

	const handleVendorLegitimateInterestToggle = useCallback(
		(vendorId: VendorId, value: boolean) => {
			iabState?.setVendorLegitimateInterest(vendorId, value);
		},
		[iabState]
	);

	const handlePurposeLegitimateInterestToggle = useCallback(
		(purposeId: number, value: boolean) => {
			iabState?.setPurposeLegitimateInterest(purposeId, value);
		},
		[iabState]
	);

	const handleAcceptAll = async () => {
		try {
			await performDialogAction('accept');
		} catch {
		}
	};

	const handleRejectAll = async () => {
		try {
			await performDialogAction('reject');
		} catch {
		}
	};

	const handleSave = async () => {
		try {
			await performDialogAction('customize');
		} catch {
		}
	};

	const handleClose = useCallback(() => {
		closeUI();
	}, [closeUI]);

	const handleVendorClick = (vendorId: VendorId) => {
		setSelectedVendorId(vendorId);
		setActiveTab('vendors');
		openDialog({ tab: 'vendors' });
	};

	useFocusTrap(
		Boolean(isMounted && isOpen && config.trapFocus),
		cardRef as RefObject<HTMLElement>,
		{ initialFocus: 'first-tabbable' }
	);

	useScrollLock(Boolean(isOpen && config.scrollLock));

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (isDialogDismissKey(event.key)) {
				event.preventDefault();
				handleClose();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [handleClose, isOpen]);

	useEffect(() => {
		const frame = requestAnimationFrame(() => setIsMounted(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	useEffect(() => {
		if (isOpen) {
			const frame = requestAnimationFrame(() => setIsVisible(true));
			return () => cancelAnimationFrame(frame);
		}

		if (config.disableAnimation) {
			const frame = requestAnimationFrame(() => setIsVisible(false));
			return () => cancelAnimationFrame(frame);
		}

		const timer = setTimeout(() => {
			setIsVisible(false);
		}, 150);
		return () => clearTimeout(timer);
	}, [isOpen, config.disableAnimation]);

	const initialTabPendingRef = useRef(Boolean(initialTab));
	useEffect(() => {
		const preferenceCenterTab = iabState?.preferenceCenterTab;
		if (!(isOpen && preferenceCenterTab)) {
			return;
		}
		if (initialTabPendingRef.current) {
			initialTabPendingRef.current = false;
			return;
		}
		const frame = requestAnimationFrame(() => {
			setActiveTab(preferenceCenterTab);
		});
		return () => cancelAnimationFrame(frame);
	}, [isOpen, iabState?.preferenceCenterTab]);

	useLayoutEffect(() => {
		if (activeTab !== 'purposes' && activeTab !== 'vendors') {
			return;
		}
		const content = contentRef.current;
		if (!content || previousHeightRef.current === null) {
			return;
		}

		const previousHeight = previousHeightRef.current;
		previousHeightRef.current = null;

		const prefersReducedMotion = window.matchMedia(
			'(prefers-reduced-motion: reduce)'
		).matches;

		if (prefersReducedMotion) {
			return;
		}

		content.style.height = `${previousHeight}px`;
		content.style.overflow = 'hidden';
		content.style.transition = 'none';

		// oxlint-disable-next-line prefer-const -- Preserve declaration order, interface shape, and public compatibility.
		let rafId1: number;
		let rafId2: number;

		rafId1 = requestAnimationFrame(() => {
			rafId2 = requestAnimationFrame(() => {
				if (!content) {
					return;
				}

				content.style.height = 'auto';
				const newHeight = content.getBoundingClientRect().height;
				content.style.height = `${previousHeight}px`;

				if (Math.abs(previousHeight - newHeight) < 1) {
					content.style.height = '';
					content.style.overflow = '';
					content.style.transition = '';
					return;
				}

				content.getBoundingClientRect();

				content.style.transition =
					'height 180ms cubic-bezier(0.33, 1, 0.68, 1)';
				content.style.height = `${newHeight}px`;

				const handleTransitionEnd = (e: TransitionEvent) => {
					if (e.propertyName !== 'height') {
						return;
					}
					content.style.height = '';
					content.style.overflow = '';
					content.style.transition = '';
				};

				content.addEventListener('transitionend', handleTransitionEnd, {
					once: true,
				});
			});
		});

		return () => {
			cancelAnimationFrame(rafId1);
			cancelAnimationFrame(rafId2);
		};
	}, [activeTab]);

	const handleTabChange = useCallback(
		(tab: 'purposes' | 'vendors') => {
			if (contentRef.current) {
				previousHeightRef.current = contentRef.current.offsetHeight;
			}
			setActiveTab(tab);
			openDialog({ tab });
		},
		[openDialog]
	);
	const trackingContextValue = useMemo(
		() => ({ uiSource: _uiSource ?? 'iab_dialog' }),
		[_uiSource]
	);

	if (!isMounted || !iabState?.config.enabled) {
		return null;
	}

	const isLoading = iabState.isLoadingGVL || !iabState.gvl;
	const rootProps = mergeSlotProps(components?.['iab-dialog']?.root, {
		baseClassName: `${styles.root} ${isVisible ? styles.dialogVisible : styles.dialogHidden}`,
		noStyle: config.noStyle,
	});
	const cardProps = mergeSlotProps(components?.['iab-dialog']?.card, {
		baseClassName: `${styles.card} ${isVisible ? styles.contentVisible : styles.contentHidden}`,
		noStyle: config.noStyle,
	});
	const headerProps = mergeSlotProps(components?.['iab-dialog']?.header, {
		baseClassName: styles.header,
		noStyle: config.noStyle,
	});
	const headerContentProps = mergeSlotProps(
		components?.['iab-dialog']?.headerContent,
		{
			baseClassName: styles.headerContent,
			noStyle: config.noStyle,
		}
	);
	const titleProps = mergeSlotProps(components?.['iab-dialog']?.title, {
		baseClassName: styles.title,
		noStyle: config.noStyle,
	});
	const descriptionProps = mergeSlotProps(
		components?.['iab-dialog']?.description,
		{
			baseClassName: styles.description,
			noStyle: config.noStyle,
		}
	);
	const closeButtonProps = mergeSlotProps(
		components?.['iab-dialog']?.closeButton,
		{
			baseClassName: styles.closeButton,
			noStyle: config.noStyle,
		}
	);
	const bodyProps = mergeSlotProps(components?.['iab-dialog']?.body, {
		baseClassName: styles.body,
		noStyle: config.noStyle,
	}) as Omit<
		ComponentPropsWithoutRef<typeof Tabs.Root>,
		'children' | 'onValueChange' | 'value'
	>;
	const tabsProps = mergeSlotProps(components?.['iab-dialog']?.tabs, {
		baseClassName: styles.tabsContainer,
		noStyle: config.noStyle,
	});
	const tabsListProps = mergeSlotProps(components?.['iab-dialog']?.tabsList, {
		baseClassName: styles.tabsList,
		noStyle: config.noStyle,
	});
	const tabTriggerProps = mergeSlotProps(
		components?.['iab-dialog']?.tabTrigger,
		{
			baseClassName: styles.tabButton,
			noStyle: config.noStyle,
		}
	);
	const tabIndicatorProps = mergeSlotProps(
		components?.['iab-dialog']?.tabIndicator,
		{
			baseClassName: styles.tabIndicator,
			noStyle: config.noStyle,
		}
	);
	const contentProps = mergeSlotProps(components?.['iab-dialog']?.content, {
		baseClassName: styles.content,
		noStyle: config.noStyle,
	});
	const loadingProps = mergeSlotProps(components?.['iab-dialog']?.loading, {
		baseClassName: styles.loadingContainer,
		noStyle: config.noStyle,
	});
	const tabPanelProps = mergeSlotProps(components?.['iab-dialog']?.tabPanel, {
		baseClassName: styles.tabPanel,
		noStyle: config.noStyle,
	});
	const specialPurposesProps = mergeSlotProps(
		components?.['iab-dialog']?.specialPurposes,
		{
			baseClassName: styles.specialPurposesSection,
			noStyle: config.noStyle,
		}
	);
	const consentNoticeProps = mergeSlotProps(
		components?.['iab-dialog']?.consentNotice,
		{
			baseClassName: styles.consentNotice,
			noStyle: config.noStyle,
		}
	);
	const footerActionProps = mergeSlotProps(
		components?.['iab-dialog']?.actions,
		{
			baseClassName: actionStyles.actionRoot,
			noStyle: config.noStyle,
		}
	);
	const footerProps = mergeSlotProps(components?.['iab-dialog']?.footer, {
		baseClassName: styles.footer,
		noStyle: config.noStyle,
		...footerActionProps,
	});
	const actionGroupProps = mergeSlotProps(
		components?.['iab-dialog']?.actionGroup,
		{
			baseClassName: actionStyles.actionGroup,
			'data-direction': 'row',
			noStyle: config.noStyle,
		}
	);
	const dialogContent = (
		<ConsentTrackingContext.Provider value={trackingContextValue}>
			<LocalThemeContext.Provider value={config}>
				<SurfaceStyles
					sheets={IAB_DIALOG_SHEETS}
					noStyle={config.noStyle}
				/>
				<IABConsentDialogOverlay isOpen={isOpen} />
				<div
					{...rootProps}
					data-testid="iab-consent-dialog-root"
					dir={textDirection}
				>
					<div
						aria-describedby="iab-consent-dialog-description"
						{...cardProps}
						ref={cardRef}
						aria-label={iabTranslations.preferenceCenter.title}
						aria-modal={config.trapFocus ? 'true' : undefined}
						// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native `dialog` brings the user agent's 1em padding, which the card sets for itself.
						role="dialog"
						{...dialogFocusTargetProps}
						data-testid="iab-consent-dialog-card"
					>
						<div {...headerProps}>
							<div {...headerContentProps}>
								<h2 {...titleProps}>
									{iabTranslations.preferenceCenter.title}
								</h2>
								<p
									{...descriptionProps}
									id="iab-consent-dialog-description"
								>
									{iabTranslations.preferenceCenter.description}
								</p>
							</div>
							<button
								{...closeButtonProps}
								type="button"
								data-testid="iab-consent-dialog-close"
								onClick={handleClose}
								aria-label={common.close}
							>
								<svg
									aria-hidden="true"
									style={{ height: '1rem', width: '1rem' }}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<line
										x1="18"
										y1="6"
										x2="6"
										y2="18"
									/>
									<line
										x1="6"
										y1="6"
										x2="18"
										y2="18"
									/>
								</svg>
							</button>
						</div>

						<Tabs.Root
							{...bodyProps}
							noStyle
							onValueChange={(value) =>
								handleTabChange(value as 'purposes' | 'vendors')
							}
							value={activeTab}
						>
							<div {...tabsProps}>
								<Tabs.List
									{...tabsListProps}
									noStyle
								>
									<Tabs.Trigger
										{...tabTriggerProps}
										noStyle
										value="purposes"
									>
										{iabTranslations.preferenceCenter.tabs.purposes}
										{!isLoading && ` (${purposeTabCount})`}
									</Tabs.Trigger>
									<Tabs.Trigger
										{...tabTriggerProps}
										noStyle
										value="vendors"
									>
										{iabTranslations.preferenceCenter.tabs.vendors}
										{!isLoading && ` (${vendorTabCount})`}
									</Tabs.Trigger>
									<div
										{...tabIndicatorProps}
										aria-hidden="true"
										data-active-tab={activeTab}
									/>
								</Tabs.List>
							</div>

							<div
								{...contentProps}
								ref={contentRef}
							>
								{isLoading ? (
									<div {...loadingProps}>
										<div className={styles.loadingSpinner} />
										<p className={styles.loadingText}>
											{iabTranslations.common.loading}
										</p>
									</div>
								) : (
									<>
										<Tabs.Content
											{...tabPanelProps}
											forceMount
											noStyle
											value="purposes"
										>
											{consentRows.map((row) =>
												row.kind === 'stack' ? (
													<StackItem
														key={row.testId}
														stack={row}
														consents={iabState.purposeConsents}
														onToggle={handlePurposeToggle}
														vendorConsents={iabState.vendorConsents}
														onVendorToggle={handleVendorToggle}
														onVendorClick={handleVendorClick}
														vendorLegitimateInterests={
															iabState.vendorLegitimateInterests
														}
														onVendorLegitimateInterestToggle={
															handleVendorLegitimateInterestToggle
														}
														purposeLegitimateInterests={
															iabState.purposeLegitimateInterests
														}
														onPurposeLegitimateInterestToggle={
															handlePurposeLegitimateInterestToggle
														}
													/>
												) : (
													<PurposeItem
														key={row.testId}
														purpose={row}
														testId={row.testId}
														isEnabled={
															row.toggle === 'special-feature'
																? (iabState.specialFeatureOptIns[row.id] ??
																	false)
																: (iabState.purposeConsents[row.id] ?? false)
														}
														onToggle={(value) => {
															if (row.toggle === 'special-feature') {
																handleSpecialFeatureToggle(row.id, value);
																return;
															}
															handlePurposeToggle(row.id, value);
														}}
														vendorConsents={iabState.vendorConsents}
														onVendorToggle={handleVendorToggle}
														onVendorClick={handleVendorClick}
														vendorLegitimateInterests={
															iabState.vendorLegitimateInterests
														}
														onVendorLegitimateInterestToggle={
															handleVendorLegitimateInterestToggle
														}
														purposeLegitimateInterests={
															row.kind === 'purpose'
																? iabState.purposeLegitimateInterests
																: undefined
														}
														onPurposeLegitimateInterestToggle={
															row.kind === 'purpose'
																? handlePurposeLegitimateInterestToggle
																: undefined
														}
													/>
												)
											)}

											{essentialRows.length > 0 && (
												<div {...specialPurposesProps}>
													<div className={styles.specialPurposesHeader}>
														<button
															type="button"
															aria-expanded={specialPurposesExpanded}
															onClick={() =>
																setSpecialPurposesExpanded(
																	!specialPurposesExpanded
																)
															}
															className={styles.purposeTrigger}
														>
															<svg
																aria-hidden="true"
																className={styles.purposeArrow}
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																strokeWidth="2"
															>
																{specialPurposesExpanded ? (
																	<path d="M19 9l-7 7-7-7" />
																) : (
																	<path d="M9 5l7 7-7 7" />
																)}
															</svg>
															<div className={styles.purposeInfo}>
																<h3 className={styles.specialPurposesTitle}>
																	{
																		iabTranslations.preferenceCenter
																			.specialPurposes.title
																	}
																	<svg
																		aria-hidden="true"
																		className={styles.lockIcon}
																		viewBox="0 0 24 24"
																		fill="none"
																		stroke="currentColor"
																		strokeWidth="2"
																	>
																		<rect
																			x="3"
																			y="11"
																			width="18"
																			height="11"
																			rx="2"
																			ry="2"
																		/>
																		<path d="M7 11V7a5 5 0 0 1 10 0v4" />
																	</svg>
																</h3>
																<p className={styles.purposeMeta}>
																	{essentialPartnerCount}{' '}
																	{essentialPartnerCount === 1
																		? iabTranslations.preferenceCenter
																				.vendorList.partnerSingular
																		: iabTranslations.preferenceCenter
																				.vendorList.partnerPlural}
																</p>
															</div>
														</button>
														<div style={{ position: 'relative' }}>
															<svg
																className={styles.infoIcon}
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																strokeWidth="2"
																aria-label={
																	iabTranslations.preferenceCenter
																		.specialPurposes.tooltip
																}
															>
																<circle
																	cx="12"
																	cy="12"
																	r="10"
																/>
																<line
																	x1="12"
																	y1="16"
																	x2="12"
																	y2="12"
																/>
																<line
																	x1="12"
																	y1="8"
																	x2="12.01"
																	y2="8"
																/>
															</svg>
														</div>
													</div>

													{specialPurposesExpanded && (
														<div style={{ padding: '0.75rem' }}>
															{essentialRows.map((row) => (
																<PurposeItem
																	key={row.testId}
																	purpose={row}
																	testId={row.testId}
																	isEnabled={true}
																	onToggle={() => {
																	}}
																	vendorConsents={iabState.vendorConsents}
																	onVendorToggle={handleVendorToggle}
																	onVendorClick={handleVendorClick}
																	isLocked={true}
																/>
															))}
														</div>
													)}
												</div>
											)}

											{featureRows.length > 0 && (
												<section
													aria-label={
														iabTranslations.preferenceCenter.features.title
													}
													className={
														config.noStyle ? undefined : styles.featuresSection
													}
													data-testid="iab-consent-dialog-features"
												>
													<div
														className={
															config.noStyle ? undefined : styles.featuresHeader
														}
													>
														<h3
															className={
																config.noStyle
																	? undefined
																	: styles.featuresTitle
															}
														>
															{iabTranslations.preferenceCenter.features.title}
														</h3>
														<p
															className={
																config.noStyle
																	? undefined
																	: styles.featuresDescription
															}
														>
															{featuresStandardText ??
																iabTranslations.preferenceCenter.features
																	.description}
														</p>
													</div>
													<div
														className={
															config.noStyle ? undefined : styles.featuresList
														}
													>
														{featureRows.map((row) => (
															<FeatureItem
																key={row.testId}
																feature={row}
																testId={row.testId}
															/>
														))}
													</div>
												</section>
											)}

											<div {...consentNoticeProps}>
												<p className={styles.consentNoticeText}>
													{
														iabTranslations.preferenceCenter.footer
															.consentStorage
													}
												</p>
											</div>
										</Tabs.Content>
										<Tabs.Content
											{...tabPanelProps}
											forceMount
											noStyle
											value="vendors"
										>
											<VendorList
												vendorData={vendorData}
												purposes={purposes}
												vendorConsents={iabState.vendorConsents}
												onVendorToggle={handleVendorToggle}
												selectedVendorId={selectedVendorId}
												onClearSelection={() => setSelectedVendorId(null)}
												customVendors={iabState.nonIABVendors}
												vendorLegitimateInterests={
													iabState.vendorLegitimateInterests
												}
												onVendorLegitimateInterestToggle={
													handleVendorLegitimateInterestToggle
												}
												adTechProviders={iabState.adTechProviders}
												adTechProviderConsents={iabState.adTechProviderConsents}
												onAdTechProviderToggle={handleAdTechProviderToggle}
											/>
										</Tabs.Content>
									</>
								)}
							</div>
						</Tabs.Root>

						<div {...footerProps}>
							<div {...actionGroupProps}>
								<Button.Root
									variant="neutral"
									mode="stroke"
									size="small"
									onClick={handleRejectAll}
									disabled={!banner.isReady}
									data-action="reject"
								>
									{iabTranslations.common.rejectAll}
								</Button.Root>
								<Button.Root
									variant="neutral"
									mode="stroke"
									size="small"
									onClick={handleAcceptAll}
									disabled={!banner.isReady}
									data-action="accept"
								>
									{iabTranslations.common.acceptAll}
								</Button.Root>
							</div>
							<div {...actionGroupProps}>
								<Button.Root
									variant="primary"
									mode="filled"
									size="small"
									onClick={handleSave}
									disabled={isLoading}
									data-action="customize"
								>
									{iabTranslations.common.saveSettings}
								</Button.Root>
							</div>
						</div>

						<Branding
							hideBranding={hideBranding ?? false}
							variant="dialog-tag"
							slotContext="iab-dialog"
							data-testid="iab-consent-dialog-branding"
						/>
					</div>
				</div>
			</LocalThemeContext.Provider>
		</ConsentTrackingContext.Provider>
	);

	const triggerProps: ConsentDialogTriggerProps | null =
		// oxlint-disable-next-line no-nested-ternary -- Preserve established branch order and control flow.
		showTrigger === true
			? // oxlint-disable-next-line no-inline-comments -- Preserve declaration order, interface shape, and public compatibility.
				{}
			: showTrigger === false
				? null
				: showTrigger;

	const triggerElement = triggerProps ? (
		<ConsentDialogTrigger {...triggerProps} />
	) : null;

	if (!isOpen && !isVisible) {
		return triggerElement;
	}

	return (
		<>
			{triggerElement}
			{createPortal(dialogContent, document.body)}
		</>
	);
};
