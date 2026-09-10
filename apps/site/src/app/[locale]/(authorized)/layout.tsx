import { SidebarLayoutWithAuth } from '_/app/[locale]/(authorized)/sidebar-layout'

type AuthorizedLayoutProps = {
	children: React.ReactNode
}

const AuthorizedLayout = ({ children }: AuthorizedLayoutProps) => {
	return <SidebarLayoutWithAuth>{children}</SidebarLayoutWithAuth>
}

// oxlint-disable-next-line import/no-default-export -- Next.js layout requirement
export default AuthorizedLayout
