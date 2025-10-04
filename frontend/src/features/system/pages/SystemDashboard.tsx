import React, { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { systemAPI } from '@/api/endpoints/system';
import type {
  HealthResponse,
  DetailedHealthResponse,
  MetricsResponse,
  VersionResponse,
} from '@/api/types/system.types';

const getHealthStatusColor = (status: string) => {
  switch (status) {
    case 'healthy':
    case 'ok':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'unhealthy':
    case 'error':
      return 'error';
    default:
      return 'default';
  }
};

const formatBytes = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

const SystemDashboard: React.FC = () => {
  // Health check query
  const {
    data: healthData,
    isLoading: healthLoading,
    error: healthError,
  } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => systemAPI.getHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Detailed health check query
  const {
    data: detailedHealthData,
    isLoading: detailedHealthLoading,
    error: detailedHealthError,
  } = useQuery({
    queryKey: ['systemDetailedHealth'],
    queryFn: () => systemAPI.getDetailedHealth(),
    refetchInterval: 30000,
  });

  // Metrics query
  const {
    data: metricsData,
    isLoading: metricsLoading,
    error: metricsError,
  } = useQuery({
    queryKey: ['systemMetrics'],
    queryFn: () => systemAPI.getMetrics(),
    refetchInterval: 30000,
  });

  // Version query
  const {
    data: versionData,
    isLoading: versionLoading,
    error: versionError,
  } = useQuery({
    queryKey: ['systemVersion'],
    queryFn: () => systemAPI.getVersion(),
    refetchInterval: 30000,
  });

  const health = healthData?.data as HealthResponse;
  const detailedHealth = detailedHealthData?.data as DetailedHealthResponse;
  const metrics = metricsData?.data as MetricsResponse;
  const version = versionData?.data as VersionResponse;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        System Monitoring Dashboard
      </Typography>

      <Grid container spacing={3}>
        {/* Health Status Cards */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            System Health
          </Typography>
          <Grid container spacing={2}>
            {/* Overall Health */}
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Overall Status
                  </Typography>
                  {healthLoading ? (
                    <CircularProgress size={24} />
                  ) : healthError ? (
                    <Alert severity="error">Failed to load health</Alert>
                  ) : (
                    <>
                      <Chip
                        label={health?.status === 'ok' ? 'Healthy' : 'Error'}
                        color={getHealthStatusColor(health?.status || 'error') as any}
                        sx={{ mb: 1 }}
                      />
                      <Typography variant="body2">
                        Response: {health?.responseTime}ms
                      </Typography>
                      <Typography variant="body2">
                        Uptime: {formatUptime(health?.uptime || 0)}
                      </Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Database Health */}
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Database
                  </Typography>
                  {detailedHealthLoading ? (
                    <CircularProgress size={24} />
                  ) : detailedHealthError ? (
                    <Alert severity="error">Failed to load</Alert>
                  ) : (
                    <>
                      <Chip
                        label={detailedHealth?.checks.database.status === 'healthy' ? 'Healthy' : 'Unhealthy'}
                        color={getHealthStatusColor(detailedHealth?.checks.database.status || 'unhealthy') as any}
                        sx={{ mb: 1 }}
                      />
                      <Typography variant="body2">
                        Response: {detailedHealth?.checks.database.responseTime}ms
                      </Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Redis Health */}
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Redis
                  </Typography>
                  {detailedHealthLoading ? (
                    <CircularProgress size={24} />
                  ) : detailedHealthError ? (
                    <Alert severity="error">Failed to load</Alert>
                  ) : (
                    <>
                      <Chip
                        label={detailedHealth?.checks.redis.status === 'healthy' ? 'Healthy' : 'Unhealthy'}
                        color={getHealthStatusColor(detailedHealth?.checks.redis.status || 'unhealthy') as any}
                        sx={{ mb: 1 }}
                      />
                      <Typography variant="body2">
                        Response: {detailedHealth?.checks.redis.responseTime}ms
                      </Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Memory Health */}
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Memory
                  </Typography>
                  {detailedHealthLoading ? (
                    <CircularProgress size={24} />
                  ) : detailedHealthError ? (
                    <Alert severity="error">Failed to load</Alert>
                  ) : (
                    <>
                      <Chip
                        label={detailedHealth?.checks.memory.status === 'healthy' ? 'Healthy' : 'Unhealthy'}
                        color={getHealthStatusColor(detailedHealth?.checks.memory.status || 'unhealthy') as any}
                        sx={{ mb: 1 }}
                      />
                      <Typography variant="body2">
                        Usage: {detailedHealth?.checks.memory.usage.percentage.toFixed(1)}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={detailedHealth?.checks.memory.usage.percentage || 0}
                        sx={{ mt: 1 }}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        {/* Metrics Section */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            System Metrics
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Memory Usage
                  </Typography>
                  {metricsLoading ? (
                    <CircularProgress size={24} />
                  ) : metricsError ? (
                    <Alert severity="error">Failed to load metrics</Alert>
                  ) : (
                    <>
                      <Typography variant="body2">
                        Heap Used: {formatBytes(metrics?.system.memory.heapUsed || 0)}
                      </Typography>
                      <Typography variant="body2">
                        Heap Total: {formatBytes(metrics?.system.memory.heapTotal || 0)}
                      </Typography>
                      <Typography variant="body2">
                        RSS: {formatBytes(metrics?.system.memory.rss || 0)}
                      </Typography>
                      <Typography variant="body2">
                        Free Memory: {formatBytes(metrics?.system.freeMemory || 0)}
                      </Typography>
                      <Typography variant="body2">
                        Total Memory: {formatBytes(metrics?.system.totalMemory || 0)}
                      </Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    CPU & System
                  </Typography>
                  {metricsLoading ? (
                    <CircularProgress size={24} />
                  ) : metricsError ? (
                    <Alert severity="error">Failed to load metrics</Alert>
                  ) : (
                    <>
                      <Typography variant="body2">
                        CPU User: {metrics?.system.cpu.user} μs
                      </Typography>
                      <Typography variant="body2">
                        CPU System: {metrics?.system.cpu.system} μs
                      </Typography>
                      <Typography variant="body2">
                        Load Average: {metrics?.system.loadAverage.join(', ')}
                      </Typography>
                      <Typography variant="body2">
                        Uptime: {formatUptime(metrics?.system.uptime || 0)}
                      </Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        {/* Version Info */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Version Information
          </Typography>
          <Card>
            <CardContent>
              {versionLoading ? (
                <CircularProgress size={24} />
              ) : versionError ? (
                <Alert severity="error">Failed to load version info</Alert>
              ) : (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary">
                      Application
                    </Typography>
                    <Typography variant="body1">{version?.name}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary">
                      Version
                    </Typography>
                    <Typography variant="body1">{version?.version}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary">
                      API Version
                    </Typography>
                    <Typography variant="body1">{version?.apiVersion}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary">
                      Node.js
                    </Typography>
                    <Typography variant="body1">{version?.nodeVersion}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary">
                      Environment
                    </Typography>
                    <Typography variant="body1">{version?.environment}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary">
                      Platform
                    </Typography>
                    <Typography variant="body1">{version?.platform} {version?.arch}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary">
                      Uptime
                    </Typography>
                    <Typography variant="body1">{formatUptime(version?.uptime || 0)}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="textSecondary">
                      Build Date
                    </Typography>
                    <Typography variant="body1">
                      {new Date(version?.buildDate || '').toLocaleString()}
                    </Typography>
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SystemDashboard;