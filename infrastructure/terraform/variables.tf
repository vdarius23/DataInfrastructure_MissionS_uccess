variable "project_name" {
  description = "Short project name used in resource names (lowercase letters and digits)."
  type        = string
  default     = "drivesense"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{2,15}$", var.project_name))
    error_message = "project_name must be 3-16 lowercase letters/digits and start with a letter."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "environment must be one of: dev, test, prod."
  }
}

variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "westeurope"
}

variable "subscription_id" {
  description = "Azure subscription ID. Leave null to use ARM_SUBSCRIPTION_ID or the Azure CLI context."
  type        = string
  default     = null
  nullable    = true
}

variable "tags" {
  description = "Additional tags applied to every resource."
  type        = map(string)
  default     = {}
}
