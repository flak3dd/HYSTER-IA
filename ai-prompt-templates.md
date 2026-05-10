# AI Assistant Prompt Templates

## Deploy Node Template

```
Deploy a new Azure VM with provider azure, region eastus, resourceGroup hysteria-rg-eastus, name hysteria-east-01, tags [c2, azure, eastus]
```

### Shorthand Variations (also work)

```
Deploy azure node in eastus, rg hysteria-rg-eastus, name hysteria-east-01
```

```
Create new node: azure, eastus, hysteria-rg-eastus, hysteria-east-01, tags [c2, prod]
```

## Deploy to Other Regions

**West Europe:**
```
Deploy azure node in westeurope, rg hysteria-rg-westeurope, name hysteria-west-01, tags [c2, eu]
```

**Australia East:**
```
Deploy azure node in australiaeast, rg hysteria-rg-australiaeast, name hysteria-au-01, tags [c2, apac]
```

## Check Prerequisites

```
Check prerequisites for deploying azure node to eastus in resource group hysteria-rg-eastus
```

## List Deployments

```
List all my node deployments
```

## Troubleshoot

```
Troubleshoot deployment failure for node hysteria-east-01
```

---

*These templates use natural language that the AI assistant parses using structured LLM extraction (no regex).*