interface SequentialOperation<Value> {
	run: (value: Value) => Promise<void>;
}

export const forEachSequential = async <Value>(
	values: Iterable<Value>,
	operation: SequentialOperation<Value>
): Promise<void> => {
	const iterator = values[Symbol.iterator]();
	const visitNext = async (): Promise<void> => {
		const next = iterator.next();
		if (next.done) {
			return;
		}

		await operation.run(next.value);
		await visitNext();
	};

	await visitNext();
};
