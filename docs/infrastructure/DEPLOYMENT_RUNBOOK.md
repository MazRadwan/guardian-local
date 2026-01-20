# Guardian App - Deployment Runbook

**Created:** 2026-01-20
**Region:** ca-central-1 (Canada Central)
**Environment:** Demo/Staging
**Status:** Phase 2 Complete - Backend Deployed and Running

---

## Deployment Summary

| Component | Platform | Tier |
|-----------|----------|------|
| **Frontend** | Vercel (hobby plan) | Free |
| **Backend** | AWS EC2 t3.micro | Free tier (12 months) |
| **Database** | AWS RDS PostgreSQL db.t3.micro | Free tier (12 months) |
| **File Storage** | AWS S3 | Free tier (12 months) |
| **Secrets** | AWS SSM Parameter Store | Always free |

**Estimated Cost:** $0/month (within free tier)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           INTERNET                                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       │
┌───────────────────┐   ┌───────────────────┐          │
│      Vercel       │   │   EC2 t3.micro    │          │
│  (Next.js 16)     │   │                   │          │
│                   │   │  ┌─────────────┐  │          │
│  *.vercel.app     │──▶│  │   Caddy     │  │          │
│                   │   │  │  (HTTPS)    │  │          │
│  FREE             │   │  └──────┬──────┘  │          │
└───────────────────┘   │         │         │          │
                        │  ┌──────▼──────┐  │          │
                        │  │   Node.js   │  │          │
                        │  │   Express   │  │          │
                        │  │   + PM2     │  │          │
                        │  └──────┬──────┘  │          │
                        │         │         │          │
                        │  Elastic IP       │          │
                        │  FREE TIER        │          │
                        └─────────┬─────────┘          │
                                  │                    │
        ┌─────────────────────────┼────────────────────┘
        │                         │
        ▼                         ▼
┌───────────────────┐   ┌───────────────────┐
│  RDS PostgreSQL   │   │        S3         │
│  db.t3.micro      │   │  guardian-files   │
│                   │   │                   │
│  Port 5432        │   │  Report exports   │
│  Single-AZ        │   │  File uploads     │
│  FREE TIER        │   │  FREE TIER        │
└───────────────────┘   └───────────────────┘
```

---

## AWS Resources to Create

### 1. VPC & Networking

| Resource | Name | Configuration |
|----------|------|---------------|
| VPC | `guardian-demo-vpc` | CIDR: `10.0.0.0/16` |
| Public Subnet | `guardian-demo-public-subnet` | CIDR: `10.0.1.0/24`, AZ: `ca-central-1a` |
| Private Subnet | `guardian-demo-private-subnet` | CIDR: `10.0.2.0/24`, AZ: `ca-central-1a` |
| Internet Gateway | `guardian-demo-igw` | Attached to VPC |
| Route Table | `guardian-demo-public-rt` | `0.0.0.0/0` → IGW |

### 2. Security Groups

**EC2 Security Group:** `guardian-demo-ec2-sg`

| Direction | Port | Source | Purpose |
|-----------|------|--------|---------|
| Inbound | 22 | Your IP | SSH |
| Inbound | 80 | 0.0.0.0/0 | HTTP (redirects to HTTPS) |
| Inbound | 443 | 0.0.0.0/0 | HTTPS |
| Outbound | All | 0.0.0.0/0 | Internet access |

**RDS Security Group:** `guardian-demo-rds-sg`

| Direction | Port | Source | Purpose |
|-----------|------|--------|---------|
| Inbound | 5432 | EC2 Security Group | PostgreSQL |

### 3. EC2 Instance

| Setting | Value |
|---------|-------|
| Name | `guardian-demo-backend` |
| AMI | Amazon Linux 2023 |
| Type | `t3.micro` |
| Subnet | Public subnet |
| Public IP | Yes (Elastic IP) |
| Storage | 8 GB gp3 |
| Key Pair | `guardian-demo-key` |

**Software Stack:**
- Node.js 22 LTS
- pnpm
- PM2 (process manager)
- Caddy (reverse proxy + auto SSL)
- Git

### 4. RDS PostgreSQL

| Setting | Value |
|---------|-------|
| Identifier | `guardian-demo-db` |
| Engine | PostgreSQL 17 |
| Instance | `db.t3.micro` |
| Storage | 20 GB gp2 |
| DB Name | `guardian_db` |
| Username | `guardian_admin` |
| Multi-AZ | No (single-AZ for free tier) |
| Public Access | No |
| Subnet Group | Private subnet |

### 5. S3 Bucket

| Setting | Value |
|---------|-------|
| Name | `guardian-demo-files-442042534512` |
| Region | `ca-central-1` |
| Public Access | Block all |
| Versioning | Disabled |

### 6. SSM Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `/guardian/demo/DATABASE_URL` | SecureString | PostgreSQL connection string |
| `/guardian/demo/ANTHROPIC_API_KEY` | SecureString | Claude API key |
| `/guardian/demo/JWT_SECRET` | SecureString | JWT signing key |
| `/guardian/demo/S3_BUCKET` | String | S3 bucket name |
| `/guardian/demo/S3_REGION` | String | `ca-central-1` |
| `/guardian/demo/CORS_ORIGIN` | String | Vercel frontend URL |
| `/guardian/demo/NODE_ENV` | String | `production` |

---

## Implementation Checklist

### Phase 1: AWS Infrastructure (CLI) ✅ COMPLETE

- [x] Create VPC
- [x] Create subnets (public + private)
- [x] Create and attach Internet Gateway
- [x] Create route tables
- [x] Create EC2 security group
- [x] Create RDS security group
- [x] Create RDS subnet group
- [x] Launch RDS instance
- [x] Create S3 bucket
- [x] Create EC2 key pair
- [x] Launch EC2 instance
- [x] Allocate and associate Elastic IP
- [x] Create SSM parameters

### Phase 2: EC2 Setup (SSH) ✅ COMPLETE

- [x] SSH into EC2
- [x] Install Node.js 22, pnpm, PM2, Caddy, Git
- [x] Clone guardian-app repository
- [x] Install dependencies
- [x] Build backend
- [x] Configure Caddy (HTTP + HTTPS with self-signed cert)
- [x] Create startup script to load SSM secrets
- [x] Start backend with PM2 (using tsx for ES module compatibility)
- [x] Configure PM2 startup on boot
- [x] Run database migrations
- [x] Verify health endpoint

### Phase 3: Vercel Frontend

- [ ] Connect Vercel to GitHub repo
- [ ] Configure project (root: `apps/web`)
- [ ] Set environment variables:
  - `NEXT_PUBLIC_API_URL` = `https://<elastic-ip>` (or Caddy domain)
  - `NEXT_PUBLIC_WS_URL` = `wss://<elastic-ip>`
