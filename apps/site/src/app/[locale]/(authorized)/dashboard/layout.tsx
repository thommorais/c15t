type LocaleLayoutProps = {
	children: React.ReactNode
}

const DashboardLayout = async ({ children }: LocaleLayoutProps) => {
	return <>{children}</>
}

// oxlint-disable-next-line import/no-default-export -- layout
export default DashboardLayout
