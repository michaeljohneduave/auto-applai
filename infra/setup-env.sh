#!/bin/bash

# Auto-Apply OCI Environment Setup Script
# This script helps you configure all required environment variables in Pulumi

set -e

echo "🚀 Auto-Apply OCI Environment Setup"
echo "=================================="
echo ""

# Optional flags
FORCE=false
if [ "${1:-}" = "--force" ] || [ "${1:-}" = "-f" ]; then
    FORCE=true
    shift || true
fi

# Check if we're in the right directory
if [ ! -f "Pulumi.yaml" ]; then
    echo "❌ Error: Please run this script from the infrastructure directory"
    exit 1
fi

echo "This script will help you configure all required environment variables for your Auto-Apply deployment."
echo ""

# Ensure a Pulumi stack is selected (or create one)
STACK_NAME=$(pulumi stack --show-name 2>/dev/null || true)
if [ -z "$STACK_NAME" ]; then
    echo "❗ No active Pulumi stack detected."
    read -p "   Enter stack name to use/create [dev/prod/custom] (default: dev): " REQ_STACK
    REQ_STACK=${REQ_STACK:-dev}
    if pulumi stack select "$REQ_STACK" >/dev/null 2>&1; then
        STACK_NAME=$REQ_STACK
    else
        echo "   Creating stack '$REQ_STACK'..."
        pulumi stack init "$REQ_STACK"
        STACK_NAME=$REQ_STACK
    fi
fi
echo "🗂️  Using Pulumi stack: $STACK_NAME"