- [ ] Deploy
- [ ] Update CORS_ORIGIN in SSM with Vercel URL

### Phase 4: Verification

- [ ] Test API health endpoint
- [ ] Test WebSocket connection
- [ ] Test frontend → backend communication
- [ ] Test authentication flow
- [ ] Test Claude API integration

---

## CLI Commands Reference

### VPC Setup

```bash
# Create VPC
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=guardian-demo-vpc}]' \
  --region ca-central-1

# Enable DNS hostnames
aws ec2 modify-vpc-attribute \
  --vpc-id <VPC_ID> \
  --enable-dns-hostnames

# Create public subnet
aws ec2 create-subnet \
  --vpc-id <VPC_ID> \
  --cidr-block 10.0.1.0/24 \
  --availability-zone ca-central-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=guardian-demo-public-subnet}]'

# Create private subnet
aws ec2 create-subnet \
  --vpc-id <VPC_ID> \
  --cidr-block 10.0.2.0/24 \
  --availability-zone ca-central-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=guardian-demo-private-subnet}]'

# Create Internet Gateway
aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=guardian-demo-igw}]'

# Attach IGW to VPC
aws ec2 attach-internet-gateway \
  --internet-gateway-id <IGW_ID> \
  --vpc-id <VPC_ID>

# Create route table
aws ec2 create-route-table \
  --vpc-id <VPC_ID> \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=guardian-demo-public-rt}]'

# Add route to IGW
aws ec2 create-route \
  --route-table-id <RT_ID> \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id <IGW_ID>

# Associate route table with public subnet
aws ec2 associate-route-table \
  --route-table-id <RT_ID> \
  --subnet-id <PUBLIC_SUBNET_ID>

# Enable auto-assign public IP for public subnet
aws ec2 modify-subnet-attribute \
  --subnet-id <PUBLIC_SUBNET_ID> \
  --map-public-ip-on-launch
```

### Security Groups

```bash
# EC2 Security Group
aws ec2 create-security-group \
  --group-name guardian-demo-ec2-sg \
  --description "Guardian EC2 security group" \
  --vpc-id <VPC_ID>

# Add SSH rule (replace YOUR_IP)
aws ec2 authorize-security-group-ingress \
  --group-id <EC2_SG_ID> \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32

# Add HTTP rule
aws ec2 authorize-security-group-ingress \
  --group-id <EC2_SG_ID> \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Add HTTPS rule
aws ec2 authorize-security-group-ingress \
  --group-id <EC2_SG_ID> \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# RDS Security Group
aws ec2 create-security-group \
  --group-name guardian-demo-rds-sg \
  --description "Guardian RDS security group" \
  --vpc-id <VPC_ID>

# Add PostgreSQL rule (from EC2 SG)
aws ec2 authorize-security-group-ingress \
  --group-id <RDS_SG_ID> \
  --protocol tcp \
  --port 5432 \
  --source-group <EC2_SG_ID>
```

