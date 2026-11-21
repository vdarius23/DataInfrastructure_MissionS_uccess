# DriveSense — Terraform (Azure)

**Owner:** Member 2 — Infrastructure & DevOps

## Status

| Item | Status |
|---|---|
| Terraform version constraint (`>= 1.6, < 2.0`) | ✅ Implemented |
| `azurerm` provider (`~> 4.0`, locked to 4.81.0) | ✅ Implemented |
| Variables (`project_name`, `environment`, `location`, `subscription_id`, `tags`) with validation | ✅ Implemented |
| Naming convention and common tags (`locals`) | ✅ Implemented |
| Outputs (planned names, tags) | ✅ Implemented |
| `terraform fmt` / `terraform validate` in CI | ⏳ Planned |
| Remote state (Azure Storage backend) | ⏳ Planned |
| Resource group | ⏳ Planned |
| Log Analytics workspace | ⏳ Planned |
| Azure Container Registry | ⏳ Planned |
| Azure Database for PostgreSQL Flexible Server | ⏳ Planned |
| Azure Container Apps environment + backend/frontend apps | ⏳ Planned |

**No Azure resources are created by this configuration.** `terraform apply` currently changes
nothing and costs nothing. DriveSense is **not deployed to Azure yet.**

## Files

| File | Purpose |
|---|---|
| `main.tf` | Terraform/provider requirements, provider config, naming + tagging locals, list of planned resources |
| `variables.tf` | Input variables with validation |
| `outputs.tf` | Outputs |
| `terraform.tfvars.example` | Example variable values (copy to `terraform.tfvars`, which is git-ignored) |
| `.terraform.lock.hcl` | Provider version lock file, committed on purpose |

## Prerequisites (Windows)

```powershell
winget install Hashicorp.Terraform
winget install Microsoft.AzureCLI
terraform -version
```

No local install? Use Docker:

```powershell
docker run --rm -v "${PWD}:/tf" -w /tf hashicorp/terraform:1.9.8 validate
```

## Validate locally (no Azure account needed)

```powershell
cd infrastructure/terraform
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

## Authentication (needed only for `plan`/`apply`)

Option A: Azure CLI (interactive, for developers):

```powershell
az login
az account set --subscription "<subscription-id>"
$env:ARM_SUBSCRIPTION_ID = (az account show --query id -o tsv)
terraform init
terraform plan
```

Option B: Service principal / OIDC (for future CI/CD). Store the values as GitHub
Actions secrets, **never in the repository**:
`ARM_CLIENT_ID`, `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID` (OIDC federated credential preferred
over a client secret).

## Rules for extending

1. Add one resource group of functionality per pull request (e.g. "add resource group + Log Analytics").
2. Use `local.names.*` for names and `tags = local.common_tags` on every resource.
3. Paste the `terraform plan` summary in the PR description.
4. Do not run `terraform apply` against shared subscriptions without team agreement. Prefer the
   cheapest SKUs (Container Apps consumption plan, PostgreSQL Burstable B1ms, ACR Basic) and
   remember to `terraform destroy` after the hackathon.
5. Configure the remote state backend **before** more than one person runs `apply`.
6. Never commit `*.tfstate`, `*.tfvars` or credentials (see `.gitignore`).

## Planned target architecture

```text
Azure Container Registry ──► Container Apps Environment (+ Log Analytics)
                               ├── ca-drivesense-dev-web  (nginx + React, public ingress)
                               └── ca-drivesense-dev-api  (FastAPI)
                                       │
                                       ▼
                        PostgreSQL Flexible Server (psql-drivesense-dev)
```

The frontend container will read the backend address from the `BACKEND_URL` environment
variable, so the same image can be used locally and in Azure.
