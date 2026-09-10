import { ENVS } from '_/constants'
import { logger } from '_/lib/logger'
import { type NextRequest, NextResponse } from 'next/server'
import webpush, { type PushSubscription } from 'web-push'

type Notification = { message: string; subscription: PushSubscription }

export async function POST(req: NextRequest): Promise<Response> {
	try {
		webpush.setVapidDetails('mailto:inboxdothom@gmail.com', ENVS.NEXT_PUBLIC_VAPID_PUBLIC_KEY, ENVS.VAPID_PRIVATE_KEY)

		let body: Notification
		try {
			body = (await req.json()) as Notification
		} catch (error) {
			logger.warn('Invalid JSON body for notification request', error)
			return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
		}

		const { subscription, message } = body ?? {}

		if (!subscription) {
			return NextResponse.json({ message: 'Missing subscription' }, { status: 400 })
		}

		if (!message) {
			return NextResponse.json({ message: 'Missing message' }, { status: 400 })
		}

		await webpush.sendNotification(subscription, JSON.stringify({ title: 'Test Notification', body: message }))

		return NextResponse.json({ body: 'notification sent' }, { status: 200, statusText: 'Success' })
	} catch (error) {
		logger.error('Failed to send notification', error)
		return NextResponse.json(
			{
				message: 'Failed to send notification',
			},
			{ status: 500 },
		)
	}
}
