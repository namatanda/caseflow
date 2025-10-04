import React, { useState, useEffect } from 'react';
import { TextField, Button, Container, Typography, Box, Card, CardContent } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { authAPI } from '@/api/endpoints/auth';

const ProfilePage: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await authAPI.getProfile();
        setUser(response.data);
      } catch (err) {
        setError('Failed to load profile');
      }
    };
    if (!user) {
      fetchProfile();
    }
  }, [user, setUser]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError('Failed to change password');
    }
  };

  if (!user) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>
          Profile
        </Typography>
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6">User Information</Typography>
            <Typography>Name: {user.name}</Typography>
            <Typography>Email: {user.email}</Typography>
            <Typography>Role: {user.role}</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Change Password
            </Typography>
            <Box component="form" onSubmit={handleChangePassword}>
              <TextField
                margin="normal"
                required
                fullWidth
                name="currentPassword"
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="newPassword"
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {error && (
                <Typography color="error" variant="body2">
                  {error}
                </Typography>
              )}
              {success && (
                <Typography color="success" variant="body2">
                  {success}
                </Typography>
              )}
              <Button
                type="submit"
                variant="contained"
                sx={{ mt: 2 }}
              >
                Change Password
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default ProfilePage;