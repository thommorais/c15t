import { tv } from '_/lib/third-party/tv'

export const authFormStyles = tv({
	slots: {
		heading: 'text-info-700 mb-8 text-center text-3xl font-bold',
		form: 'w-full space-y-6 px-4',
		field: '',
		label: 'text-info-700 mb-2 block text-sm font-medium',
		required: 'text-red-500',
		input: 'w-full rounded-sm',
		error: 'mt-1 text-sm text-red-500',
		submitError: 'rounded-md bg-red-50 p-4',
		submitErrorText: 'text-sm text-red-800',
		button: 'w-full',
	},
	variants: {
		hasError: {
			true: {
				input: 'border-red-500',
			},
			false: {
				input: 'border-info-700/20',
			},
		},
	},
})

export const styles = authFormStyles()
