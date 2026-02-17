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
  workspace_id        = "/subscriptions/011ab966-2d51-4b9b-a5f2-397425614082/resourceGroups/ai_appi-shareazure_263150ad-caec-4036-8a48-c46512056653_managed/providers/Microsoft.OperationalInsights/workspaces/managed-appi-shareazure-ws"

  tags = {
    environment = "production"
    project     = var.project_name
    managed_by  = "terraform"
  }
}

# Azure Cognitive Services — Computer Vision (optionnel)
variable "enable_cognitive_services" {
  description = "Créer Azure Cognitive Services (Computer Vision) pour l'IA"
  type        = bool
  default     = true
}

variable "cognitive_services_sku" {
  description = "SKU pour Cognitive Services (F0 = gratuit, S1 = standard)"
  type        = string
  default     = "S1"
}

resource "azurerm_cognitive_account" "vision" {
  count               = var.enable_cognitive_services ? 1 : 0
  name                = "cog-${var.project_name}"
  location            = data.azurerm_resource_group.main.location
  resource_group_name = data.azurerm_resource_group.main.name
  kind                = "ComputerVision"
  sku_name            = var.cognitive_services_sku

  tags = {
    environment = "production"
    project     = var.project_name
    managed_by  = "terraform"
  }
}

# ─── Azure OpenAI Service ───────────────────────────────────
variable "enable_openai" {
  description = "Créer Azure OpenAI Service (GPT-4o, Whisper)"
  type        = bool
  default     = true
}

variable "openai_sku" {
  description = "SKU pour Azure OpenAI (S0 = standard)"
  type        = string
  default     = "S0"
}

variable "openai_location" {
  description = "Région pour Azure OpenAI GPT-4o"
  type        = string
  default     = "francecentral"
}

variable "whisper_location" {
  description = "Région pour Whisper (westeurope si indisponible en francecentral)"
  type        = string
  default     = "westeurope"
}

resource "azurerm_cognitive_account" "openai" {
  count               = var.enable_openai ? 1 : 0
  name                = "oai-${var.project_name}"
  location            = var.openai_location
  resource_group_name = data.azurerm_resource_group.main.name
  kind                = "OpenAI"
  sku_name            = var.openai_sku

  tags = {
    environment = "production"
    project     = var.project_name
    managed_by  = "terraform"
  }
}

# Déploiement du modèle GPT-4o
resource "azurerm_cognitive_deployment" "gpt4o" {
  count                = var.enable_openai ? 1 : 0
  name                 = "gpt-4o"
  cognitive_account_id = azurerm_cognitive_account.openai[0].id

  model {
    format  = "OpenAI"
    name    = "gpt-4o"
    version = "2024-11-20"
  }

  scale {
    type     = "Standard"
    capacity = 10
  }
}

# Compte OpenAI séparé pour Whisper (westeurope)
resource "azurerm_cognitive_account" "whisper" {
  count               = var.enable_openai ? 1 : 0
  name                = "oai-${var.project_name}-whisper"
  location            = var.whisper_location
  resource_group_name = data.azurerm_resource_group.main.name
  kind                = "OpenAI"
  sku_name            = var.openai_sku

  tags = {
    environment = "production"
    project     = var.project_name
    managed_by  = "terraform"
  }
}

# Déploiement du modèle Whisper
resource "azurerm_cognitive_deployment" "whisper" {
  count                = var.enable_openai ? 1 : 0
  name                 = "whisper"
  cognitive_account_id = azurerm_cognitive_account.whisper[0].id

  model {
    format  = "OpenAI"
    name    = "whisper"
    version = "001"
  }

  scale {
    type     = "Standard"
    capacity = 1
  }
}

# ─── Azure AI Search (pour recherche sémantique avancée) ────
variable "enable_ai_search" {
  description = "Créer Azure AI Search pour la recherche sémantique"
  type        = bool
  default     = false
}

variable "ai_search_sku" {
  description = "SKU pour Azure AI Search (free, basic, standard)"
  type        = string
  default     = "free"
}

