# DriveSense — Terraform (Azure)

**Owner:** Member 2 — Infrastructure & DevOps

DriveSense runs on Azure. Everything below is created by this configuration.

**Live dashboard:** https://ca-drivesense-dev-web.purplegrass-72d50f53.francecentral.azurecontainerapps.io

## Status

| Item                                                                         | Status                       |
| ---------------------------------------------------------------------------- | ---------------------------- |
| Terraform version constraint (`>= 1.6, < 2.0`), `azurerm ~> 4.0`, `random`  | Implemented                  |
| Variables with validation, naming convention and common tags (`locals`)      | Implemented                  |
| `terraform fmt` / `terraform validate` in CI                                 | Implemented                  |
| Resource group + Log Analytics workspace (`core.tf`)                         | Implemented, deployed        |
| IoT Hub F1 + consumer group + read-only access policy (`iothub.tf`)          | Implemented, deployed        |
| PostgreSQL Flexible Server + `drivesense` database (`database.tf`)           | Implemented, deployed        |
| Container Apps environment + API, dashboard and ingestor apps (`container_apps.tf`) | Implemented, deployed |
| Images from GitHub Container Registry (published by the Release workflow)    | Implemented                  |
| Remote state (Azure Storage backend)                                         | Planned (state is local)     |
| Automatic deployment from CI (GitHub OIDC)                                   | Planned (deployed by hand)   |
| Private networking between the apps                                          | Planned (see "Azure limits") |

## What runs where

```text
phone / simulator ──MQTT──► IoT Hub  iot-drivesense-dev-<id>         (francecentral)
                                │  Event Hub-compatible stream, consumer group "ingestor"
                                ▼
                      ca-drivesense-dev-ingest  (backend image, python -m app.ingest)
                                │
                                ▼
                      PostgreSQL  psql-drivesense-dev-<id>           (italynorth)
                                ▲
                      ca-drivesense-dev-api     (FastAPI, public HTTPS)
                                ▲  https, via BACKEND_URL
                      ca-drivesense-dev-web     (nginx + React, public HTTPS)  ◄── browser

Container Apps environment cae-drivesense-dev (francecentral) ── logs ──► log-drivesense-dev
```

## Files

| File                       | Purpose                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `main.tf`                  | Terraform/provider requirements, provider config, naming + tagging locals       |
| `variables.tf`             | Input variables (regions, database size, image repository and tag, ingestor on/off) |
| `core.tf`                  | Resource group and Log Analytics workspace (0.5 GB/day cap)                     |
| `iothub.tf`                | IoT Hub, the ingestor's consumer group and its read-only access policy          |
| `database.tf`              | PostgreSQL Flexible Server, database, firewall rule, `DATABASE_URL`             |
| `container_apps.tf`        | Container Apps environment and the three apps                                   |
| `outputs.tf`               | Outputs (dashboard URL, IoT Hub name, PostgreSQL host, ingestor connection string) |
| `terraform.tfvars.example` | Example variable values (copy to `terraform.tfvars`, which is git-ignored)      |
| `.terraform.lock.hcl`      | Provider version lock file, committed on purpose                                |

## Azure limits we hit (and how the code handles them)

Our student subscription has rules a normal subscription doesn't:

- **Two location policies.** The subscription and the university's management group each allow a list of
  regions; only `francecentral` and `italynorth` are on both. Everything runs in `francecentral`.
- **No Burstable PostgreSQL capacity** in either region for this subscription. The server runs in `italynorth`
  on the smallest General Purpose size (`GP_Standard_D2ds_v5`, ~$0.17/hour). About 20 ms extra latency per query.
- **An "express" Container Apps environment.** It supports neither internal apps nor app-to-app traffic, so the
  API has a public HTTPS address and the dashboard's nginx reaches it through that address (`BACKEND_URL`).
- **Container Apps appends the image's `CMD` to `command`.** The ingestor therefore starts with
  `sh -c "exec python -m app.ingest"`, which ignores those extra arguments.
- **Provider auto-registration is off** (`resource_provider_registrations = "none"`). These were registered once:
  `Microsoft.Devices`, `Microsoft.OperationalInsights`, `Microsoft.DBforPostgreSQL`, `Microsoft.App`.

## Prerequisites (Windows)

```powershell
winget install Hashicorp.Terraform
winget install Microsoft.AzureCLI
az extension add --name azure-iot
```

## Validate locally (no Azure account needed)

```powershell
cd infrastructure/terraform
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

## Deploy and redeploy (one operator: the state is local)

```powershell
az login
cd infrastructure\terraform
$env:ARM_SUBSCRIPTION_ID = (az account show --query id -o tsv)
terraform init
$tag = "sha-" + (git rev-parse --short=7 HEAD)     # image published by the Release workflow
terraform plan -var image_tag=$tag -out tfplan
terraform apply tfplan
terraform output dashboard_url
```

Deploying a specific `sha-…` tag (instead of `latest`) makes Azure pull exactly that image, and is also how to
roll back: apply an older tag. Wait until **Actions → Release images** is green for the commit first.
After every apply, back up `terraform.tfstate` outside the repository: it contains the database password.

## Devices

Terraform's Azure provider cannot create IoT Hub devices, so they are registered once with the CLI:

```powershell
$hub = terraform output -raw iothub_name
az iot hub device-identity create --hub-name $hub --device-id sim_01
az iot hub device-identity connection-string show --hub-name $hub --device-id sim_01 -o tsv
az iot hub generate-sas-token --hub-name $hub --device-id phone_01 --du 172800 -o tsv
```

Registered: `sim_01`, `sim_02` (simulator) and `phone_01` (phone app). Connection strings and tokens are
passwords: share them privately, never in Git.

## Rules

1. Paste the `terraform plan` summary in the PR description.
2. Use `local.names.*` for names and `tags = local.common_tags` on every resource.
3. Only the operator who holds the state runs `apply`, until remote state is configured.
4. Never commit `*.tfstate`, `*.tfvars` or credentials (see `.gitignore`).

## After the hackathon

```powershell
terraform destroy
```

This removes everything in `rg-drivesense-dev`: IoT Hub, PostgreSQL, the apps and the logs. Then delete the
device credentials file. Until then, the PostgreSQL server can be paused when nobody needs it:
`az postgres flexible-server stop -g rg-drivesense-dev -n <server>`.
