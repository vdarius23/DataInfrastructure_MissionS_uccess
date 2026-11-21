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
  default     = "francecentral"
}

variable "postgres_location" {
  description = "Region for PostgreSQL. Student subscriptions get no Burstable capacity in some allowed regions."
  type        = string
  default     = "italynorth"
}

variable "postgres_sku" {
  description = "PostgreSQL Flexible Server size. The student subscription gets no Burstable (B1ms/B2s) capacity in francecentral or italynorth, so this is the smallest General Purpose size. Stop or destroy the server when it is not needed."
  type        = string
  default     = "GP_Standard_D2ds_v5"
}

variable "image_repository" {
  description = "Where CI publishes the images (lowercase). The packages are public, so no registry login is needed."
  type        = string
  default     = "ghcr.io/vdarius23/datainfrastructure_missions_uccess"
}

variable "image_tag" {
  description = "Image tag to deploy: latest, or sha-1a2b3c4 to pin or roll back to one commit."
  type        = string
  default     = "latest"
}

variable "deploy_ingestor" {
  description = "Run the IoT Hub ingestor app. Needs a backend image that contains app.ingest."
  type        = bool
  default     = false
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
