# Fix Node Deployment Issues

## Common Issues and Solutions

### 1. Azure Provider Registration (Most Common)

**Error:** `MissingSubscriptionRegistration` - The subscription is not registered to use namespace 'Microsoft.Compute'

**Fix:**
```bash
# Azure CLI
az provider register --namespace Microsoft.Compute
az provider register --namespace Microsoft.Network

# Or via Portal
# Subscriptions > [Your Subscription] > Resource Providers > Register
```

### 2. Resource Group Not Found

**Error:** `Resource group not found` or authorization errors

**Fix:**
Ensure resource groups are created:
```bash
az group create --name hysteria-rg-eastus --location eastus
az group create --name hysteria-rg-westeurope --location westeurope
az group create --name hysteria-rg-australiaeast --location australiaeast
```

### 3. Service Principal Permissions

**Error:** `AuthorizationFailed` - The client does not have authorization

**Fix:**
```bash
# Get your service principal object ID
az ad sp list --display-name "your-sp-name" --query "[0].id"

# Assign Contributor role to resource groups
az role assignment create \
  --assignee <service-principal-object-id> \
  --role "Contributor" \
  --resource-group hysteria-rg-eastus

az role assignment create \
  --assignee <service-principal-object-id> \
  --role "Contributor" \
  --resource-group hysteria-rg-westeurope

az role assignment create \
  --assignee <service-principal-object-id> \
  --role "Contributor" \
  --resource-group hysteria-rg-australiaeast
```

### 4. Missing Environment Variables

**Required in `.env.local`:**
```env
# Azure
AZURE_SUBSCRIPTION_ID=your-subscription-id
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-service-principal-client-id
AZURE_CLIENT_SECRET=your-service-principal-secret

# Anthropic (for AI assistant)
ANTHROPIC_API_KEY=your-anthropic-key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Panel URL (for node callback)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. AI Assistant Backend Not Responding

**Symptom:** Chat interface loads but no response to messages

**Fix:**
```bash
# Restart the Next.js server to pick up env changes
Ctrl+C
npm run dev
```

### 6. Model Name Issues

**Error:** `model: claude-sonnet-4-20250514` not found

**Fix:** Already fixed in `lib/env.ts` - using `claude-3-5-sonnet-20241022`

### 7. Control Character Sanitization

**Error:** `Validation failed for message.content: Message contains control characters`

**Fix:** Already fixed in `lib/ai/robustness/validation.ts` - enhanced Unicode handling

## Verification Steps

1. **Check Azure Auth:**
```bash
az login --service-principal \
  -u $AZURE_CLIENT_ID \
  -p $AZURE_CLIENT_SECRET \
  --tenant $AZURE_TENANT_ID

az account set --subscription $AZURE_SUBSCRIPTION_ID
az group list
```

2. **Test AI Assistant:**
```bash
# In AI chat, try:
"List all nodes"
"Generate a Hysteria2 config"
"Deploy a node to Azure eastus with resourceGroup hysteria-rg-eastus"
```

3. **Check Logs:**
```bash
# Watch server logs
tail -f logs/app.log
```

## Quick Diagnostic Script

Run this to check your setup:

```bash
#!/bin/bash
echo "Checking Azure setup..."
az account show

echo "Checking resource groups..."
az group list --query "[].name" -o table

echo "Checking provider registration..."
az provider list --query "[?namespace=='Microsoft.Compute' || namespace=='Microsoft.Network'].{name: namespace, state: registrationState}"

echo "Checking env vars..."
echo "AZURE_SUBSCRIPTION_ID: ${AZURE_SUBSCRIPTION_ID:0:8}..."
echo "AZURE_TENANT_ID: ${AZURE_TENANT_ID:0:8}..."
echo "AZURE_CLIENT_ID: ${AZURE_CLIENT_ID:0:8}..."
echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:8}..."
```

## Immediate Fix Commands

Run these in order:

```bash
# 1. Register Azure providers (wait 5-10 minutes after)
az provider register --namespace Microsoft.Compute
az provider register --namespace Microsoft.Network

# 2. Create resource groups
az group create --name hysteria-rg-eastus --location eastus
az group create --name hysteria-rg-westeurope --location westeurope
az group create --name hysteria-rg-australiaeast --location australiaeast

# 3. Assign permissions (replace with your SP object ID)
SP_OBJECT_ID="your-service-principal-object-id"
az role assignment create --assignee $SP_OBJECT_ID --role "Contributor" --resource-group hysteria-rg-eastus
az role assignment create --assignee $SP_OBJECT_ID --role "Contributor" --resource-group hysteria-rg-westeurope
az role assignment create --assignee $SP_OBJECT_ID --role "Contributor" --resource-group hysteria-rg-australiaeast

# 4. Restart the dev server
Ctrl+C
npm run dev
```

## Need Help?

If issues persist:
1. Check `scripts/test-azure-deployment.ts` for detailed error messages
2. Review server logs for stack traces
3. Verify all secrets are correct (no extra spaces/quotes)
