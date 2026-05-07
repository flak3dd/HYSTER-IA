import type { VpsProviderClient, VpsCreateResult, ProviderPreset } from "../types"

/**
 * Azure provider using the Azure Resource Manager REST API.
 *
 * Authentication: Service Principal with client credentials flow.
 * Required env vars: AZURE_SUBSCRIPTION_ID, AZURE_TENANT_ID,
 *                    AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *
 * Resources created per deployment:
 *   - Resource Group (hysteria-<name>)
 *   - Virtual Network + Subnet
 *   - Public IP
 *   - Network Security Group (allows SSH + Hysteria port)
 *   - Network Interface
 *   - Virtual Machine (Ubuntu 24.04 LTS)
 */

const ARM_API = "https://management.azure.com"
const ARM_API_VERSION_COMPUTE = "2024-07-01"
const ARM_API_VERSION_NETWORK = "2024-05-01"
const ARM_API_VERSION_RESOURCES = "2024-07-01"
const LOGIN_URL = "https://login.microsoftonline.com"

type AzureAuth = {
  subscriptionId: string
  tenantId: string
  clientId: string
  clientSecret: string
}

async function getAccessToken(auth: AzureAuth): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    resource: "https://management.azure.com/",
  })
  const res = await fetch(`${LOGIN_URL}/${auth.tenantId}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Azure auth failed (${res.status}): ${text.slice(0, 300)}`)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 60)
}

async function armPut(
  token: string,
  url: string,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(body),
  })
  if (!res.ok && res.status !== 201 && res.status !== 200) {
    const text = await res.text()
    throw new Error(`Azure PUT failed (${res.status}): ${text.slice(0, 400)}`)
  }
  return res.json()
}

