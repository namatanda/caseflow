import React from 'react';
import { LinearProgress, Box, Typography } from '@mui/material';
import type { LinearProgressProps } from '@mui/material';

interface ProgressBarProps extends LinearProgressProps {
  value?: number;
  label?: string;
  showPercentage?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  label,
  showPercentage = false,
  ...props
}) => {
  return (
    <Box width="100%">
      {label && (
        <Typography variant="body2" gutterBottom>
          {label}
        </Typography>
      )}
      <LinearProgress variant="determinate" value={value} {...props} />
      {showPercentage && value !== undefined && (
        <Typography variant="body2" color="textSecondary" align="right">
          {Math.round(value)}%
        </Typography>
      )}
    </Box>
  );
};