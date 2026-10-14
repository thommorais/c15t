# @thom/pb/realtime

`useLiveCollection` reads one page of a PocketBase collection and keeps it in sync over realtime.

## Setup

Add the package to the consumer. `pocketbase` is not a dependency of `@thom/pb`: you pass your own client in.

```json
{
	"dependencies": {
		"@thom/pb": "workspace:*"
	}
}
```

Create one connection per client, at module level. It listens for reconnects so open lists can re-read what they missed.

```ts
import { createConnection } from '@thom/pb/realtime'
import PocketBase from 'pocketbase'

const client = new PocketBase(API_URL)
const connection = createConnection(client.realtime)

export { client, connection }
```

## The source

The adapter describes where the rows come from and how a record becomes a domain entity. The entity must have an `id`.

```ts
import type { LiveSource } from '@thom/pb/realtime'

type IssueRecord = { id: string; title: string; status: string; created: string }
type Issue = { id: string; title: string; status: string }

const issuesSource: LiveSource<IssueRecord, Issue> = {
	client,
	collection: 'issues',
	map: record => ({ id: record.id, title: record.title, status: record.status }),
	connection,
	expand: 'author',
}

export { issuesSource }
```

`expand` is optional. It is sent on the read and on the subscription, so mapped records can use the expanded relations.

Keep the source at module level, or memoize it. A new `client` or `connection` identity on every render reopens the subscription and reloads the page.

## The hook

```tsx
'use client'

import { filterFor } from '@thom/pb/filter-builder'
import { Status, useLiveCollection } from '@thom/pb/realtime'

type IssueColumns = { status: string; title: string }

const Issues = ({ status, search }: { status?: string; search?: string }) => {
	const filter = filterFor<IssueColumns>()([
		{ field: 'status', comparator: 'eq', value: status },
		{ field: 'title', comparator: 'contains', value: search },
	])

	const { state, page, setPage } = useLiveCollection(issuesSource, { filter, sort: '-created', perPage: 20 })

	if (state.status === Status.Loading) return <p>Loading</p>
	if (state.status === Status.Failed) return <p>{state.message}</p>
	if (state.status === Status.Idle) return null

	return (
		<>
			<ul>
				{state.items.map(issue => (
					<li key={issue.id}>{issue.title}</li>
				))}
			</ul>

			<button disabled={page <= 1} onClick={() => setPage(page - 1)}>
				Previous
			</button>
			<button disabled={page >= state.totalPages} onClick={() => setPage(page + 1)}>
				Next
			</button>
		</>
	)
}

export { Issues }
```

### Options

| Option    | Type      | Default | Notes                                                                 |
| --------- | --------- | ------- | --------------------------------------------------------------------- |
| `filter`  | `Filter`  | none    | Output of `filterFor`. Applied to both the read and the subscription. |
| `sort`    | `string`  | none    | PocketBase sort expression, for example `-created`.                   |
| `perPage` | `number`  | `30`    | Page size.                                                            |
| `skip`    | `boolean` | `false` | When `true` nothing is read or subscribed and the status is `idle`.   |

### Result

| Field     | Type                     | Notes                                 |
| --------- | ------------------------ | ------------------------------------- |
| `state`   | `LiveCollectionState<T>` | See below.                            |
| `page`    | `number`                 | Current page, starting at 1.          |
| `perPage` | `number`                 | Page size in use.                     |
| `setPage` | `(page: number) => void` | Not clamped. Guard with `totalPages`. |

`state.status` is one of:

| Status    | Extra fields                        |
| --------- | ----------------------------------- |
| `idle`    | none                                |
| `loading` | none                                |
| `ready`   | `items`, `totalItems`, `totalPages` |
| `failed`  | `message`                           |

## Filters

`filterFor` builds a parameterized filter. Clauses whose value is `undefined`, `null`, `''` or `[]` are dropped, so optional filters can be passed straight through.

| Comparator    | Expression                   |
| ------------- | ---------------------------- |
| `eq`          | `field = value`              |
| `neq`         | `field != value`             |
| `contains`    | `field ~ value`              |
| `gte`         | `field >= value`             |
| `lte`         | `field <= value`             |
| `anyOf`       | `(field = a \|\| field = b)` |
| `containsAll` | `(field ~ a && field ~ b)`   |

The filter can be rebuilt on every render. The hook compares the resolved filter string, not the object.

## Behaviour

- **Pagination** is page based, as in the SDK's `getList(page, perPage)`. The page returns to 1 when the collection, filter, sort or `perPage` changes.
- **Realtime** uses one `*` subscription per collection and filter, kept open across page changes.
- **Every event re-reads the current page.** The SDK only delivers the event. Where a created row lands, and whether an updated row still sorts or filters into the page, is known to the server alone. Bursts of events collapse into one read.
- **Updates and deletes of rows already on the page are applied immediately**, before that read returns.
- **Reconnects** re-read the page, as does the moment the subscription opens.
- **Auto-cancellation is left on.** Each hook instance reads under its own `requestKey`, so a newer read cancels the one it replaces. The cancelled read fails with `isAbort` and is ignored, and the newer one updates the state. A read cancelled with nothing replacing it, as after `pb.cancelAllRequests()`, is read again. Two lists over the same collection do not cancel each other.
- **Entries live outside React state**, in a store from `@thom/pb/store`. A component re-renders only if it read `state` during render, and only when the view changes. Reading just `page` or `setPage` does not subscribe it to the entries.
- **A failed subscription is silent.** The list still loads but will not update live.
