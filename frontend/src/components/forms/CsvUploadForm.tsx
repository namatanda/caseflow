import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Button,
  Typography,
  Paper,
  LinearProgress,
  Alert,
} from '@mui/material';
import { CloudUpload as CloudUploadIcon } from '@mui/icons-material';

interface CsvUploadFormProps {
  onUpload: (file: File) => void;
  loading?: boolean;
  progress?: number;
  error?: string;
  maxSize?: number; // in bytes
}

export const CsvUploadForm: React.FC<CsvUploadFormProps> = ({
  onUpload,
  loading = false,
  progress,
  error,
  maxSize = 10 * 1024 * 1024, // 10MB default
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        setSelectedFile(file);
      }
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxSize,
    multiple: false,
    disabled: loading,
  });

  const handleUpload = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Box>
      <Paper
        {...getRootProps()}
        sx={{
          p: 3,
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'grey.300',
          backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <Box textAlign="center">
          <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {isDragActive ? 'Drop the CSV file here' : 'Drag & drop a CSV file here'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            or click to select a file
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Maximum file size: {formatFileSize(maxSize)}
          </Typography>
        </Box>
      </Paper>

      {selectedFile && (
        <Box mt={2}>
          <Typography variant="body2">
            Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
          </Typography>
        </Box>
      )}

      {loading && progress !== undefined && (
        <Box mt={2}>
          <Typography variant="body2" gutterBottom>
            Uploading... {Math.round(progress)}%
          </Typography>
          <LinearProgress variant="determinate" value={progress} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        onClick={handleUpload}
        disabled={!selectedFile || loading}
        sx={{ mt: 2 }}
        fullWidth
      >
        {loading ? 'Uploading...' : 'Upload CSV'}
      </Button>
    </Box>
  );
};