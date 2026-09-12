import { createContext, useContext } from "react"
import { getCachedPublicConfiguration } from "../services/systemConfigService"

export const PublicConfigurationContext = createContext(getCachedPublicConfiguration())

export const usePublicConfiguration = () => useContext(PublicConfigurationContext) || {}
