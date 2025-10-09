#!/bin/bash

# Stop the hybrid development environment

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛑 Stopping CourtFlow Development Infrastructure${NC}"
echo ""

# Stop infrastructure containers
echo -e "${YELLOW}📦 Stopping PostgreSQL and Redis containers...${NC}"
docker-compose -f docker-compose.infra.yml down

echo ""
echo -e "${GREEN}✅ Infrastructure stopped successfully${NC}"
echo -e "${YELLOW}💡 Data volumes are preserved. Use 'docker-compose -f docker-compose.infra.yml down -v' to remove data${NC}"
echo ""
