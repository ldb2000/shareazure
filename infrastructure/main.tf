# Configuration Terraform pour Azure Storage - ShareAzure
terraform {
  required_version = ">= 1.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

# Variables
variable "project_name" {
  description = "Nom du projet (utilisé pour nommer les ressources)"
  type        = string
  default     = "shareazure"
}

variable "resource_group_name" {
  description = "Nom du resource group existant à utiliser"
  type        = string
}

variable "location" {
  description = "Région Azure pour les ressources (doit correspondre au resource group)"
  type        = string
  default     = "francecentral"
}

variable "storage_account_name" {
  description = "Nom du compte de stockage (doit être unique globalement, uniquement minuscules et chiffres)"
  type        = string
}

variable "container_name" {
  description = "Nom du conteneur de blobs"
  type        = string
  default     = "uploads"
}

variable "storage_account_tier" {
  description = "Niveau de performance du compte de stockage (Standard ou Premium)"
  type        = string
  default     = "Standard"
}

variable "storage_replication_type" {
  description = "Type de réplication (LRS, GRS, RAGRS, ZRS)"
  type        = string
  default     = "LRS"
}

variable "allow_blob_public_access" {
  description = "Autoriser l'accès public aux blobs"
  type        = bool
  default     = false
}

variable "min_tls_version" {
  description = "Version TLS minimale"
  type        = string
  default     = "TLS1_2"
}

variable "enable_application_insights" {
  description = "Créer Application Insights pour le monitoring"
  type        = bool
  default     = true
}

# Référencer le resource group existant (ne pas le créer)
data "azurerm_resource_group" "main" {
  name = var.resource_group_name
}

# Storage Account
resource "azurerm_storage_account" "main" {
  name                     = var.storage_account_name
  resource_group_name      = data.azurerm_resource_group.main.name
  location                 = data.azurerm_resource_group.main.location
  account_tier             = var.storage_account_tier
  account_replication_type = var.storage_replication_type
  account_kind             = "StorageV2"
  access_tier              = "Hot"

  # Sécurité
  allow_nested_items_to_be_public = var.allow_blob_public_access
  min_tls_version                 = var.min_tls_version
  https_traffic_only_enabled      = true

  # Chiffrement
  # Note: infrastructure_encryption_enabled ne peut pas être modifié après création
  # Le storage account existant a cette valeur à false
  infrastructure_encryption_enabled = false

  # Soft delete et versioning
  blob_properties {
    delete_retention_policy {
      days = 7
    }
    container_delete_retention_policy {
      days = 7
    }
    versioning_enabled = true
  }


  tags = {
    environment = "production"
    project     = var.project_name
    managed_by  = "terraform"
  }
}

# Container pour les fichiers uploadés
resource "azurerm_storage_container" "uploads" {
  name                  = var.container_name
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Application Insights (optionnel)
resource "azurerm_application_insights" "main" {
  count               = var.enable_application_insights ? 1 : 0
  name                = "appi-${var.project_name}"
  location            = data.azurerm_resource_group.main.location
  resource_group_name = data.azurerm_resource_group.main.name
  application_type    = "web"

  tags = {
    environment = "production"
    project     = var.project_name
    managed_by  = "terraform"
  }
}

# Outputs
output "resource_group_name" {
  description = "Nom du groupe de ressources utilisé"
  value       = data.azurerm_resource_group.main.name
}

output "storage_account_name" {
  description = "Nom du compte de stockage créé"
  value       = azurerm_storage_account.main.name
}

output "storage_account_id" {
  description = "ID du compte de stockage"
  value       = azurerm_storage_account.main.id
}

output "storage_account_primary_connection_string" {
  description = "Chaîne de connexion primaire du compte de stockage"
  value       = azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

output "storage_account_primary_access_key" {
  description = "Clé d'accès primaire du compte de stockage"
  value       = azurerm_storage_account.main.primary_access_key
  sensitive   = true
}

output "storage_account_primary_blob_endpoint" {
  description = "URL du blob endpoint primaire"
  value       = azurerm_storage_account.main.primary_blob_endpoint
}

output "container_name" {
  description = "Nom du conteneur créé"
  value       = azurerm_storage_container.uploads.name
}

output "application_insights_connection_string" {
  description = "Chaîne de connexion Application Insights (si créé)"
  value       = var.enable_application_insights ? azurerm_application_insights.main[0].connection_string : null
  sensitive   = true
}

output "application_insights_instrumentation_key" {
  description = "Clé d'instrumentation Application Insights (si créé)"
  value       = var.enable_application_insights ? azurerm_application_insights.main[0].instrumentation_key : null
  sensitive   = true
}
