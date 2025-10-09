#!/bin/bash

# CourtFlow Hybrid Development Environment Starter
# Runs infrastructure in Docker, apps locally for faster development

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 CourtFlow Hybrid Development Environment${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Stop any existing containers from full docker-compose
echo -e "${YELLOW}📦 Stopping any existing full Docker containers...${NC}"
docker-compose down 2>/dev/null || true

# Start infrastructure only
echo -e "${BLUE}🐳 Starting PostgreSQL and Redis in Docker...${NC}"
docker-compose -f docker-compose.infra.yml up -d

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for database and Redis to be ready...${NC}"
sleep 3

# Check health
echo -e "${BLUE}🏥 Checking service health...${NC}"
until docker exec courtflow-postgres-dev pg_isready -U courtflow > /dev/null 2>&1; do
    echo -e "${YELLOW}   Waiting for PostgreSQL...${NC}"
    sleep 2
done
echo -e "${GREEN}   ✅ PostgreSQL is ready${NC}"

until docker exec courtflow-redis-dev redis-cli ping > /dev/null 2>&1; do
    echo -e "${YELLOW}   Waiting for Redis...${NC}"
    sleep 2
done
echo -e "${GREEN}   ✅ Redis is ready${NC}"

echo ""
echo -e "${GREEN}✅ Infrastructure is ready!${NC}"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo ""
echo -e "  ${YELLOW}Terminal 1 - Backend:${NC}"
echo -e "    cd backend"
echo -e "    pnpm install"
echo -e "    pnpm db:generate  # Generate Prisma client"
echo -e "    pnpm db:migrate   # Run migrations"
echo -e "    pnpm dev          # Start backend server"
echo ""
echo -e "  ${YELLOW}Terminal 2 - Frontend:${NC}"
echo -e "    cd frontend"
echo -e "    pnpm install"
echo -e "    pnpm dev          # Start frontend dev server"
echo ""
echo -e "${BLUE}📍 Access Points:${NC}"
echo -e "   Frontend:  ${GREEN}http://localhost:5173${NC} (Vite default)"
echo -e "   Backend:   ${GREEN}http://localhost:3001${NC}"
echo -e "   API Docs:  ${GREEN}http://localhost:3001/api-docs${NC}"
echo -e "   PostgreSQL: ${GREEN}localhost:5432${NC}"
echo -e "   Redis:     ${GREEN}localhost:6379${NC}"
echo ""
echo -e "${YELLOW}💡 Tip: Run './dev-stop.sh' to stop infrastructure when done${NC}"
echo ""
