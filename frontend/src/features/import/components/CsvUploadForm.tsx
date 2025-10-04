import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Button,
  Typography,
  Paper,
  LinearProgress,
  Alert,
  Card,
  CardContent,
} from '@mui/material';
import { CloudUpload, CheckCircle, Error, InsertDriveFile } from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { importAPI } from '@/api/endpoints/import';
import { useImportStore } from '@/store/importStore';
import { useWebSocket } from '@/hooks/useWebSocket';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.csv'],
};

export const CsvUploadForm: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { subscribeToImport } = useWebSocket();
  const addBatch = useImportStore((state) => state.addBatch);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await importAPI.uploadCsv(file);
      return response.data;
    },
    onSuccess: (data) => {
      setSuccess(`File uploaded successfully. Batch ID: ${data.batchId}`);
      setSelectedFile(null);
      setUploadProgress(0);

      // Subscribe to WebSocket updates for this batch
      subscribeToImport(data.batchId);

      // Add to recent batches
      addBatch({
        id: data.batchId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        status: 'PENDING',
        totalRecords: 0,
        processedRecords: 0,
        validRecords: 0,
        invalidRecords: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    onError: (error: any) => {
      setError(error.response?.data?.message || 'Upload failed');
      setUploadProgress(0);
    },
  });

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 10MB';
    }

    const isCsv = Object.keys(ACCEPTED_TYPES).some((type) =>
      file.type === type || ACCEPTED_TYPES[type as keyof typeof ACCEPTED_TYPES].some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      )
    );

    if (!isCsv) {
      return 'Only CSV files are allowed';
    }

    return null;
  };

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError(null);
    setSuccess(null);

    if (rejectedFiles.length > 0) {
      setError('Some files were rejected. Please check file type and size.');
      return;
    }

    if (acceptedFiles.length === 0) {
      return;
    }

    const file = acceptedFiles[0];
    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadProgress(10); // Start progress

    try {
      await uploadMutation.mutateAsync(selectedFile);
    } catch (error) {
      // Error handled in mutation
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          CSV File Upload
        </Typography>

        <Box
          {...getRootProps()}
          sx={{
            border: '2px dashed',
            borderColor: isDragActive ? 'primary.main' : 'grey.300',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: isDragActive ? 'action.hover' : 'background.paper',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
            },
          }}
        >
          <input {...getInputProps()} />
          <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {isDragActive ? 'Drop the CSV file here' : 'Drag & drop a CSV file here'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            or click to select a file
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Maximum file size: 10MB
          </Typography>
        </Box>

        {selectedFile && (
          <Box sx={{ mt: 2 }}>
            <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box>
                  <InsertDriveFile color="primary" />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body1">{selectedFile.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Typography>
                </Box>
                <Box>
                  <Button
                    variant="contained"
                    onClick={handleUpload}
                    disabled={uploadMutation.isPending}
                    startIcon={uploadMutation.isPending ? undefined : <CloudUpload />}
                  >
                    {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
                  </Button>
                </Box>
                <Box>
                  <Button variant="outlined" onClick={handleCancel} disabled={uploadMutation.isPending}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            </Paper>

            {uploadProgress > 0 && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {uploadProgress < 100 ? 'Uploading...' : 'Processing...'}
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} icon={<Error />}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mt: 2 }} icon={<CheckCircle />}>
            {success}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};