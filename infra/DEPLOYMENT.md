# Deployment Guide

This is the canonical deployment guide for Auto-Apply. It reflects the current setup: single-VM on OCI, Pulumi-managed infrastructure and secrets, Docker Compose on the instance, and push-driven CI with HTTP health checks. No registry usage and no SSH steps in CI.

## Overview

- Infrastructure: Provisioned via Pulumi to OCI (single VM, networking, storage, buckets).
- Secrets: Stored in Pulumi stack configs (dev/prod). CI only needs `PULUMI_ACCESS_TOKEN`.
- Deployment: Pulumi runs remote commands on the instance to clone/pull the repo and run `docker-compose.oci.yml --build`.
- CI/CD: GitHub Actions workflow `.github/workflows/deploy-oci.yml` runs `pulumi preview`/`pulumi up` and then checks health over HTTP using Pulumi outputs.

## One-off Initialization (per environment)

```bash
# Inside infra folder
pulumi stack select prod || pulumi stack init prod

# Run guided configuration (prompts for app keys, provider, SSH keys, etc.)
./setup-env.sh

# If setting keys manually, prefer @file for multi-line PEMs
# Example (after generating):
#   ssh-keygen -t rsa -b 4096 -f ./pulumi_ssh -N ''
#   pulumi config set --stack prod --secret ssh:privateKeyPem @./pulumi_ssh
#   pulumi config set --stack prod ssh:publicKey @./pulumi_ssh.pub

# Deploy
pulumi up --stack prod

# Get outputs (includes instancePublicIp and healthCheckUrl)
pulumi stack output --stack prod --json
```

Notes:
- Prod `deploymentMode` is `git` (see `infra/Pulumi.prod.yaml`).
- The instance writes `/opt/auto-apply/.env` with the app configs from Pulumi.

## CI/CD (push-driven)

Workflow: `.github/workflows/deploy-oci.yml`

What it does:
1) Checkout, install infra deps, setup Pulumi
2) Determine environment (dev on push, manual can choose dev/prod)
3) `pulumi preview` to validate
4) `pulumi up` to provision/update and deploy app on the instance
5) Download stack outputs and HTTP health check: `http://<ip>:8080/health`

Requirements:
- GitHub Secrets: only `PULUMI_ACCESS_TOKEN`
- All provider creds and app secrets live in Pulumi stack configs

## Health Verification

Pulumi exports:

```bash
pulumi stack output --stack <env> --json | jq -r '.healthCheckUrl'
```

CI checks:

```bash
curl -f http://<instance-ip>:8080/health
```

## Troubleshooting

- Preview locally: `cd infra && pulumi preview --stack <env>`
- Show config: `pulumi config --stack <env> --show-secrets`
- Show outputs: `pulumi stack output --stack <env>`
- Health check manually: `curl http://<ip>:8080/health`
- If containers fail: rerun `pulumi up` or SSH to inspect logs (optional operational step)

## Appendix

### What gets deployed

- `docker-compose.oci.yml` with services:
  - `api` (Node/Bun runtime)
  - `pandoc-latex`
  - `puppeteer-mcp`
  - `backup` (profile-enabled)

### Where configs live

- Pulumi configs per environment: `infra/Pulumi.dev.yaml`, `infra/Pulumi.prod.yaml`
- Infrastructure code: `infra/index.ts`
- Environment template examples: `env.oci.template`, `env.production.template`