async function armGet(token: string, url: string): Promise<unknown> {
  const res = await fetch(url, { headers: headers(token) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Azure GET failed (${res.status}): ${text.slice(0, 400)}`)
  }
  return res.json()
}

export function azureClient(auth: AzureAuth): VpsProviderClient {
  const sub = auth.subscriptionId

  return {
    name: "azure",

    presets(): ProviderPreset {
      return {
        id: "azure",
        label: "Microsoft Azure",
        regions: [
          { id: "eastus", label: "East US (Virginia)" },
          { id: "eastus2", label: "East US 2 (Virginia)" },
          { id: "westus2", label: "West US 2 (Washington)" },
          { id: "westus3", label: "West US 3 (Arizona)" },
          { id: "centralus", label: "Central US (Iowa)" },
          { id: "northeurope", label: "North Europe (Ireland)" },
          { id: "westeurope", label: "West Europe (Netherlands)" },
          { id: "uksouth", label: "UK South (London)" },
          { id: "southeastasia", label: "Southeast Asia (Singapore)" },
          { id: "eastasia", label: "East Asia (Hong Kong)" },
          { id: "japaneast", label: "Japan East (Tokyo)" },
          { id: "australiaeast", label: "Australia East (Sydney)" },
        ],
        sizes: [
          { id: "Standard_B1s", label: "B1s", cpu: 1, ram: "1 GB", disk: "4 GB", price: "~$4/mo" },
          { id: "Standard_B1ms", label: "B1ms", cpu: 1, ram: "2 GB", disk: "4 GB", price: "~$8/mo" },
          { id: "Standard_B2s", label: "B2s", cpu: 2, ram: "4 GB", disk: "8 GB", price: "~$16/mo" },
          { id: "Standard_B2ms", label: "B2ms", cpu: 2, ram: "8 GB", disk: "16 GB", price: "~$30/mo" },
          { id: "Standard_B4ms", label: "B4ms", cpu: 4, ram: "16 GB", disk: "32 GB", price: "~$60/mo" },
          { id: "Standard_D2s_v5", label: "D2s v5", cpu: 2, ram: "8 GB", disk: "Temp", price: "~$70/mo" },
        ],
      }
    },

    async createServer(opts): Promise<VpsCreateResult> {
      const token = await getAccessToken(auth)
      const safeName = sanitizeName(opts.name)
      const location = opts.region

      // Resolve resource group:
      // 1. If user provided one → verify it exists
      // 2. Otherwise → try to find an existing RG in the target location
      //    (creating RGs requires subscription-level write permissions which
      //     many service principals do not have)
      let rgName: string

      if (opts.resourceGroup) {
        try {
          await armGet(
            token,
            `${ARM_API}/subscriptions/${sub}/resourceGroups/${opts.resourceGroup}?api-version=${ARM_API_VERSION_RESOURCES}`,
          )
          rgName = opts.resourceGroup
        } catch {
          throw new Error(
            `Resource group "${opts.resourceGroup}" not found or inaccessible. ` +
            `Please create it first in region "${location}" or pick a different one.`
          )
        }
      } else {
        // List existing resource groups and pick one in the target location
        try {
          const listRes = await fetch(
            `${ARM_API}/subscriptions/${sub}/resourceGroups?api-version=${ARM_API_VERSION_RESOURCES}`,
            { headers: headers(token) }
          )
          if (listRes.ok) {
            const listData = (await listRes.json()) as {
              value?: Array<{ name: string; location: string }>
            }
            const match = listData.value?.find(
              (rg) => rg.location.toLowerCase() === location.toLowerCase()
            )
            if (match) {
              rgName = match.name
            } else {
              const anyRg = listData.value?.[0]
              if (anyRg) {
                rgName = anyRg.name
              } else {
                throw new Error("no_resource_groups")
              }
            }
          } else {
            throw new Error("list_failed")
          }
        } catch {
          throw new Error(
            `Azure deployment requires an existing resource group, and none was found in region "${location}".\n\n` +
            `Action required — choose one:\n` +
            `1. Create a resource group in "${location}" via Azure Portal / CLI, then pass its name as "resourceGroup".\n` +
            `2. Grant this service principal "Contributor" role at the subscription scope so it can create resource groups automatically.`
          )
        }
      }

      // 2. Create Network Security Group (allow SSH + Hysteria port)
      const nsgName = `${safeName}-nsg`
      await armPut(
        token,
        `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/networkSecurityGroups/${nsgName}?api-version=${ARM_API_VERSION_NETWORK}`,
        {
          location,
          properties: {
            securityRules: [
              {
                name: "AllowSSH",
                properties: {
                  protocol: "Tcp",
                  sourcePortRange: "*",
                  destinationPortRange: "22",
                  sourceAddressPrefix: "*",
                  destinationAddressPrefix: "*",
                  access: "Allow",
                  priority: 100,
                  direction: "Inbound",
                },
              },
              {
                name: "AllowHysteria",
                properties: {
                  protocol: "*",
                  sourcePortRange: "*",
                  destinationPortRange: "443",
                  sourceAddressPrefix: "*",
                  destinationAddressPrefix: "*",
                  access: "Allow",
                  priority: 110,
                  direction: "Inbound",
                },
              },
              {
                name: "AllowTrafficStats",
                properties: {
                  protocol: "Tcp",
                  sourcePortRange: "*",
                  destinationPortRange: "25000",
                  sourceAddressPrefix: "*",
                  destinationAddressPrefix: "*",
                  access: "Allow",
                  priority: 120,
                  direction: "Inbound",
                },
              },
            ],
          },
        },
      )

      // 3. Create Virtual Network + Subnet
      const vnetName = `${safeName}-vnet`
      await armPut(
        token,
        `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/virtualNetworks/${vnetName}?api-version=${ARM_API_VERSION_NETWORK}`,
        {
          location,
          properties: {
            addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
            subnets: [
              {
                name: "default",
                properties: {
                  addressPrefix: "10.0.0.0/24",
                  networkSecurityGroup: {
                    id: `/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/networkSecurityGroups/${nsgName}`,
                  },
                },
              },
            ],
          },
        },
      )

      // 4. Create Public IP
      const pipName = `${safeName}-pip`
      await armPut(
        token,
        `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/publicIPAddresses/${pipName}?api-version=${ARM_API_VERSION_NETWORK}`,
        {
          location,
          sku: { name: "Standard" },
          properties: {
            publicIPAllocationMethod: "Static",
            publicIPAddressVersion: "IPv4",
          },
        },
      )

      // 5. Create Network Interface
      const nicName = `${safeName}-nic`
      await armPut(
        token,
        `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/networkInterfaces/${nicName}?api-version=${ARM_API_VERSION_NETWORK}`,
        {
          location,
          properties: {
            ipConfigurations: [
              {
                name: "primary",
                properties: {
                  subnet: {
                    id: `/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/default`,
                  },
                  publicIPAddress: {
                    id: `/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/publicIPAddresses/${pipName}`,
                  },
                  privateIPAllocationMethod: "Dynamic",
                },
              },
            ],
          },
        },
      )

      // 6. Create Virtual Machine
      const vmName = safeName
      await armPut(
        token,
        `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Compute/virtualMachines/${vmName}?api-version=${ARM_API_VERSION_COMPUTE}`,
        {
          location,
          properties: {
            hardwareProfile: { vmSize: opts.size },
            storageProfile: {
              imageReference: {
                publisher: "Canonical",
                offer: "ubuntu-24_04-lts",
                sku: "server",
                version: "latest",
              },
              osDisk: {
                createOption: "FromImage",
                managedDisk: { storageAccountType: "StandardSSD_LRS" },
              },
            },
            osProfile: {
              computerName: vmName,
              adminUsername: "azureuser",
              linuxConfiguration: {
                disablePasswordAuthentication: true,
                ssh: {
                  publicKeys: [
                    {
                      path: "/home/azureuser/.ssh/authorized_keys",
                      keyData: opts.sshKeyContent,
                    },
                  ],
                },
              },
            },
            networkProfile: {
              networkInterfaces: [
                {
                  id: `/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/networkInterfaces/${nicName}`,
                  properties: { primary: true },
                },
              ],
            },
          },
        },
      )

      // The vpsId is the resource group name — we use it to look up and destroy
      return { vpsId: rgName, ip: null }
    },

    async waitForIp(vpsId, timeoutMs = 180_000): Promise<string> {
      const token = await getAccessToken(auth)
      const rgName = vpsId
      const deadline = Date.now() + timeoutMs

      while (Date.now() < deadline) {
        try {
          // List public IPs in the resource group
          const data = (await armGet(
            token,
            `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Network/publicIPAddresses?api-version=${ARM_API_VERSION_NETWORK}`,
          )) as { value: Array<{ properties?: { ipAddress?: string; provisioningState?: string } }> }

          const pip = data.value?.[0]
          if (pip?.properties?.ipAddress && pip.properties.provisioningState === "Succeeded") {
            // Also verify VM is running
            const vmData = (await armGet(
              token,
              `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Compute/virtualMachines?api-version=${ARM_API_VERSION_COMPUTE}`,
            )) as { value: Array<{ name: string }> }

            if (vmData.value?.length > 0) {
              const vmName = vmData.value[0].name
              const instanceView = (await armGet(
                token,
                `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}/providers/Microsoft.Compute/virtualMachines/${vmName}/instanceView?api-version=${ARM_API_VERSION_COMPUTE}`,
              )) as { statuses?: Array<{ code?: string }> }

              const running = instanceView.statuses?.some(
                (s) => s.code === "PowerState/running",
              )
              if (running) return pip.properties.ipAddress
            }
          }
        } catch {
          // retry
        }
        await new Promise((r) => setTimeout(r, 10_000))
      }
      throw new Error("Timed out waiting for Azure VM public IP")
    },

    async destroyServer(vpsId): Promise<void> {
      const token = await getAccessToken(auth)
      const rgName = vpsId
      // Deleting the entire resource group cleans up all resources
      const res = await fetch(
        `${ARM_API}/subscriptions/${sub}/resourceGroups/${rgName}?api-version=${ARM_API_VERSION_RESOURCES}`,
        { method: "DELETE", headers: headers(token) },
      )
      if (!res.ok && res.status !== 202 && res.status !== 204 && res.status !== 404) {
        const text = await res.text()
        throw new Error(`Azure destroy failed (${res.status}): ${text.slice(0, 300)}`)
      }
    },
  }
}
