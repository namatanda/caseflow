import React from 'react';
import { TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material';

interface InputProps extends Omit<TextFieldProps, 'variant'> {
  // Add any custom props if needed
}

export const Input: React.FC<InputProps> = (props) => {
  return (
    <TextField
      variant="outlined"
      fullWidth
      {...props}
    />
  );
};