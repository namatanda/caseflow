import React from 'react';
import { Card as MuiCard, CardContent } from '@mui/material';
import type { CardProps } from '@mui/material';

interface CustomCardProps extends CardProps {
  children: React.ReactNode;
}

export const Card: React.FC<CustomCardProps> = ({ children, ...props }) => {
  return (
    <MuiCard {...props}>
      <CardContent>
        {children}
      </CardContent>
    </MuiCard>
  );
};