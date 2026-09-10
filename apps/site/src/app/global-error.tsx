'use client'

import { Button } from '@thom/ui/button'
import { Card, CardFooter, CardHeader } from '@thom/ui/card'
import { Container } from '_/components/ui/container'

function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		// global-error must include html and body tags
		<html lang='en'>
			<body className='bg-porcelain'>
				<Container asChild>
					<section className='h-dvh place-items-center'>
						<Card className='w-full max-w-sm'>
							<CardHeader className='w-full'>
								<h2 className='text-danger-700 w-full grow text-center'>Something went wrong!</h2>
							</CardHeader>
							<CardFooter className='justify-center'>
								<Button type='button' variant='outline' color='info' onClick={() => reset()}>
									Try again
								</Button>
							</CardFooter>
						</Card>
					</section>
				</Container>
			</body>
		</html>
	)
}

// oxlint-disable-next-line import/no-default-export -- page
export default GlobalError
