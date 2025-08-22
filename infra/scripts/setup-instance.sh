set -euo pipefail

# Ensure ubuntu-ports uses HTTPS (ARM Jammy images)
if grep -Rqs 'http://ports.ubuntu.com/ubuntu-ports' /etc/apt/sources.list /etc/apt/sources.list.d/*.list 2>/dev/null; then
  sudo sed -i 's|http://ports.ubuntu.com/ubuntu-ports|https://ports.ubuntu.com/ubuntu-ports|g' /etc/apt/sources.list || true
  for f in /etc/apt/sources.list.d/*.list; do
    sudo sed -i 's|http://ports.ubuntu.com/ubuntu-ports|https://ports.ubuntu.com/ubuntu-ports|g' "$f" || true
  done
fi

# Update system
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y -qq

# Install Docker and tools
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io curl git

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add ubuntu user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create application directories
sudo mkdir -p /opt/auto-apply/{data,assets,backup/logs}
sudo chown -R ubuntu:ubuntu /opt/auto-apply

# Mount data volume (robust auto-detect)
sudo mkdir -p /opt/auto-apply/data
ROOT_PART=$(findmnt -no SOURCE / || true)
ROOT_DISK=$(lsblk -no PKNAME "$ROOT_PART" 2>/dev/null || echo "")
echo "Root partition: $ROOT_PART Root disk: $ROOT_DISK"
DATA_DEV=""
for i in $(seq 1 18); do
  CANDS=$(lsblk -b -ndo NAME,TYPE,SIZE | awk '$2=="disk" && $3>=42949672960 {print $1}')
  for n in $CANDS; do
    if [ "$n" != "$ROOT_DISK" ]; then DATA_DEV="/dev/$n"; break; fi
  done
  if [ -n "$DATA_DEV" ] && [ -b "$DATA_DEV" ]; then break; fi
  echo "Waiting for data disk... attempt $i"
  sleep 5
done
if [ -n "$DATA_DEV" ] && [ -b "$DATA_DEV" ]; then
  if ! sudo blkid "$DATA_DEV" >/dev/null 2>&1; then
    sudo mkfs.ext4 -F "$DATA_DEV"
  fi
  sudo mount "$DATA_DEV" /opt/auto-apply/data || true
  UUID=$(sudo blkid -s UUID -o value "$DATA_DEV" || true)
  if [ -n "$UUID" ] && ! grep -q '/opt/auto-apply/data' /etc/fstab; then
    echo "UUID=$UUID /opt/auto-apply/data ext4 defaults 0 2" | sudo tee -a /etc/fstab
  fi
else
  echo "No data block device detected; skipping mount"
fi

echo "Instance setup completed"


