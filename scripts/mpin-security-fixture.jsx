import React from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import MpinDialog, { MpinSettings } from "../src/components/MpinSecurity"
import ProtectedDownloadDialog from "../src/components/ProtectedDownloadDialog"
import ModalAccessibilityManager from "../src/components/ModalAccessibilityManager"
import OperationStatusProvider from "../src/components/OperationStatusProvider"
import { installGlobalOperationTracking } from "../src/services/operationTracker"
import { authorizeMpin } from "../src/services/mpinService"
import { protectedPost } from "../src/services/protectedDownloadService"
import { postPortalJson } from "../src/services/portalApi"
import "../src/css/App.css"
import "../src/index.css"
import "../src/css/PortalExperience.css"

const fixture = window.__mpinFixture
installGlobalOperationTracking()
const run = async (fn) => { try { await fn() } catch (error) { if (error.name === "AbortError") fixture.cancelled++; else fixture.errors.push(error.message) } }
createRoot(document.getElementById("root")).render(<BrowserRouter><OperationStatusProvider>
	<main style={{ maxWidth: 1000, margin: "auto", padding: 24, fontFamily: "Arial, sans-serif" }}><h1>Student Profile</h1><MpinSettings /><div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
		<button id="apply" onClick={() => run(() => postPortalJson("https://fixture.test", "/workflows/scholarship/apply", { scholarshipId: "fixture" }))}>Apply to scholarship</button>
		<button id="download" onClick={() => run(() => protectedPost("/fixture-download/download", {}))}>Download document</button>
		<button id="verify" onClick={() => run(() => authorizeMpin("/workflows/scholarship/withdraw", {}))}>Withdraw application</button>
	</div></main><MpinDialog /><ProtectedDownloadDialog /><ModalAccessibilityManager />
</OperationStatusProvider></BrowserRouter>)
