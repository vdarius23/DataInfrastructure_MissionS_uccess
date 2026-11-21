# Outputs currently expose the planned naming/tagging conventions only.
# Real resource outputs (URLs, IDs) will be added together with the resources.

output "environment" {
  description = "Deployment environment."
  value       = var.environment
}

output "location" {
  description = "Azure region."
  value       = var.location
}

output "planned_resource_names" {
  description = "Names that planned resources will use (no resources are created yet)."
  value       = local.names
}

output "common_tags" {
  description = "Tags applied to every resource."
  value       = local.common_tags
}