### RDS

```bash
# Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name guardian-demo-subnet-group \
  --db-subnet-group-description "Guardian demo subnet group" \
  --subnet-ids <PUBLIC_SUBNET_ID> <PRIVATE_SUBNET_ID>

# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier guardian-demo-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 17 \
  --master-username guardian_admin \
  --master-user-password <GENERATE_SECURE_PASSWORD> \
  --allocated-storage 20 \
  --storage-type gp2 \
  --db-name guardian_db \
  --vpc-security-group-ids <RDS_SG_ID> \
  --db-subnet-group-name guardian-demo-subnet-group \
  --no-publicly-accessible \
  --backup-retention-period 7 \
  --no-multi-az \
  --storage-encrypted
```

### EC2

```bash
# Create key pair
aws ec2 create-key-pair \
  --key-name guardian-demo-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/guardian-demo-key.pem

chmod 400 ~/.ssh/guardian-demo-key.pem

# Get latest Amazon Linux 2023 AMI
aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-2023*-x86_64" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text

# Launch EC2 instance
aws ec2 run-instances \
  --image-id <AMI_ID> \
  --instance-type t3.micro \
  --key-name guardian-demo-key \
  --security-group-ids <EC2_SG_ID> \
  --subnet-id <PUBLIC_SUBNET_ID> \
  --associate-public-ip-address \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=8,VolumeType=gp3}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=guardian-demo-backend}]'

# Allocate Elastic IP
aws ec2 allocate-address --domain vpc

# Associate Elastic IP
aws ec2 associate-address \
  --instance-id <INSTANCE_ID> \
  --allocation-id <ALLOCATION_ID>
```

### S3

```bash
aws s3api create-bucket \
  --bucket guardian-demo-files-442042534512 \
  --region ca-central-1 \
  --create-bucket-configuration LocationConstraint=ca-central-1

# Block public access
aws s3api put-public-access-block \
  --bucket guardian-demo-files-442042534512 \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### SSM Parameters

```bash
aws ssm put-parameter \
  --name "/guardian/demo/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://guardian_admin:<PASSWORD>@<RDS_ENDPOINT>:5432/guardian_db?sslmode=require"

aws ssm put-parameter \
  --name "/guardian/demo/ANTHROPIC_API_KEY" \
  --type "SecureString" \
  --value "<YOUR_ANTHROPIC_KEY>"

aws ssm put-parameter \
  --name "/guardian/demo/JWT_SECRET" \
  --type "SecureString" \
  --value "<GENERATE_32_CHAR_SECRET>"

aws ssm put-parameter \
  --name "/guardian/demo/S3_BUCKET" \
  --type "String" \
  --value "guardian-demo-files-442042534512"

aws ssm put-parameter \
  --name "/guardian/demo/S3_REGION" \
  --type "String" \
  --value "ca-central-1"

aws ssm put-parameter \
  --name "/guardian/demo/NODE_ENV" \
  --type "String" \
  --value "production"
```

---

## EC2 Setup Script

After SSH into EC2:

```bash
# Update system
sudo dnf update -y

# Install Node.js 22
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs

# Install pnpm
sudo npm install -g pnpm

# Install PM2
sudo npm install -g pm2

# Install Caddy
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable @caddy/caddy -y
sudo dnf install -y caddy

# Install Git
sudo dnf install -y git

# Clone repository
cd /home/ec2-user
git clone https://github.com/<YOUR_ORG>/guardian-app.git
cd guardian-app

# Install dependencies
pnpm install

# Build backend
pnpm --filter @guardian/backend build

# Create logs directory
mkdir -p /home/ec2-user/logs
```

---

## Caddy Configuration

Create `/etc/caddy/Caddyfile`:

```caddyfile
:443 {
    reverse_proxy localhost:8000

    # WebSocket support
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket localhost:8000

    # Auto HTTPS with self-signed cert (no domain)
    tls internal
}

:80 {
    redir https://{host}{uri} permanent
}
```

Start Caddy:
```bash
sudo systemctl enable caddy
sudo systemctl start caddy
```

---

## PM2 Configuration

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'guardian-backend',
    script: './packages/backend/dist/index.js',
    cwd: '/home/ec2-user/guardian-app',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '800M',
    node_args: '--max-old-space-size=512',
    env: {
      NODE_ENV: 'production',
      PORT: 8000
    },
    error_file: '/home/ec2-user/logs/guardian-error.log',
    out_file: '/home/ec2-user/logs/guardian-out.log',
    merge_logs: true,
    restart_delay: 3000,
    max_restarts: 10
  }]
}
```

