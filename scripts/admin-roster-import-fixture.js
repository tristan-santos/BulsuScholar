// Synthetic full-application fixture. External fetches are intercepted; never sends real mutations.
window.__rosterFixtureReady = (async () => {
	const originalFetch = window.fetch.bind(window)
	const admin = { id: "fixture-admin", role: "full_admin", permissions: ["students", "grantors", "scholarships", "requirements", "announcements", "reports"], fname: "Fixture", lname: "Admin" }
	const grantors = [{id:"fixture-grantor",providerName:"Fixture Foundation",status:"Active"},{id:"inactive-grantor",providerName:"Archived Foundation",archived:true}]
	const tables = { admins:[admin], providers:grantors, grantor_portals:grantors }
	window.__rosterRequests = []
	const json = (data) => new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}})
	window.fetch = async (input,options={}) => {
		const url=new URL(typeof input === "string" ? input : input.url,location.href)
		if(url.origin===location.origin) return originalFetch(input,options)
		const body=typeof options.body === "string" ? JSON.parse(options.body) : {}
		window.__rosterRequests.push({path:url.pathname,body})
		if(url.pathname==="/portal/data/query") {
			let rows=(tables[body.table] || []).map((data)=>({id:data.id,data}))
			if(body.id) rows=rows.filter((r)=>r.id===body.id)
			return json({ok:true,rows})
		}
		if(url.pathname.endsWith("/import/preview")) return json({ok:true,status:"ready",batchId:"fixture-batch",rows:(body.rows || []).map((r)=>({...r,reason:"Ready to import."}))})
		if(url.pathname.endsWith("/import/commit")) return json({ok:true,counts:{created:2,assigned:0}})
		return json({ok:true,actorId:admin.id,actorType:"admin",portal:{},branding:{},notifications:[],conflicts:[],submissions:[]})
	}
	const {setPortalIdentity}=await import("/src/services/portalSessionStorage.js")
	setPortalIdentity(admin.id,"admin")
	localStorage.setItem("bulsuscholar_theme",new URLSearchParams(location.search).has("dark") ? "dark" : "light")
	history.pushState({},"","/admin/scholarships")
})()
