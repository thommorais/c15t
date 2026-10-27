import { EmptyState } from '@journ/bloom/empty-state'
import { Spinner } from '@journ/bloom/spinner'
import { Table } from '@journ/bloom/table'
import { Status } from '@thom/pb/realtime'
import { createFileRoute } from '@tanstack/react-router'
import { useConsents } from '../../app/use-consents'

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const formatDate = (date: Date | undefined): string => (date ? dateTime.format(date) : '')

const Consents = () => {
	const state = useConsents()

	if (state.status === Status.Failed) {
		return (
			<EmptyState.Root>
				<EmptyState.Title>Cannot load consents</EmptyState.Title>
				<EmptyState.Description>{state.message}</EmptyState.Description>
			</EmptyState.Root>
		)
	}

	if (state.status !== Status.Ready) {
		return (
			<div className='flex justify-center py-16'>
				<Spinner />
			</div>
		)
	}

	if (state.items.length === 0) {
		return (
			<EmptyState.Root>
				<EmptyState.Title>No consents yet</EmptyState.Title>
				<EmptyState.Description>Consents appear here as visitors give them.</EmptyState.Description>
			</EmptyState.Root>
		)
	}

	return (
		<div className='overflow-x-auto'>
			<Table.Root className='whitespace-nowrap'>
				<Table.Head>
					<Table.Row>
						<Table.Header>Given</Table.Header>
						<Table.Header>Domain</Table.Header>
						<Table.Header>Subject</Table.Header>
						<Table.Header>Action</Table.Header>
						<Table.Header>Jurisdiction</Table.Header>
						<Table.Header>Source</Table.Header>
						<Table.Header>Purposes</Table.Header>
						<Table.Header>Valid until</Table.Header>
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{state.items.map(consent => (
						<Table.Row key={consent.id}>
							<Table.Cell>{formatDate(consent.givenAt)}</Table.Cell>
							<Table.Cell>{consent.domain}</Table.Cell>
							<Table.Cell className='font-mono text-xs'>{consent.subjectId}</Table.Cell>
							<Table.Cell>{consent.action}</Table.Cell>
							<Table.Cell>{consent.jurisdiction}</Table.Cell>
							<Table.Cell>{consent.uiSource}</Table.Cell>
							<Table.Cell>{consent.purposes}</Table.Cell>
							<Table.Cell>{formatDate(consent.validUntil)}</Table.Cell>
						</Table.Row>
					))}
				</Table.Body>
			</Table.Root>
		</div>
	)
}

const ConsentsPage = () => (
	<main className='mx-auto w-full max-w-6xl space-y-6 p-6'>
		<h1 className='font-serif text-xl'>Consents</h1>
		<Consents />
	</main>
)

export const Route = createFileRoute('/_authenticated/')({
	component: ConsentsPage,
})