resource "azurerm_search_service" "main" {
  count               = var.enable_ai_search ? 1 : 0
  name                = "srch-${var.project_name}"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = data.azurerm_resource_group.main.location
  sku                 = var.ai_search_sku

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

output "cognitive_services_endpoint" {
  description = "Endpoint Azure Cognitive Services Computer Vision (-> AZURE_VISION_ENDPOINT)"
  value       = var.enable_cognitive_services ? azurerm_cognitive_account.vision[0].endpoint : null
}

output "cognitive_services_key" {
  description = "Clé primaire Azure Cognitive Services (-> AZURE_VISION_KEY)"
  value       = var.enable_cognitive_services ? azurerm_cognitive_account.vision[0].primary_access_key : null
  sensitive   = true
}

# ─── Azure OpenAI Outputs ───
output "openai_endpoint" {
  description = "Endpoint Azure OpenAI (-> OPENAI_API_BASE ou AZURE_OPENAI_ENDPOINT)"
  value       = var.enable_openai ? azurerm_cognitive_account.openai[0].endpoint : null
}

output "openai_key" {
  description = "Clé primaire Azure OpenAI (-> OPENAI_API_KEY)"
  value       = var.enable_openai ? azurerm_cognitive_account.openai[0].primary_access_key : null
  sensitive   = true
}

output "whisper_endpoint" {
  description = "Endpoint Azure OpenAI Whisper (westeurope)"
  value       = var.enable_openai ? azurerm_cognitive_account.whisper[0].endpoint : null
}

output "whisper_key" {
  description = "Clé Azure OpenAI Whisper"
  value       = var.enable_openai ? azurerm_cognitive_account.whisper[0].primary_access_key : null
  sensitive   = true
}

# ─── Azure AI Search Outputs ───
output "ai_search_endpoint" {
  description = "Endpoint Azure AI Search (si créé)"
  value       = var.enable_ai_search ? "https://${azurerm_search_service.main[0].name}.search.windows.net" : null
}

output "ai_search_key" {
  description = "Clé primaire Azure AI Search (si créé)"
  value       = var.enable_ai_search ? azurerm_search_service.main[0].primary_key : null
  sensitive   = true
}

# ─── .env template complet ───
output "env_template" {
  description = "Template .env pour le backend avec toutes les valeurs"
  value       = <<-EOT
# === Azure Storage ===
AZURE_STORAGE_ACCOUNT_NAME=${azurerm_storage_account.main.name}
AZURE_STORAGE_ACCOUNT_KEY=${azurerm_storage_account.main.primary_access_key}
AZURE_STORAGE_CONNECTION_STRING=${azurerm_storage_account.main.primary_connection_string}
AZURE_CONTAINER_NAME=${azurerm_storage_container.uploads.name}

# === Serveur ===
PORT=3000
NODE_ENV=production
MAX_FILE_SIZE_MB=100

# === Application Insights ===
APPLICATIONINSIGHTS_CONNECTION_STRING=${var.enable_application_insights ? azurerm_application_insights.main[0].connection_string : ""}

# === Azure Computer Vision ===
AZURE_VISION_ENDPOINT=${var.enable_cognitive_services ? azurerm_cognitive_account.vision[0].endpoint : ""}
AZURE_VISION_KEY=${var.enable_cognitive_services ? azurerm_cognitive_account.vision[0].primary_access_key : ""}

# === OpenAI GPT-4o (francecentral) ===
OPENAI_API_KEY=${var.enable_openai ? azurerm_cognitive_account.openai[0].primary_access_key : ""}
OPENAI_API_BASE=${var.enable_openai ? azurerm_cognitive_account.openai[0].endpoint : ""}
OPENAI_MODEL=gpt-4o

# === Whisper (westeurope) ===
WHISPER_API_KEY=${var.enable_openai ? azurerm_cognitive_account.whisper[0].primary_access_key : ""}
WHISPER_API_BASE=${var.enable_openai ? azurerm_cognitive_account.whisper[0].endpoint : ""}
OPENAI_WHISPER_MODEL=whisper

# === CORS ===
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000
EOT
  sensitive   = true
}
