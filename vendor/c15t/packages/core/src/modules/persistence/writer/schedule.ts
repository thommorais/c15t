export interface WriteScheduler {
	schedule: () => void;
	flush: () => void;
	cancel: () => void;
}

export const createWriteScheduler = function createWriteScheduler(
	write: () => void
): WriteScheduler {
	let pending = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const cancel = function cancel(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		pending = false;
	};

	return {
		cancel,
		flush() {
			if (!pending) {
				return;
			}
			cancel();
			write();
		},
		schedule() {
			if (pending) {
				return;
			}
			pending = true;
			timer = setTimeout(() => {
				timer = null;
				pending = false;
				write();
			}, 0);
		},
	};
};
