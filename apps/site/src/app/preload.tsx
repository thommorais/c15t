'use client'
import ReactDOM from 'react-dom'

type PreloadResourcesProps = {
	assets: string[]
}

const PreloadResources = ({ assets }: PreloadResourcesProps) => {
	for (const asset of assets) {
		ReactDOM.preload(asset, { as: 'image' })
	}

	return null
}

export { PreloadResources }
