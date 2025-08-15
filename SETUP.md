# Auto-Apply Setup Guide (GitHub + Cloudflare Pages + API-Only VM)

This guide will help you set up Auto-Apply with the new architecture:
- **Source Control**: GitHub repository with automated CI/CD
- **Frontend**: Cloudflare Pages (CDN)
- **API**: 2c 2gb VM with Docker
- **Database**: SQLite with Cloud Storage backups

## Prerequisites

### 1. GitHub Account & Repository
- GitHub account
- Repository with your Auto-Apply code
- GitHub Actions enabled
- GitHub CLI (optional but recommended)

### 2. Google Cloud VM
- 2c 2gb VM (e2-small recommended)
- Ubuntu 22.04 LTS
- Docker and Docker Compose installed

### 3. Cloudflare Account
- Free Cloudflare account
- Domain name added to Cloudflare
- Cloudflare Pages project created

## Step 0: GitHub Repository Setup

### 0.1 Create GitHub Repository
```bash
# Create a new repository on GitHub
# Go to https://github.com/new
# Repository name: auto-applai
# Description: Auto-Apply - Automated Job Application System
# Visibility: Private (recommended)
# Initialize with: README, .gitignore (Node), license
```

### 0.2 Clone and Push Your Code
```bash
# Clone your local repository (if you have one)
git clone https://github.com/yourusername/auto-applai.git
cd auto-applai

# Or if you're starting fresh
mkdir auto-applai
cd auto-applai
git init

# Add your code files
# Copy all your project files here

# Initial commit
git add .
git commit -m "Initial commit: Auto-Apply monorepo setup"

# Add GitHub remote
git remote add origin https://github.com/yourusername/auto-applai.git
git branch -M main
git push -u origin main
```

### 0.3 Enable GitHub Actions
1. Go to your repository → Settings → Actions → General
2. Enable "Allow all actions and reusable workflows"
3. Enable "Read and write permissions" for Actions
4. Save changes

### 0.4 Verify GitHub Actions Workflows
```bash
# Check that workflows are present
ls -la .github/workflows/

# Should show:
# - deploy-api.yml
# - deploy-frontend.yml
```

## Step 1: VM Setup

### 1.1 Create VM
```bash
# Create VM instance
gcloud compute instances create auto-apply-vm \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server

# Get VM IP
gcloud compute instances describe auto-apply-vm \
  --zone=us-central1-a \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

### 1.2 Install Docker and Git
```bash
# SSH into VM
gcloud compute ssh auto-apply-vm --zone=us-central1-a

# Install Docker and Git
sudo apt-get update
sudo apt-get install -y docker.io docker-compose git curl
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

# Install GitHub CLI (optional but useful)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt-get update
sudo apt-get install -y gh

# Logout and login again for group changes
exit
# SSH back in
```

### 1.3 Configure Firewall
```bash
# Allow port 8080 for API
gcloud compute firewall-rules create allow-api \
  --allow tcp:8080 \
  --target-tags=http-server \
  --description="Allow API traffic"

# Allow port 22 for SSH (if not already allowed)
gcloud compute firewall-rules create allow-ssh \
  --allow tcp:22 \
  --target-tags=http-server \
  --description="Allow SSH access"
```

## Step 2: Cloudflare Setup

### 2.1 Create Cloudflare Pages Project
1. Go to Cloudflare Dashboard → Pages
2. Click "Create a project"
3. Connect your GitHub repository
4. Configure build settings:
   - **Framework preset**: None
   - **Build command**: `cd packages/frontend && pnpm build`
   - **Build output directory**: `packages/frontend/dist`
   - **Root directory**: `/`

### 2.2 Configure DNS
In Cloudflare DNS settings, add:
```
Type    Name    Content
A       api     YOUR_VM_IP
CNAME   www     yourdomain.com
A       @       YOUR_VM_IP
```

### 2.3 SSL/TLS Settings
1. Go to SSL/TLS settings
2. Set encryption mode to "Full (strict)"
3. Enable "Always Use HTTPS"

## Step 3: GitHub Secrets Setup

In your GitHub repository → Settings → Secrets and variables → Actions:

### 3.1 VM Secrets
```
SERVER_IP=your-vm-ip-address
SERVER_USER=your-vm-username
SSH_PRIVATE_KEY=your-ssh-private-key-content
```

### 3.2 Cloudflare Secrets
```
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
VITE_API_URL=https://api.yourdomain.com
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_key
```

### 3.3 Optional Secrets
```
SLACK_WEBHOOK=https://hooks.slack.com/your-webhook-url
```

### 3.4 GitHub CLI Authentication (Optional)
```bash
# On your local machine or VM
gh auth login

# This will help with GitHub Actions debugging and management
```

## Step 4: Environment Configuration

### 4.1 VM Environment
On your VM, create `.env.production`:
```bash
# SSH into VM
ssh user@your-vm-ip

# Clone repository from GitHub
git clone https://github.com/yourusername/auto-applai.git
cd auto-applai

# Copy environment template
cp env.production.template .env.production

# Edit with your values
nano .env.production

# Verify the repository is properly set up
ls -la
git status
```

### 4.2 Frontend Environment
Create `packages/frontend/.env.production`:
```bash
VITE_API_URL=https://api.yourdomain.com
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_key
```

## Step 5: SSH Key Setup

### 5.1 Generate SSH Key on VM
```bash
# On your VM
ssh-keygen -t ed25519 -C "github-actions"
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys

