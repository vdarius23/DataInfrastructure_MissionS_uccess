# DriveSense - Azure infrastructure foundation.
#
# STATUS: foundation only. This configuration declares the provider, naming and tagging
# conventions. It intentionally creates NO Azure resources yet, so `terraform apply`
# cannot incur cost. Planned resources are listed at the bottom of this file and in README.md.

terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # Planned: remote state in an Azure Storage Account (configure before team-wide applies).
  # backend "azurerm" {
  #   resource_group_name  = "rg-drivesense-tfstate"
  #   storage_account_name = "<globally-unique-name>"
  #   container_name       = "tfstate"
  #   key                  = "drivesense.dev.tfstate"
  # }
}

provider "azurerm" {
  features {}

  # null => taken from the ARM_SUBSCRIPTION_ID environment variable or the Azure CLI login.
  subscription_id = var.subscription_id
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # Naming convention (Azure CAF style): <type>-<project>-<environment>
  names = {
    resource_group     = "rg-${local.name_prefix}"
    container_apps_env = "cae-${local.name_prefix}"
    backend_app        = "ca-${local.name_prefix}-api"
    frontend_app       = "ca-${local.name_prefix}-web"
    postgres_server    = "psql-${local.name_prefix}"
    log_analytics      = "log-${local.name_prefix}"
    container_registry = replace("acr${var.project_name}${var.environment}", "-", "")
  }

  common_tags = merge(
    {
      project     = var.project_name
      environment = var.environment
      managed_by  = "terraform"
    },
    var.tags,
  )
}

# ---------------------------------------------------------------------------------------------
# PLANNED RESOURCES (not implemented - add in small, reviewed pull requests):
#
#   1. azurerm_resource_group                  local.names.resource_group
#   2. azurerm_log_analytics_workspace         local.names.log_analytics
#   3. azurerm_container_registry (Basic)      local.names.container_registry
#   4. azurerm_postgresql_flexible_server      local.names.postgres_server (Burstable B1ms)
#   5. azurerm_container_app_environment       local.names.container_apps_env
#   6. azurerm_container_app (backend, frontend)
#
# Every resource must use local.common_tags. Run `terraform plan` and get the plan reviewed
# before any `terraform apply`.
# ---------------------------------------------------------------------------------------------
