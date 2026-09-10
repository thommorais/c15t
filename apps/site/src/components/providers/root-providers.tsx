import { IdleQueueProvider } from '_/components/providers/idle-queue-provider'

type Props = {
	children: React.ReactNode
}

const RootProviders = ({ children }: Props) => <IdleQueueProvider>{children}</IdleQueueProvider>

export { RootProviders }
