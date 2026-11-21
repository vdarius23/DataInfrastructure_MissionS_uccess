# Naming/tagging conventions, plus the real resources as they are added.

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

output "resource_group_name" {
  description = "Resource group holding all DriveSense resources."
  value       = azurerm_resource_group.main.name
}

output "dashboard_url" {
  description = "Public URL of the DriveSense dashboard."
  value       = "https://${azurerm_container_app.frontend.ingress[0].fqdn}"
}

output "postgres_fqdn" {
  description = "PostgreSQL server host name."
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "iothub_name" {
  description = "IoT Hub that devices stream to (use with az iot hub device-identity)."
  value       = azurerm_iothub.main.name
}

output "iothub_events_connection_string" {
  description = "Event Hub-compatible connection string the ingestor reads from."
  value       = "Endpoint=${azurerm_iothub.main.event_hub_events_endpoint};SharedAccessKeyName=${azurerm_iothub_shared_access_policy.ingestor.name};SharedAccessKey=${azurerm_iothub_shared_access_policy.ingestor.primary_key};EntityPath=${azurerm_iothub.main.event_hub_events_path}"
  sensitive   = true
}