# Check if a Pulumi config key already exists
has_cfg() {
    local ns=$1
    local key=$2
    local full_key
    if [ -n "$ns" ]; then
        full_key="$ns:$key"
    else
        full_key="$key"
    fi
    if pulumi config get --stack "$STACK_NAME" "$full_key" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Prompt helper that targets a specific Pulumi namespace (e.g., app, oci, ssh)
prompt_cfg() {
    local ns=$1
    local key=$2
    local description=$3
    local is_secret=$4
    local default_value=$5

    local full_key display_key
    if [ -n "$ns" ]; then
        full_key="$ns:$key"
        display_key="$ns:$key"
    else
        full_key="$key"
        display_key="$key"
    fi

    echo ""
    echo "📝 $description"
    if [ -n "$default_value" ]; then
        echo "   Default: $default_value"
    fi

    # If value exists and not forcing, offer to keep
    if [ "$FORCE" != "true" ] && has_cfg "$ns" "$key"; then
        if [ "$is_secret" = "true" ]; then
            read -p "   Found existing $display_key (secret). Keep existing? [Y/n]: " keep
        else
            current_val=$(pulumi config get --stack "$STACK_NAME" "$full_key" 2>/dev/null || true)
            read -p "   Found existing $display_key (current: $current_val). Keep existing? [Y/n]: " keep
        fi
        keep=${keep:-Y}
        if [[ "$keep" =~ ^[Yy]$ ]]; then
            echo "   ✅ Keeping existing $display_key"
            return
        fi
    fi

    read -p "   Enter value for $display_key: " input_value

    if [ -z "$input_value" ] && [ -n "$default_value" ]; then
        input_value=$default_value
    fi

    if [ -z "$input_value" ]; then
        echo "   ⚠️  Skipping $display_key (set later with: pulumi config set ${is_secret:+--secret }$full_key <value>)"
        return
    fi

    if [ "$is_secret" = "true" ]; then
        echo "   🔐 Setting $display_key as secret..."
        pulumi config set --secret --stack "$STACK_NAME" "$full_key" "$input_value"
    else
        echo "   ⚙️  Setting $display_key..."
        pulumi config set --stack "$STACK_NAME" "$full_key" "$input_value"
    fi
}

echo "🔐 Setting up SECRETS (API Keys and sensitive data)..."
echo "   These will be encrypted and stored securely in Pulumi."

prompt_cfg "app" "GEMINI_API_KEY" "Google Gemini API Key (required for AI features)" "true"
prompt_cfg "app" "OPENAI_API_KEY" "OpenAI API Key (optional, used if configured)" "true"
prompt_cfg "app" "XAI_API_KEY" "xAI (Grok) API Key (optional)" "true"
prompt_cfg "app" "CLERK_SECRET_KEY" "Clerk Secret Key (required for authentication)" "true"

echo ""
echo "⚙️  Setting up CONFIGURATION (public settings)..."
echo "   These will be stored in plain text in Pulumi config."

prompt_cfg "app" "CLERK_PUBLISHABLE_KEY" "Clerk Publishable Key (public, starts with pk_)" "false"
prompt_cfg "app" "PUPPETEER_SERVICE_URL" "Puppeteer service URL (internal Docker network)" "false" "http://puppeteer-mcp:80"
prompt_cfg "app" "PDF_SERVICE_URL" "PDF service URL (internal Docker network)" "false" "http://pandoc-latex:80"
prompt_cfg "app" "API_PORT" "API port for the application" "false" "8080"

echo ""
echo "🧩 Project & deployment settings (used by infra/index.ts)"
# Sensible defaults based on stack name
if [ "$STACK_NAME" = "prod" ]; then
    DEF_OCPUS="2"
    DEF_MEM_GB="12"
    DEF_BOOT_GB="100"
else
    DEF_OCPUS="1"
    DEF_MEM_GB="6"
    DEF_BOOT_GB="50"
fi

prompt_cfg "" "projectName" "Project name (used for resource prefix)" "false" "autoapply"
prompt_cfg "" "environment" "Deployment environment (matches stack name)" "false" "$STACK_NAME"
prompt_cfg "" "repo" "Git repository URL for git-based deployment" "false" "https://github.com/michaeljohneduave/auto-applai"
prompt_cfg "" "deploymentMode" "Deployment mode [git|registry]" "false" "git"
prompt_cfg "" "instanceShape" "OCI instance shape" "false" "VM.Standard.A1.Flex"
prompt_cfg "" "ocpus" "OCI instance OCPUs" "false" "$DEF_OCPUS"
prompt_cfg "" "memoryInGBs" "OCI instance memory (GB)" "false" "$DEF_MEM_GB"
prompt_cfg "" "bootVolumeSizeInGBs" "Boot volume size (GB)" "false" "$DEF_BOOT_GB"

echo ""
echo "🌐 Setting up OCI PROVIDER configuration..."
prompt_cfg "oci" "region" "OCI region (e.g., us-ashburn-1)" "false" "us-ashburn-1"
prompt_cfg "oci" "compartmentId" "OCI Compartment OCID (project setting, default namespace)" "false"
prompt_cfg "oci" "tenancyOcid" "OCI Tenancy OCID" "false"
prompt_cfg "oci" "userOcid" "OCI User OCID" "false"
prompt_cfg "oci" "fingerprint" "OCI API key fingerprint" "false"

# Prompt for OCI API private key (PEM) and store as Pulumi secret
echo ""
echo "🔐 OCI API private key (PEM)"
if [ "$FORCE" = "true" ] || ! has_cfg "oci" "privateKey"; then
    read -p "   Path to OCI API private key PEM (e.g., ~/.oci/oci_api_key.pem): " oci_key_path
    if [ -n "$oci_key_path" ] && [ -f "$oci_key_path" ]; then
        echo "   🔐 Storing oci:privateKey as Pulumi secret"
        pulumi config set --secret --stack "$STACK_NAME" oci:privateKey "$(cat "$oci_key_path")"
    else
        echo "   ⚠️  Skipping oci:privateKey (set later with: pulumi config set --secret oci:privateKey \"<PEM CONTENT>\")"
    fi
else
    echo "   ✅ Keeping existing oci:privateKey"
fi

echo ""
echo "🔑 SSH KEY configuration for Pulumi remote commands..."
read -p "   Generate a new SSH keypair for this project (ed25519)? (y/N): " gen_key
gen_key=${gen_key:-N}
if [[ "$gen_key" =~ ^[Yy]$ ]]; then
    keyfile="./pulumi_ssh_ed25519"
    if [ -f "$keyfile" ]; then
        echo "   Existing $keyfile found; skipping generation."
    else
        echo "   Generating $keyfile (ed25519) ..."
        ssh-keygen -t ed25519 -C "auto-apply-deploy" -f "$keyfile" -N ''
    fi
    if [ "$FORCE" = "true" ] || ! has_cfg "ssh" "privateKeyPemB64"; then
        echo "   🔐 Storing SSH private key (base64) in Pulumi secrets (ssh:privateKeyPemB64)"
        pk_b64=$(base64 -w 0 "$keyfile")
        pulumi config set --secret --stack "$STACK_NAME" ssh:privateKeyPemB64 "$pk_b64"
    else
        echo "   ✅ Keeping existing ssh:privateKeyPemB64"
    fi
    if [ "$FORCE" = "true" ] || ! has_cfg "ssh" "publicKey"; then
        echo "   ⚙️  Storing SSH public key (ssh:publicKey)"
        pulumi config set --stack "$STACK_NAME" ssh:publicKey "$(cat "$keyfile.pub")"
    else
        echo "   ✅ Keeping existing ssh:publicKey"
    fi
else
    default_pvt="./pulumi_ssh_ed25519"
    read -p "   Path to existing private key (default: $default_pvt): " pvt
    pvt=${pvt:-$default_pvt}
    pub_guess="$pvt.pub"
    if [ "$FORCE" = "true" ] || ! has_cfg "ssh" "privateKeyPemB64"; then
        echo "   🔐 Storing SSH private key (base64) in Pulumi secrets (ssh:privateKeyPemB64)"
        pk_b64=$(base64 -w 0 "$pvt")
        pulumi config set --secret --stack "$STACK_NAME" ssh:privateKeyPemB64 "$pk_b64"
    else
        echo "   ✅ Keeping existing ssh:privateKeyPemB64"
    fi
    if [ -f "$pub_guess" ]; then
        if [ "$FORCE" = "true" ] || ! has_cfg "ssh" "publicKey"; then
            echo "   ⚙️  Storing SSH public key (ssh:publicKey)"
            pulumi config set --stack "$STACK_NAME" ssh:publicKey "$(cat $pub_guess)"
        else
            echo "   ✅ Keeping existing ssh:publicKey"
        fi
    else
        prompt_cfg "ssh" "publicKey" "SSH public key (OpenSSH format, typically id_rsa.pub)" "false"
    fi
fi

echo ""
echo "✅ Environment setup completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Review your configuration: pulumi config"
echo "   2. Preview your deployment: pulumi preview"
echo "   3. Deploy: pulumi up"
echo ""
echo "🔧 To modify any values later:"
echo "   pulumi config set app:VARIABLE_NAME value"
echo "   pulumi config set --secret app:VARIABLE_NAME value"
echo ""
echo "📖 For more information, see infra/DEPLOYMENT.md."
