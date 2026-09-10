'use client'

import { Avatar } from '@thom/ui/avatar'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '@thom/ui/dropdown'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@thom/ui/navbar'
import {
	Sidebar,
	SidebarBody,
	SidebarFooter,
	SidebarHeader,
	SidebarHeading,
	SidebarItem,
	SidebarLabel,
	SidebarSection,
	SidebarSpacer,
} from '@thom/ui/sidebar'
import { SidebarLayout } from '@thom/ui/sidebar-layout'
import { LocaleSwitcher } from '_/components/features/locale-switcher'
import { Logo } from '_/components/features/logo'
import { Container } from '_/components/ui/container'
import { ROUTES } from '_/constants/routes'
import { LogoutButton } from '_/features/auth/ui/components/logout-button'
import { useAuth } from '_/features/auth/ui/hooks/use-auth'
import { useI18n } from '_/i18n/config-client'
import { tv } from '_/lib/third-party/tv'
import { LogOutIcon } from 'lucide-react'
import NextLink from 'next/link'
import { RedirectType, redirect, usePathname, useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'

const AccountDropdownMenu = ({ anchor }: { anchor: 'top start' | 'bottom end' }) => {
	const t = useI18n()
	const { signOut } = useAuth()
	const router = useRouter()

	const handleLogout = async () => {
		const result = await signOut()
		if (result.success) {
			router.push('/login')
		}
	}

	return (
		<DropdownMenu className='min-w-64' anchor={anchor}>
			<DropdownDivider />
			<DropdownItem onClick={handleLogout}>
				<LogOutIcon data-slot='icon' />
				<DropdownLabel>{t('sign_out')}</DropdownLabel>
			</DropdownItem>
		</DropdownMenu>
	)
}

const _SideBarLink = ({ label, link }: { label: string; link: string }) => {
	const pathname = usePathname()

	return (
		<SidebarItem LinkComponent={NextLink} href={link} current={pathname.endsWith(link)}>
			<SidebarLabel>{label}</SidebarLabel>
		</SidebarItem>
	)
}

const AuthGuard = ({ children }: ComponentProps<'div'>) => {
	const { isAuthenticated, isInitializing } = useAuth()

	if (!isAuthenticated && isInitializing) {
		return null
	}

	if (!isInitializing && !isAuthenticated) {
		return redirect(ROUTES.auth.login, RedirectType.push)
	}

	return children
}

const SidebarBodyWrapper = () => {
	const t = useI18n()

	return (
		<SidebarBody>
			<SidebarSection>
				<SidebarHeading>{t('name')}</SidebarHeading>
			</SidebarSection>

			<SidebarSpacer />

			<SidebarSection>
				<LocaleSwitcher />
				<LogoutButton />
			</SidebarSection>
		</SidebarBody>
	)
}

const DesktopUser = () => {
	const { user } = useAuth()

	return (
		<span className='flex min-w-0 items-center gap-3'>
			<Avatar
				src={user?.avatar}
				initials={user?.name?.charAt(0) || 'U'}
				className='size-10'
				square
				alt={user?.name || 'User'}
			/>
			<span className='min-w-0'>
				<span className='text-primary-900 block truncate text-sm/5 font-medium'>{user?.name || 'User'}</span>
				<span className='text-primary-700 block truncate text-xs/5 font-normal'>
					{user?.email || 'user@example.com'}
				</span>
			</span>
		</span>
	)
}

const MobileUser = () => {
	const { user } = useAuth()

	return (
		<Dropdown>
			<DropdownButton as={NavbarItem}>
				<Avatar src={user?.avatar} initials={user?.name?.charAt(0) || 'U'} square alt={user?.name || 'User'} />
			</DropdownButton>
			<AccountDropdownMenu anchor='bottom end' />
		</Dropdown>
	)
}

const mainContainerStyles = tv({
	base: ['min-h-dvh grid-flow-row-dense auto-rows-max grid-rows-[max-content_1fr] px-2 md:px-4'],
})

const SidebarLayoutWithAuth = ({ children }: Partial<ComponentProps<typeof SidebarLayout>>) => {
	return (
		<SidebarLayout
			navbar={
				<Navbar>
					<NavbarSpacer />
					<NavbarSection>
						<MobileUser />
					</NavbarSection>
				</Navbar>
			}
			sidebar={
				<Sidebar>
					<SidebarHeader>
						<div className='flex items-center gap-3 px-2 py-2'>
							<Logo className='h-8 w-auto' />
						</div>
					</SidebarHeader>

					<SidebarBodyWrapper />

					<SidebarFooter className='max-lg:hidden'>
						<Dropdown>
							<DropdownButton as={SidebarItem}>
								<DesktopUser />
								{/* <ChevronUpIcon data-slot='icon' /> */}
							</DropdownButton>
							{/* <AccountDropdownMenu anchor='top start' /> */}
						</Dropdown>
					</SidebarFooter>
				</Sidebar>
			}
		>
			<AuthGuard>
				<Container asChild>
					<section className={mainContainerStyles()}>{children}</section>
				</Container>
			</AuthGuard>
		</SidebarLayout>
	)
}

export { SidebarLayoutWithAuth }