# Copy private key to GitHub secrets
cat ~/.ssh/id_ed25519

# Test SSH connection
ssh localhost
```

### 5.2 Add to GitHub Secrets
Copy the private key content to `SSH_PRIVATE_KEY` secret.

## Step 6: Initial Deployment

### 6.1 Deploy API
```bash
# On your VM
cd auto-applai
chmod +x deploy.sh
./deploy.sh
```

### 6.2 Deploy Frontend
Push to main branch or manually trigger GitHub Actions:
1. Go to GitHub → Actions
2. Select "Deploy Frontend to Cloudflare Pages"
3. Click "Run workflow"

### 6.3 Test GitHub Actions
```bash
# Make a small change and push to trigger deployment
echo "# Test deployment" >> README.md
git add README.md
git commit -m "Test deployment trigger"
git push origin main

# Check GitHub Actions status
gh run list --limit 5
```

## Step 7: Verification

### 7.1 Check API
```bash
# Test API health
curl https://api.yourdomain.com/health

# Should return: {"status":"ok","timestamp":"..."}
```

### 7.2 Check Frontend
Visit your Cloudflare Pages URL:
- `https://auto-apply.pages.dev` (default)
- `https://yourdomain.com` (custom domain)

## Step 8: Monitoring Setup

### 8.1 Health Check Cron Job
```bash
# Add to crontab: crontab -e
# Check health every 5 minutes
*/5 * * * * /home/username/auto-applai/health-check.sh

# Daily backup at 2 AM
0 2 * * * docker-compose -f /home/username/auto-applai/docker-compose.prod.yml exec backup /app/scripts/backup.sh

# Pull latest changes daily at 3 AM
0 3 * * * cd /home/username/auto-applai && git pull origin main
```

### 8.2 Make Health Check Executable
```bash
chmod +x health-check.sh
```

### 8.3 GitHub Actions Monitoring
```bash
# Check recent workflow runs
gh run list --limit 10

# View workflow logs
gh run view --log

# Re-run failed workflows
gh run rerun <run-id>
```

## Usage

### Manual Deployment
```bash
# Deploy API locally
make deploy-local

# Deploy API via GitHub Actions
git add .
git commit -m "Trigger API deployment"
git push origin main

# Deploy frontend
make build-frontend
# Then push to GitHub or trigger GitHub Actions
```

### Monitoring
```bash
# Check status
make status

# View logs
make logs

# Monitor resources
make monitor

# Health check
make health-check
```

### Backup
```bash
# Manual backup
make backup

# Check backup logs
docker-compose -f docker-compose.prod.yml logs backup
```

## Troubleshooting

### API Not Responding
```bash
# Check service status
make status

# Check logs
make logs

# Restart services
make restart

# Check GitHub Actions status
gh run list --limit 5
```

### Frontend Not Loading
1. Check Cloudflare Pages deployment status
2. Verify DNS settings
3. Check browser console for API errors
4. Check GitHub Actions frontend deployment workflow
5. Verify environment variables in Cloudflare Pages settings

### High Resource Usage
```bash
# Check resource usage
make status

# Clean up Docker
make clean

# Monitor in real-time
make monitor
```

### SSL Issues
1. Verify Cloudflare SSL/TLS settings
2. Check DNS propagation
3. Ensure API is accessible on port 8080

## Cost Optimization

### VM Costs
- **e2-small**: ~$13-15/month
- **Storage**: ~$2-3/month
- **Network**: ~$1-2/month
- **Total**: ~$16-20/month

### Cloudflare Costs
- **Pages**: Free (up to 500 builds/month)
- **DNS**: Free
- **SSL**: Free
- **CDN**: Free

### Total Monthly Cost
- **Infrastructure**: ~$16-20/month
- **Cloudflare**: Free
- **Total**: ~$16-20/month

## GitHub Best Practices

### Repository Management
1. **Branch Protection**: Enable branch protection on `main` branch
2. **Required Reviews**: Require pull request reviews before merging
3. **Status Checks**: Require GitHub Actions to pass before merging
4. **Issue Templates**: Create issue templates for bugs and features
5. **Project Boards**: Use GitHub Projects for task management

### Workflow Management
```bash
# Check workflow status
gh run list --limit 10

# View workflow logs
gh run view --log <run-id>

# Re-run failed workflows
gh run rerun <run-id>

# Cancel running workflows
gh run cancel <run-id>

# Download workflow artifacts
gh run download <run-id>
```

### Secrets Management
1. **Rotate Secrets**: Regularly rotate SSH keys and API tokens
2. **Audit Access**: Review who has access to repository secrets
3. **Environment Variables**: Use different secrets for staging/production
4. **Backup Secrets**: Keep secure backups of all secrets

## Security Considerations

1. **Firewall**: Only allow port 8080
2. **SSH**: Use key-based authentication
3. **Secrets**: Never commit environment files
4. **Updates**: Regularly update VM and Docker images
5. **Backups**: Verify backups are working
6. **GitHub Security**: Enable 2FA, use personal access tokens
7. **Repository Access**: Limit repository access to necessary users

## Support

For issues:
1. Check the logs: `make logs`
2. Run health check: `make health-check`
3. Check GitHub Actions for deployment status: `gh run list`
4. Review this setup guide
5. Check Cloudflare Pages deployment logs
6. Check GitHub repository issues and discussions
7. Verify all secrets are properly configured in GitHub
