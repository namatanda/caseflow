import React from 'react';
import { CircularProgress, Box } from '@mui/material';
import type { CircularProgressProps } from '@mui/material';

interface SpinnerProps extends CircularProgressProps {
  size?: number;
  message?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 40,
  message,
  ...props
}) => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      p={2}
    >
      <CircularProgress size={size} {...props} />
      {message && (
        <Box mt={1}>
          {message}
        </Box>
      )}
    </Box>
  );
};