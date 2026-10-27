'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';

export interface AnimatedCollapseProps {
	isOpen: boolean;

	children: ReactNode;

	duration?: number;

	easing?: string;

	className?: string;
}

export const AnimatedCollapse: FC<AnimatedCollapseProps> = ({
	isOpen,
	children,
	duration = 250,
	easing = 'cubic-bezier(0.33, 1, 0.68, 1)',
	className,
}) => {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const animationRef = useRef<number | null>(null);

	const [shouldRender, setShouldRender] = useState(isOpen);
	const [isAnimating, setIsAnimating] = useState(false);

	const [state, setState] = useState<{
		height: number | 'auto';
		overflow: 'hidden' | 'visible';
		transition: string;
	}>({
		height: isOpen ? 'auto' : 0,
		overflow: isOpen ? 'visible' : 'hidden',
		transition: 'none',
	});

	useLayoutEffect(() => {
		const wrapper = wrapperRef.current;
		const content = contentRef.current;
		let setupFrame: number | null = null;
		let transitionFrame: number | null = null;
		let removeTransitionEnd: (() => void) | null = null;

		const prefersReducedMotion = window.matchMedia(
			'(prefers-reduced-motion: reduce)'
		).matches;

		if (prefersReducedMotion) {
			setupFrame = requestAnimationFrame(() => {
				setShouldRender(isOpen);
				setIsAnimating(false);
				setState({
					height: isOpen ? 'auto' : 0,
					overflow: isOpen ? 'visible' : 'hidden',
					transition: 'none',
				});
			});
			return () => {
				if (setupFrame !== null) {
					cancelAnimationFrame(setupFrame);
				}
			};
		}

		if (animationRef.current !== null) {
			cancelAnimationFrame(animationRef.current);
		}

		if (isOpen) {
			setupFrame = requestAnimationFrame(() => {
				setShouldRender(true);
				setIsAnimating(true);

				animationRef.current = requestAnimationFrame(() => {
					const measuredContent = contentRef.current;
					if (!measuredContent) {
						setIsAnimating(false);
						return;
					}

					const naturalHeight = measuredContent.scrollHeight;

					setState({
						height: 0,
						overflow: 'hidden',
						transition: 'none',
					});

					transitionFrame = requestAnimationFrame(() => {
						setState({
							height: naturalHeight,
							overflow: 'hidden',
							transition: `height ${duration}ms ${easing}`,
						});

						const handleTransitionEnd = (e: TransitionEvent) => {
							if (e.propertyName !== 'height') {
								return;
							}
							setState({
								height: 'auto',
								overflow: 'visible',
								transition: 'none',
							});
							setIsAnimating(false);
							wrapper?.removeEventListener(
								'transitionend',
								handleTransitionEnd
							);
							removeTransitionEnd = null;
						};

						if (!wrapper) {
							return;
						}
						wrapper.addEventListener('transitionend', handleTransitionEnd);
						removeTransitionEnd = () =>
							wrapper.removeEventListener('transitionend', handleTransitionEnd);
					});
				});
			});
		} else {
			if (!wrapper || !content) {
				setupFrame = requestAnimationFrame(() => {
					setShouldRender(false);
					setIsAnimating(false);
					setState({
						height: 0,
						overflow: 'hidden',
						transition: 'none',
					});
				});
				return () => {
					if (setupFrame !== null) {
						cancelAnimationFrame(setupFrame);
					}
				};
			}

			const currentHeight = content.scrollHeight;
			setupFrame = requestAnimationFrame(() => {
				setIsAnimating(true);
				setState({
					height: currentHeight,
					overflow: 'hidden',
					transition: 'none',
				});

				animationRef.current = requestAnimationFrame(() => {
					void wrapper.offsetHeight;

					setState({
						height: 0,
						overflow: 'hidden',
						transition: `height ${duration}ms ${easing}`,
					});

					const handleTransitionEnd = (e: TransitionEvent) => {
						if (e.propertyName !== 'height') {
							return;
						}
						setShouldRender(false);
						setIsAnimating(false);
						wrapper.removeEventListener('transitionend', handleTransitionEnd);
						removeTransitionEnd = null;
					};

					wrapper.addEventListener('transitionend', handleTransitionEnd);
					removeTransitionEnd = () =>
						wrapper.removeEventListener('transitionend', handleTransitionEnd);
				});
			});
		}

		return () => {
			if (setupFrame !== null) {
				cancelAnimationFrame(setupFrame);
			}
			if (transitionFrame !== null) {
				cancelAnimationFrame(transitionFrame);
			}
			if (animationRef.current !== null) {
				cancelAnimationFrame(animationRef.current);
			}
			removeTransitionEnd?.();
		};
	}, [isOpen, duration, easing]);

	if (!isOpen && !shouldRender && !isAnimating) {
		return null;
	}

	return (
		<div
			ref={wrapperRef}
			className={className}
			style={{
				height: state.height,
				overflow: state.overflow,
				transition: state.transition,
			}}
		>
			{shouldRender && (
				<div
					ref={contentRef}
					style={{ overflow: 'hidden' }}
				>
					{children}
				</div>
			)}
		</div>
	);
};

AnimatedCollapse.displayName = 'AnimatedCollapse';
