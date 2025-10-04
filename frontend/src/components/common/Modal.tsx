import React from 'react';
import {
  Modal as MuiModal,
  Box,
  Typography,
  Button,
} from '@mui/material';
import type { ModalProps } from '@mui/material';

interface CustomModalProps extends Omit<ModalProps, 'children'> {
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  actions?: React.ReactNode;
}

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

export const Modal: React.FC<CustomModalProps> = ({
  title,
  children,
  onClose,
  actions,
  ...props
}) => {
  return (
    <MuiModal onClose={onClose} {...props}>
      <Box sx={style}>
        {title && (
          <Typography variant="h6" component="h2" gutterBottom>
            {title}
          </Typography>
        )}
        {children}
        {actions && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            {actions}
          </Box>
        )}
      </Box>
    </MuiModal>
  );
};