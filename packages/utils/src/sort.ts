const alfaSort = (aa: string, bb: string) => {
	const a = aa.toLowerCase()
	const b = bb.toLowerCase()
	return a < b ? -1 : a > b ? 1 : 0
}

const numberSort = (a: number, b: number) => a - b

export { alfaSort, numberSort }
