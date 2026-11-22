# Run the Docker images (published to ghcr.io by the Release workflow) on Azure Container Apps.

resource "azurerm_container_app_environment" "main" {
  name                       = local.names.container_apps_env
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = local.common_tags

  lifecycle {
    # Azure adds a default "Consumption" workload profile by itself; don't fight it.
    ignore_changes = [workload_profile]
  }
}

resource "azurerm_container_app" "backend" {
  name                         = local.names.backend_app
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = local.common_tags

  lifecycle {
    # The Deploy workflow decides which image runs (sha-<commit>); Terraform owns the rest.
    ignore_changes = [template[0].container[0].image]
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }

  # Public HTTPS address. Our student subscription gets an "express" Container Apps
  # environment, which supports neither internal apps nor app-to-app traffic, so the
  # dashboard's nginx reaches the API through this public address like any client.
  ingress {
    external_enabled = true
    target_port      = 8000

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1 # keep one copy running so the demo never waits for a cold start
    max_replicas = 1

    container {
      name   = "backend"
      image  = "${var.image_repository}/backend:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      # The API has a public address here, so writing over HTTP is switched off:
      # devices send through IoT Hub. Invalid requests still get a 422 with the field name.
      env {
        name  = "HTTP_INGEST_ENABLED"
        value = "false"
      }

      liveness_probe {
        transport = "HTTP"
        port      = 8000
        path      = "/health"
      }
    }
  }
}

resource "azurerm_container_app" "frontend" {
  name                         = local.names.frontend_app
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = local.common_tags

  lifecycle {
    # The Deploy workflow decides which image runs (sha-<commit>); Terraform owns the rest.
    ignore_changes = [template[0].container[0].image]
  }

  ingress {
    external_enabled = true
    target_port      = 80

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "frontend"
      image  = "${var.image_repository}/frontend:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      # The backend's public HTTPS address (express environments have no app-to-app
      # networking; the short name and the ".internal" name were tested and don't work).
      # nginx sends this name as the Host header ($proxy_host, Lesson 6), which is how
      # Azure routes the request to the backend.
      env {
        name  = "BACKEND_URL"
        value = "https://${azurerm_container_app.backend.ingress[0].fqdn}"
      }
    }
  }
}

# The ingestor: same backend image, different command. It reads the IoT Hub stream and
# writes to PostgreSQL. No ingress: nothing connects to it, it only connects out.
resource "azurerm_container_app" "ingestor" {
  count                        = var.deploy_ingestor ? 1 : 0
  name                         = "ca-${local.name_prefix}-ingest"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = local.common_tags

  lifecycle {
    # The Deploy workflow decides which image runs (sha-<commit>); Terraform owns the rest.
    ignore_changes = [template[0].container[0].image]
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }

  secret {
    name  = "iothub-events"
    value = "Endpoint=${azurerm_iothub.main.event_hub_events_endpoint};SharedAccessKeyName=${azurerm_iothub_shared_access_policy.ingestor.name};SharedAccessKey=${azurerm_iothub_shared_access_policy.ingestor.primary_key};EntityPath=${azurerm_iothub.main.event_hub_events_path}"
  }

  template {
    min_replicas = 1 # exactly one reader, always on
    max_replicas = 1

    container {
      name  = "ingestor"
      image = "${var.image_repository}/backend:${var.image_tag}"
      # Container Apps appends the image's CMD (uvicorn ...) as arguments to "command".
      # Wrapping in sh -c makes those extra arguments harmless (they become $0, $1, ...).
      command = ["sh", "-c", "exec python -m app.ingest"]
      cpu     = 0.25
      memory  = "0.5Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      env {
        name        = "IOTHUB_EVENTS_CONNECTION_STRING"
        secret_name = "iothub-events"
      }

      env {
        name  = "IOTHUB_CONSUMER_GROUP"
        value = azurerm_iothub_consumer_group.ingestor.name
      }
    }
  }
}
