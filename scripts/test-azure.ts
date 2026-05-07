/**
 * Azure Provider Smoke Test
 * Verifies Azure credentials, auth, and resource group permissions
 * without creating any actual resources.
 */

async function testAzure() {
  console.log("=== Azure Provider Smoke Test ===\n")

  const required = [
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
  ]

  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error("Missing env vars:", missing.join(", "))
    process.exit(1)
  }

  console.log("Credentials present: OK")
  console.log(`Subscription: ${process.env.AZURE_SUBSCRIPTION_ID!.slice(0, 8)}...`)
  console.log(`Tenant: ${process.env.AZURE_TENANT_ID!.slice(0, 8)}...`)
  console.log(`Client: ${process.env.AZURE_CLIENT_ID!.slice(0, 8)}...`)

  // Test 1: Auth token
  console.log("\n--- Test 1: Obtain access token ---")
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        resource: "https://management.azure.com/",
      }).toString(),
    }
  )

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    console.error(`Auth FAILED (${tokenRes.status}): ${text.slice(0, 300)}`)
    process.exit(1)
  }

  const tokenData = (await tokenRes.json()) as { access_token: string }
  console.log(`Token obtained: ${tokenData.access_token.slice(0, 20)}...`)
  console.log("Auth: PASS")

  // Test 2: List resource groups (read-only, checks subscription access)
  console.log("\n--- Test 2: List resource groups ---")
  const rgRes = await fetch(
    `https://management.azure.com/subscriptions/${process.env.AZURE_SUBSCRIPTION_ID}/resourceGroups?api-version=2024-07-01`,
    {
      headers: {
        authorization: `Bearer ${tokenData.access_token}`,
        "content-type": "application/json",
      },
    }
  )

  if (!rgRes.ok) {
    const text = await rgRes.text()
    console.error(`List RG FAILED (${rgRes.status}): ${text.slice(0, 400)}`)
    process.exit(1)
  }

  const rgData = (await rgRes.json()) as {
    value?: Array<{ name: string; location: string }>
  }
  const rgs = rgData.value ?? []
  console.log(`Resource groups found: ${rgs.length}`)
  for (const rg of rgs.slice(0, 8)) {
    console.log(`  - ${rg.name} (${rg.location})`)
  }
  if (rgs.length === 0) {
    console.log("\n⚠️  WARNING: No resource groups found.")
    console.log("   Azure deployment will require an existing resource group.")
    console.log("   Create one with: az group create --name hysteria-rg --location eastus")
  }
  console.log("List RG: PASS")

  // Test 3: Check subscription-level write permission (lightweight probe)
  console.log("\n--- Test 3: Check subscription write scope ---")
  const subPermsRes = await fetch(
    `https://management.azure.com/subscriptions/${process.env.AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`,
    {
      headers: {
        authorization: `Bearer ${tokenData.access_token}`,
        "content-type": "application/json",
      },
    }
  )

  if (subPermsRes.ok) {
    const permData = (await subPermsRes.json()) as {
      value?: Array<{ actions: string[]; notActions: string[] }>
    }
    const actions = permData.value?.flatMap((p) => p.actions) ?? []
    const canWriteRG = actions.some(
      (a) => a === "*" || a === "Microsoft.Resources/*" || a === "Microsoft.Resources/subscriptions/resourceGroups/write"
    )
    if (canWriteRG) {
      console.log("Subscription-level RG write: YES (auto-RG creation will work)")
    } else {
      console.log("Subscription-level RG write: NO (must use existing resource groups)")
    }
  } else {
    console.log("Could not check permissions (insufficient scope for Authorization API)")
  }

  console.log("\n=== All tests passed ===")
}

testAzure().catch((err) => {
  console.error("\nUnexpected error:", err instanceof Error ? err.message : String(err))
  process.exit(1)
})
