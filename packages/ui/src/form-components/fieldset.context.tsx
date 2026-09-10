import type React from 'react'
import { createContext, useContext } from 'react'

// disabled context
const DisabledContext = createContext<boolean | undefined>(undefined)
type DisabledContextProps = React.PropsWithChildren<{ value?: boolean }>
const useDisabled = () => useContext(DisabledContext)
const DisabledProvider = ({ value, children }: DisabledContextProps) => (
	<DisabledContext.Provider value={value}>{children}</DisabledContext.Provider>
)

// IdContext
const IdContext = createContext<string | undefined>(undefined)
type IdContextProps = React.PropsWithChildren<{ id: string }>
const useProvidedId = () => useContext(IdContext)
const IdProvider = ({ id, children }: IdContextProps) => <IdContext.Provider value={id}>{children}</IdContext.Provider>

// labelContext
const LabelContext = createContext<string | undefined>(undefined)
type labelContextProps = React.PropsWithChildren<{ label: string }>
const useProvidedLabel = () => useContext(LabelContext)
const LabelProvider = ({ label, children }: labelContextProps) => (
	<LabelContext.Provider value={label}>{children}</LabelContext.Provider>
)

export { DisabledProvider, IdContext, IdProvider, LabelProvider, useDisabled, useProvidedId, useProvidedLabel }
