#!/bin/bash

# Reset the development database (useful when you need a fresh start)

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${RED}⚠️  Database Reset Warning${NC}"
echo -e "${YELLOW}This will delete ALL data in the development database!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${GREEN}Cancelled. Database preserved.${NC}"
    exit 0
fi

echo -e "${BLUE}🔄 Resetting development database...${NC}"
echo ""

# Stop infrastructure
echo -e "${YELLOW}1. Stopping infrastructure...${NC}"
docker-compose -f docker-compose.infra.yml down -v

# Start fresh infrastructure
echo -e "${YELLOW}2. Starting fresh infrastructure...${NC}"
docker-compose -f docker-compose.infra.yml up -d

# Wait for PostgreSQL
echo -e "${YELLOW}3. Waiting for PostgreSQL...${NC}"
sleep 5

until docker exec courtflow-postgres-dev pg_isready -U courtflow > /dev/null 2>&1; do
    echo -e "${YELLOW}   Waiting for PostgreSQL...${NC}"
    sleep 2
done

echo ""
echo -e "${GREEN}✅ Database reset complete!${NC}"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo -e "  cd backend"
echo -e "  pnpm db:migrate   # Run migrations"
echo -e "  pnpm db:seed      # Seed initial data"
echo ""
