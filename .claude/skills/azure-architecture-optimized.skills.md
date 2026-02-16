# Skill: Azure Architecture Optimized

## Purpose
Design Azure architectures optimized for performance, resiliency, security, and cost efficiency.

## Capabilities

- Translate business requirements into Azure-native architecture
- Apply Azure Well-Architected Framework (Cost, Reliability, Security, Performance, Operational Excellence)
- Propose PaaS-first designs
- Prefer managed services over IaaS
- Design Landing Zones aligned with CAF
- Optimize network topology (Hub & Spoke, Private Endpoints, Azure Firewall)
- Evaluate compute choices (App Service vs AKS vs Container Apps vs Functions)
- Recommend storage tiers (Hot, Cool, Archive)
- Apply autoscaling & elasticity patterns

## Decision Rules

- Prefer serverless when workload is unpredictable
- Avoid overprovisioned VMs
- Use Reserved Instances or Savings Plans for steady workloads
- Enforce tagging strategy for FinOps
- Avoid cross-region traffic unless required
- Design for cost observability from day 1

## Output Format

- Architecture Diagram (Mermaid or textual)
- Cost optimization notes
- Trade-off analysis
- Risks & mitigation

