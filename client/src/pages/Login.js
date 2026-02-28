import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Avatar,
  Divider,
} from '@mui/material';
import { LockOutlined, SecurityOutlined } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1976d2 0%, #dc004e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
      }}
    >
      <Container component="main" maxWidth="sm">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: 'secondary.main', width: 64, height: 64 }}>
            <SecurityOutlined fontSize="large" />
          </Avatar>
          <Typography component="h1" variant="h4" sx={{ color: 'white', mb: 2 }}>
            CYBERSEC AURA
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mb: 4 }}>
            Cyber Security Audit and Risk Assessment
          </Typography>
        </Box>

        <Paper 
          elevation={10} 
          sx={{ 
            p: 4, 
            width: '100%', 
            maxWidth: 400,
            mx: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <Typography component="h2" variant="h5" align="center" sx={{ mb: 3 }}>
          
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <Button
              type="submit" 
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2, py: 1.5 }}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <LockOutlined />}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </Box>

          <Divider sx={{ my: 2, width: '100%' }} />
          
          <Card variant="outlined" sx={{ width: '100%' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="h6" gutterBottom>
                Demo Accounts
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Admin:</strong> admin@cybersec.com / admin123<br/>
                <strong>Auditor:</strong> auditor@cybersec.com / auditor123<br/>
                <strong>Auditee:</strong> auditee@cybersec.com / auditee123
              </Typography>
            </CardContent>
          </Card>
        </Paper>
      </Container>
    </Box>
  );
};

export default Login;
