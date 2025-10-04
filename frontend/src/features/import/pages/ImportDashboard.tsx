import React, { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
  Grid,
  Alert,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { importAPI } from '@/api/endpoints/import';
import { useImportStore } from '@/store/importStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CsvUploadForm } from '../components/CsvUploadForm';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'PROCESSING':
      return 'info';
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'error';
    default:
      return 'default';
  }
};

const getStageColor = (stage: string) => {
  switch (stage) {
    case 'queued':
      return 'warning';
    case 'validation':
      return 'info';
    case 'parsing':
      return 'info';
    case 'importing':
      return 'primary';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
};

const ImportDashboard: React.FC = () => {
  const { activeImports, recentBatches, setRecentBatches } = useImportStore();

  // Initialize WebSocket connection
  useWebSocket();

  // Fetch recent batches
  const { data: batchesData, isLoading, error } = useQuery({
    queryKey: ['recentBatches'],
    queryFn: () => importAPI.getRecentBatches({ limit: 50 }),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  useEffect(() => {
    if (batchesData?.data) {
      setRecentBatches(batchesData.data.batches);
    }
  }, [batchesData, setRecentBatches]);

  // Calculate statistics
  const totalBatches = recentBatches.length;
  const completedBatches = recentBatches.filter(b => b.status === 'COMPLETED').length;
  const failedBatches = recentBatches.filter(b => b.status === 'FAILED').length;
  const processingBatches = recentBatches.filter(b => b.status === 'PROCESSING').length;

  const totalRecords = recentBatches.reduce((sum, b) => sum + b.totalRecords, 0);
  const validRecords = recentBatches.reduce((sum, b) => sum + b.validRecords, 0);
  const invalidRecords = recentBatches.reduce((sum, b) => sum + b.invalidRecords, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        CSV Import Dashboard
      </Typography>

      <Grid container spacing={3}>
        {/* Upload Form */}
        <Grid item xs={12} md={6}>
          <CsvUploadForm />
        </Grid>

        {/* Statistics Cards */}
        <Grid item xs={12} md={6}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Batches
                  </Typography>
                  <Typography variant="h4">{totalBatches}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Completed
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {completedBatches}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Processing
                  </Typography>
                  <Typography variant="h4" color="info.main">
                    {processingBatches}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Failed
                  </Typography>
                  <Typography variant="h4" color="error.main">
                    {failedBatches}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        {/* Active Imports */}
        {activeImports.size > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Active Imports
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Batch ID</TableCell>
                        <TableCell>Job ID</TableCell>
                        <TableCell>Stage</TableCell>
                        <TableCell>Progress</TableCell>
                        <TableCell>Records</TableCell>
                        <TableCell>Message</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Array.from(activeImports.entries()).map(([batchId, progress]) => (
                        <TableRow key={batchId}>
                          <TableCell>{batchId}</TableCell>
                          <TableCell>{progress.jobId}</TableCell>
                          <TableCell>
                            <Chip
                              label={progress.stage}
                              color={getStageColor(progress.stage) as any}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={progress.progress}
                                sx={{ flex: 1 }}
                              />
                              <Typography variant="body2">
                                {progress.progress}%
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            {progress.totalRecords ? (
                              <Typography variant="body2">
                                {progress.processedRecords || 0} / {progress.totalRecords}
                              </Typography>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {progress.error ? (
                              <Alert severity="error" sx={{ py: 0 }}>
                                {progress.error}
                              </Alert>
                            ) : (
                              progress.message || '-'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Recent Batches */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Batches
              </Typography>
              {isLoading ? (
                <LinearProgress />
              ) : error ? (
                <Alert severity="error">Failed to load recent batches</Alert>
              ) : (
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Batch ID</TableCell>
                        <TableCell>File Name</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Records</TableCell>
                        <TableCell>Valid</TableCell>
                        <TableCell>Invalid</TableCell>
                        <TableCell>Created</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recentBatches.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell>{batch.id}</TableCell>
                          <TableCell>{batch.fileName}</TableCell>
                          <TableCell>
                            <Chip
                              label={batch.status}
                              color={getStatusColor(batch.status) as any}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>{batch.totalRecords}</TableCell>
                          <TableCell>{batch.validRecords}</TableCell>
                          <TableCell>{batch.invalidRecords}</TableCell>
                          <TableCell>
                            {new Date(batch.createdAt).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ImportDashboard;