---

## Startup Script (Load SSM Secrets)

Create `/home/ec2-user/guardian-app/load-env.sh`:

```bash
#!/bin/bash

export DATABASE_URL=$(aws ssm get-parameter --name /guardian/demo/DATABASE_URL --with-decryption --query Parameter.Value --output text --region ca-central-1)
export ANTHROPIC_API_KEY=$(aws ssm get-parameter --name /guardian/demo/ANTHROPIC_API_KEY --with-decryption --query Parameter.Value --output text --region ca-central-1)
export JWT_SECRET=$(aws ssm get-parameter --name /guardian/demo/JWT_SECRET --with-decryption --query Parameter.Value --output text --region ca-central-1)
export S3_BUCKET=$(aws ssm get-parameter --name /guardian/demo/S3_BUCKET --query Parameter.Value --output text --region ca-central-1)
export S3_REGION=$(aws ssm get-parameter --name /guardian/demo/S3_REGION --query Parameter.Value --output text --region ca-central-1)
export NODE_ENV=$(aws ssm get-parameter --name /guardian/demo/NODE_ENV --query Parameter.Value --output text --region ca-central-1)
export CORS_ORIGIN=$(aws ssm get-parameter --name /guardian/demo/CORS_ORIGIN --query Parameter.Value --output text --region ca-central-1)

exec "$@"
```

---

## Migration to Full AWS (Future)

When ready to move frontend from Vercel to AWS:

1. **AWS Amplify** (recommended):
   - Create Amplify app → Connect GitHub → Same build settings
   - Set same environment variables
   - No code changes needed

2. **Update CORS_ORIGIN** in SSM to Amplify URL

3. **Optional enhancements:**
   - ECS Fargate instead of EC2 (auto-scaling)
   - ALB + ACM for managed SSL
   - ElastiCache Redis (when caching implemented)
   - Multi-AZ RDS (production reliability)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| SSL cert not working | Using `tls internal` for self-signed; for real cert need domain |
| WebSocket failing | Check Caddy config has upgrade headers |
| DB connection refused | Verify RDS security group allows EC2 SG |
| Out of memory | Check PM2 logs, increase `max-old-space-size` |
| PM2 not starting on boot | Run `pm2 startup` and `pm2 save` |

---

## Resource IDs (Provisioned 2026-01-20)

```
VPC_ID=vpc-0dc61b475e0a9cac4
PUBLIC_SUBNET_ID=subnet-0f2f6bc34b92acf5d
PRIVATE_SUBNET_ID=subnet-024a96ae3b0915588
IGW_ID=igw-0255c3ab3778a4799
ROUTE_TABLE_ID=rtb-012e0b4a9855ec081
EC2_SG_ID=sg-001a8aad93f1209e7
RDS_SG_ID=sg-08dbaad50688cbdcb
RDS_ENDPOINT=guardian-demo-db.cje4k6ck0e5y.ca-central-1.rds.amazonaws.com
EC2_INSTANCE_ID=i-024b9653f081af8ac
ELASTIC_IP=16.54.72.26
ELASTIC_IP_ALLOC_ID=eipalloc-0a4288fc61cb7ffc3
S3_BUCKET=guardian-demo-files-442042534512
SSH_KEY_PATH=~/.ssh/guardian-demo-key.pem
```

### SSM Parameters Created

```
/guardian/demo/DATABASE_URL (SecureString)
/guardian/demo/ANTHROPIC_API_KEY (SecureString)
/guardian/demo/JWT_SECRET (SecureString)
/guardian/demo/S3_BUCKET (String)
/guardian/demo/S3_REGION (String)
/guardian/demo/NODE_ENV (String)
```

### Quick SSH Command

```bash
ssh -i ~/.ssh/guardian-demo-key.pem ec2-user@16.54.72.26
```

### API Endpoints (Live)

```
Health Check (HTTP):  http://16.54.72.26/health
Health Check (HTTPS): https://16.54.72.26/health  (self-signed cert, use -k with curl)
WebSocket:            ws://16.54.72.26 or wss://16.54.72.26
```

### For Vercel Frontend Config

```
NEXT_PUBLIC_API_URL=https://16.54.72.26
NEXT_PUBLIC_WS_URL=wss://16.54.72.26
```

---

**Document Version:** 1.0
**Last Updated:** 2026-01-20
