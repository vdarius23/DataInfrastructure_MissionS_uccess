# Device telemetry: phones and the simulator stream readings to IoT Hub over MQTT.
# The ingestor service reads them from the hub's built-in Event Hub-compatible endpoint.

# IoT Hub names are global DNS names, so a short suffix derived from the subscription
# keeps ours unique without a random provider.
data "azurerm_client_config" "current" {}

resource "azurerm_iothub" "main" {
  name                = "iot-${local.name_prefix}-${substr(sha1(data.azurerm_client_config.current.subscription_id), 0, 6)}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  sku {
    name     = "F1" # free tier: 8,000 messages per day, one F1 hub per subscription
    capacity = 1
  }

  event_hub_partition_count   = 2 # F1 supports exactly 2 partitions
  event_hub_retention_in_days = 1 # messages wait up to 1 day if the ingestor is down

  tags = local.common_tags
}

# A dedicated reader, so the ingestor does not compete with other tools on $Default.
resource "azurerm_iothub_consumer_group" "ingestor" {
  name                   = "ingestor"
  iothub_name            = azurerm_iothub.main.name
  eventhub_endpoint_name = "events"
  resource_group_name    = azurerm_resource_group.main.name
}

# Least privilege: the ingestor may only read device-to-cloud messages (ServiceConnect).
resource "azurerm_iothub_shared_access_policy" "ingestor" {
  name                = "ingestor"
  resource_group_name = azurerm_resource_group.main.name
  iothub_name         = azurerm_iothub.main.name
  service_connect     = true
}
