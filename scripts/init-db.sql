-- CourtFlow Database Initialization Script

-- Create extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create custom functions for better UUID generation
CREATE OR REPLACE FUNCTION gen_random_uuid() RETURNS uuid AS $$
BEGIN
    RETURN uuid_generate_v4();
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance (these will be created by Prisma migrations)
-- This script mainly ensures extensions are available

-- Set up database configuration for optimal performance
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';
ALTER SYSTEM SET pg_stat_statements.max = 10000;

-- Configure connection and memory settings
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Reload configuration
SELECT pg_reload_conf();

-- Create a function to check database health
CREATE OR REPLACE FUNCTION check_database_health()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT
) AS $$
BEGIN
    -- Check database connectivity
    RETURN QUERY SELECT 
        'connectivity'::TEXT,
        'healthy'::TEXT,
        'Database is accessible'::TEXT;
    
    -- Check extensions
    RETURN QUERY SELECT 
        'extensions'::TEXT,
        CASE WHEN COUNT(*) >= 3 THEN 'healthy' ELSE 'unhealthy' END::TEXT,
        'Required extensions: ' || STRING_AGG(extname, ', ')::TEXT
    FROM pg_extension 
    WHERE extname IN ('uuid-ossp', 'pg_stat_statements', 'pg_trgm');
    
    -- Check database size
    RETURN QUERY SELECT 
        'database_size'::TEXT,
        'healthy'::TEXT,
        'Database size: ' || pg_size_pretty(pg_database_size(current_database()))::TEXT;
    
    -- Check active connections
    RETURN QUERY SELECT 
        'connections'::TEXT,
        CASE WHEN COUNT(*) < 80 THEN 'healthy' ELSE 'warning' END::TEXT,
        'Active connections: ' || COUNT(*)::TEXT
    FROM pg_stat_activity 
    WHERE state = 'active';
END;
$$ LANGUAGE plpgsql;

-- Create a function to get database statistics
CREATE OR REPLACE FUNCTION get_database_stats()
RETURNS TABLE(
    metric_name TEXT,
    metric_value TEXT
) AS $$
BEGIN
    -- Database size
    RETURN QUERY SELECT 
        'database_size_bytes'::TEXT,
        pg_database_size(current_database())::TEXT;
    
    -- Total connections
    RETURN QUERY SELECT 
        'total_connections'::TEXT,
        COUNT(*)::TEXT
    FROM pg_stat_activity;
    
    -- Active connections
    RETURN QUERY SELECT 
        'active_connections'::TEXT,
        COUNT(*)::TEXT
    FROM pg_stat_activity 
    WHERE state = 'active';
    
    -- Cache hit ratio
    RETURN QUERY SELECT 
        'cache_hit_ratio'::TEXT,
        ROUND(
            (SUM(blks_hit) * 100.0 / NULLIF(SUM(blks_hit + blks_read), 0))::NUMERIC, 
            2
        )::TEXT
    FROM pg_stat_database 
    WHERE datname = current_database();
    
    -- Transaction statistics
    RETURN QUERY SELECT 
        'transactions_committed'::TEXT,
        SUM(xact_commit)::TEXT
    FROM pg_stat_database 
    WHERE datname = current_database();
    
    RETURN QUERY SELECT 
        'transactions_rolled_back'::TEXT,
        SUM(xact_rollback)::TEXT
    FROM pg_stat_database 
    WHERE datname = current_database();
END;
$$ LANGUAGE plpgsql;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'CourtFlow database initialization completed successfully';
    RAISE NOTICE 'Database: %', current_database();
    RAISE NOTICE 'Version: %', version();
    RAISE NOTICE 'Extensions installed: %', (
        SELECT STRING_AGG(extname, ', ') 
        FROM pg_extension 
        WHERE extname IN ('uuid-ossp', 'pg_stat_statements', 'pg_trgm')
    );
END $$;