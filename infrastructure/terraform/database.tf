# Managed PostgreSQL for the backend and the ingestor.

# Server names are global DNS names, so add a short random suffix to avoid clashes.
resource "random_string" "suffix" {
  length  = 5
  upper   = false
  special = false
}

# Letters and digits only, because the password is embedded in DATABASE_URL.
resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                          = local.names.postgres_server
  resource_group_name           = azurerm_resource_group.main.name
  location                      = var.postgres_location
  version                       = "16"
  sku_name                      = var.postgres_sku
  storage_mb                    = 32768
  backup_retention_days         = 7
  administrator_login           = "drivesense"
  administrator_password        = random_password.postgres.result
  public_network_access_enabled = true
  tags                          = local.common_tags

  lifecycle {
    # Azure picks an availability zone; do not try to move the server afterwards.
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = "drivesense"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# 0.0.0.0 to 0.0.0.0 is the Azure rule for "allow other Azure services",
# which lets Container Apps connect. The rest of the internet stays blocked.
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

locals {
  database_url = format(
    "postgresql+psycopg://%s:%s@%s:5432/%s?sslmode=require",
    azurerm_postgresql_flexible_server.main.administrator_login,
    random_password.postgres.result,
    azurerm_postgresql_flexible_server.main.fqdn,
    azurerm_postgresql_flexible_server_database.app.name,
  )
}
