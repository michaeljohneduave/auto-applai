.PHONY: deploy deploy-local backup health-check logs status stop start restart clean monitor

# Deploy API to production
deploy:
	@echo "🚀 Deploying API to production..."
	ssh user@your-vm-ip "cd /home/user/auto-applai && git pull origin main && ./deploy.sh"

# Deploy locally
deploy-local:
	@echo "🏠 Deploying API locally..."
	./deploy.sh

# Create backup
backup:
	@echo "💾 Creating backup..."
	docker-compose -f docker-compose.prod.yml exec backup /app/scripts/backup.sh

# Check health
health-check:
	@echo "🏥 Checking health..."
	./health-check.sh

# View logs
logs:
	@echo "📋 Showing logs..."
	docker-compose -f docker-compose.prod.yml logs -f

# Show status
status:
	@echo "📊 Service status:"
	docker-compose -f docker-compose.prod.yml ps
	@echo ""
	@echo "💾 Resource usage:"
	@free -h
	@df -h /

# Stop services
stop:
	@echo "⏹️ Stopping services..."
	docker-compose -f docker-compose.prod.yml down

# Start services
start:
	@echo "▶️ Starting services..."
	docker-compose -f docker-compose.prod.yml up -d

# Restart services
restart:
	@echo "🔄 Restarting services..."
	docker-compose -f docker-compose.prod.yml restart

# Clean up
clean:
	@echo "🧹 Cleaning up..."
	docker image prune -f
	docker volume prune -f
	@echo "✅ Cleanup completed"

# Monitor resources
monitor:
	@echo "📊 Monitoring resources..."
	@watch -n 5 'echo "=== Docker Status ==="; docker-compose -f docker-compose.prod.yml ps; echo ""; echo "=== Memory Usage ==="; free -h; echo ""; echo "=== Disk Usage ==="; df -h /'

# Build frontend for Cloudflare Pages
build-frontend:
	@echo "🏗️ Building frontend for Cloudflare Pages..."
	cd packages/frontend && pnpm build

# Help
help:
	@echo "Available commands:"
	@echo "  deploy          - Deploy API to production VM"
	@echo "  deploy-local    - Deploy API locally"
	@echo "  backup          - Create database backup"
	@echo "  health-check    - Check API health"
	@echo "  logs            - View service logs"
	@echo "  status          - Show service status and resources"
	@echo "  stop            - Stop all services"
	@echo "  start           - Start all services"
	@echo "  restart         - Restart all services"
	@echo "  clean           - Clean up Docker resources"
	@echo "  monitor         - Monitor resources in real-time"
	@echo "  build-frontend  - Build frontend for Cloudflare Pages"
	@echo "  help            - Show this help message"
