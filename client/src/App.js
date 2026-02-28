import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const OCTAVERiskAssessment = lazy(() => import('./pages/OCTAVERiskAssessment'));
const AssetInventory = lazy(() => import('./pages/AssetInventory'));
const ComplianceScoring = lazy(() => import('./pages/ComplianceScoring'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const ReportGenerator = lazy(() => import('./pages/ReportGenerator'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const OrganizationManagement = lazy(() => import('./pages/OrganizationManagement'));
const ThreatVulnerability = lazy(() => import('./pages/ThreatVulnerability'));
const RiskAssessmentEngine = lazy(() => import('./pages/RiskAssessmentEngine'));
const ControlAuditChecklist = lazy(() => import('./pages/ControlAuditChecklist'));
const AuditEvidenceCollection = lazy(() => import('./pages/AuditEvidenceCollection'));
const AuditFindingsGenerator = lazy(() => import('./pages/AuditFindingsGenerator'));

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6366f1',
      light: '#818cf8',
      dark: '#4f46e5',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ec4899',
      light: '#f472b6',
      dark: '#db2777',
      contrastText: '#ffffff',
    },
    error: {
      main: '#ef4444',
      light: '#f87171',
      dark: '#dc2626',
    },
    warning: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    info: {
      main: '#3b82f6',
      light: '#60a5fa',
      dark: '#2563eb',
    },
    success: {
      main: '#10b981',
      light: '#34d399',
      dark: '#059669',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    grey: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.025em' },
    h2: { fontWeight: 700, letterSpacing: '-0.025em' },
    h3: { fontWeight: 600, letterSpacing: '-0.025em' },
    h4: { fontWeight: 600, letterSpacing: '-0.025em' },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
          border: '1px solid #e2e8f0',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          textTransform: 'none',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          },
        },
        contained: {
          '&:hover': {
            transform: 'translateY(-1px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid #e2e8f0',
          boxShadow: 'none',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          margin: '4px 8px',
          '&.Mui-selected': {
            backgroundColor: '#6366f1',
            color: '#ffffff',
            '&:hover': {
              backgroundColor: '#4f46e5',
            },
            '& .MuiListItemIcon-root': {
              color: '#ffffff',
            },
          },
        },
      },
    },
  },
});

function PrivateRoute({ children, requiredRole }) {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/dashboard" />;
  }
  
  return children;
}

function App() {
  const fallback = (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <CircularProgress size={32} />
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Suspense fallback={fallback}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                <PrivateRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/risk-assessment" element={
                <PrivateRoute>
                  <Layout>
                    <OCTAVERiskAssessment />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/assets" element={
                <PrivateRoute>
                  <Layout>
                    <AssetInventory />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/threat-vulnerability" element={
                <PrivateRoute>
                  <Layout>
                    <ThreatVulnerability />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/risk-engine" element={
                <PrivateRoute>
                  <Layout>
                    <RiskAssessmentEngine />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/control-checklist" element={
                <PrivateRoute>
                  <Layout>
                    <ControlAuditChecklist />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/evidence-collection" element={
                <PrivateRoute>
                  <Layout>
                    <AuditEvidenceCollection />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/compliance" element={
                <PrivateRoute>
                  <Layout>
                    <ComplianceScoring />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/findings-generator" element={
                <PrivateRoute>
                  <Layout>
                    <AuditFindingsGenerator />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/ai-assistant" element={
                <PrivateRoute>
                  <Layout>
                    <AIAssistant />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/reports" element={
                <PrivateRoute>
                  <Layout>
                    <ReportGenerator />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/users" element={
                <PrivateRoute requiredRole="admin">
                  <Layout>
                    <UserManagement />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="/organizations" element={
                <PrivateRoute>
                  <Layout>
                    <OrganizationManagement />
                  </Layout>
                </PrivateRoute>
              } />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
