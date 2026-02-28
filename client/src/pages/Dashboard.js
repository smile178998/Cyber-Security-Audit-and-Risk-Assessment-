import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Paper,
  Chip,
  Avatar,
  IconButton,
  LinearProgress,
  Fade,
  Zoom,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Badge,
} from '@mui/material';
import {
  Assessment,
  Security,
  CheckCircle,
  TrendingUp,
  Business,
  Gavel,
  Speed,
  Warning,
  ArrowForward,
  SmartToy,
  People,
  Assignment,
  Schedule,
  Flag,
  Notifications,
  Done,
  Pending,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

const DASHBOARD_CACHE_KEY = 'dashboard_cache_v1';

const readDashboardCache = () => {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_e) {
    return null;
  }
};

const writeDashboardCache = (payload) => {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  } catch (_e) {
    // Ignore cache write failures.
  }
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cached = readDashboardCache();
  const [stats, setStats] = useState(cached?.stats || {});
  const [loading, setLoading] = useState(!cached);
  const [mounted, setMounted] = useState(false);
  const [recentAudits, setRecentAudits] = useState(Array.isArray(cached?.recentAudits) ? cached.recentAudits : []);
  const [myTasks, setMyTasks] = useState(Array.isArray(cached?.myTasks) ? cached.myTasks : []);
  const [lastUpdated, setLastUpdated] = useState(cached?.lastUpdated ? new Date(cached.lastUpdated) : null);
  const [refreshing, setRefreshing] = useState(false);
  const REFRESH_INTERVAL_MS = 10000;

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchDashboardData = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      let statsUrl = '/api/dashboard/stats';
      if (user?.role === 'auditee') {
        statsUrl = '/api/dashboard/auditee-stats';
      } else if (user?.role === 'auditor') {
        statsUrl = '/api/dashboard/auditor-stats';
      }

      const statsResponse = await api.get(statsUrl.replace('/api', ''));
      const rawStats = statsResponse.data || {};
      const normalizedStats = {
        ...rawStats,
        totalUsers: rawStats.totalUsers ?? rawStats.users ?? 0,
        totalAudits: rawStats.totalAudits ?? rawStats.audits ?? 0,
        totalOrganizations: rawStats.totalOrganizations ?? rawStats.organizations ?? 0,
        totalAssets: rawStats.totalAssets ?? rawStats.assets ?? 0,
        myAudits: rawStats.myAudits ?? rawStats.assigned_audits ?? 0,
        completedAudits: rawStats.completedAudits ?? rawStats.completed_audits ?? 0,
        pendingReview: rawStats.pendingReview ?? rawStats.pending_review ?? 0,
        overdueAudits: rawStats.overdueAudits ?? rawStats.overdue_audits ?? 0,
        myTasks: rawStats.myTasks ?? rawStats.audits ?? 0,
      };
      setStats(normalizedStats);
      setLoading(false);

      const [auditsResult, tasksResult] = await Promise.allSettled([
        user?.role === 'auditor' ? api.get('/audits/my-audits') : api.get('/audits'),
        user?.role === 'auditee' ? api.get('/audits/my-tasks') : Promise.resolve({ data: { data: [] } }),
      ]);

      const audits =
        auditsResult.status === 'fulfilled'
          ? (auditsResult.value.data?.data || [])
          : [];
      const tasks =
        tasksResult.status === 'fulfilled'
          ? (tasksResult.value.data?.data || [])
          : [];

      const nextRecentAudits = Array.isArray(audits) ? audits.slice(0, 5) : [];
      const nextTasks = Array.isArray(tasks) ? tasks : [];
      const now = new Date();

      if (user?.role === 'auditor') {
        const allAudits = Array.isArray(audits) ? audits : [];
        const completedAudits = allAudits.filter((a) => String(a.status || '').toLowerCase() === 'completed').length;
        const pendingReview = allAudits.filter((a) => {
          const status = String(a.status || '').toLowerCase();
          return status === 'pending' || status === 'in_progress';
        }).length;
        const overdueAudits = allAudits.filter((a) => {
          const status = String(a.status || '').toLowerCase();
          if (status === 'completed') return false;
          if (!a.end_date) return false;
          const due = new Date(a.end_date);
          return !Number.isNaN(due.getTime()) && due < now;
        }).length;

        setStats((prev) => ({
          ...prev,
          myAudits: allAudits.length,
          completedAudits,
          pendingReview,
          overdueAudits
        }));
      }

      setRecentAudits(nextRecentAudits);
      if (user?.role === 'auditee') setMyTasks(nextTasks);
      setLastUpdated(now);

      writeDashboardCache({
        stats: normalizedStats,
        recentAudits: nextRecentAudits,
        myTasks: user?.role === 'auditee' ? nextTasks : [],
        lastUpdated: now.toISOString(),
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (!readDashboardCache()) {
        setRecentAudits([]);
        setMyTasks([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role]);

  useEffect(() => {
    fetchDashboardData(false);

    const timer = setInterval(() => {
      fetchDashboardData(true);
    }, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(true);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchDashboardData]);

  const safeDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    const d = new Date(dateValue);
    return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const StatCard = ({ title, value, subtitle, icon, color, gradient, delay }) => (
    <Zoom in={mounted} style={{ transitionDelay: `${delay}ms` }}>
      <Card
        sx={{
          height: '100%',
          background: gradient,
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            right: 0,
            width: '150px',
            height: '150px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '50%',
            transform: 'translate(50%, -50%)',
          },
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 1, fontWeight: 500 }}>
                {title}
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                {value}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {subtitle}
              </Typography>
            </Box>
            <Avatar
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                width: 56,
                height: 56,
                backdropFilter: 'blur(10px)',
              }}
            >
              {icon}
            </Avatar>
          </Box>
        </CardContent>
      </Card>
    </Zoom>
  );

  const QuickActionCard = ({ title, description, icon, color, onClick, delay }) => {
    const handleClick = () => {
      console.log('Button clicked:', title);
      if (onClick && typeof onClick === 'function') {
        onClick();
      }
    };

    return (
      <Zoom in={mounted} style={{ transitionDelay: `${delay}ms` }}>
        <Card
          onClick={handleClick}
          sx={{
            cursor: 'pointer',
            height: '100%',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-4px)',
              boxShadow: '0 12px 24px -8px rgba(0,0,0,0.15)',
            },
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar sx={{ bgcolor: `${color}15`, color: color, width: 48, height: 48 }}>
                {icon}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {title}
                </Typography>
              </Box>
              <IconButton size="small" sx={{ color: 'grey.400' }}>
                <ArrowForward />
              </IconButton>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </CardContent>
        </Card>
      </Zoom>
    );
  };

  // ==================== ADMIN DASHBOARD ====================
  const AdminDashboard = () => (
    <>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Users"
            value={stats.totalUsers || 0}
            subtitle="Active accounts"
            icon={<People sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
            delay={100}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Audits"
            value={stats.totalAudits || 0}
            subtitle="All projects"
            icon={<Gavel sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #10b981 0%, #34d399 100%)"
            delay={200}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Organizations"
            value={stats.totalOrganizations || 0}
            subtitle="Registered orgs"
            icon={<Business sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)"
            delay={300}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Assets"
            value={stats.totalAssets || 0}
            subtitle="In inventory"
            icon={<Assignment sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #ec4899 0%, #f472b6 100%)"
            delay={400}
          />
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: 'grey.800' }}>
        Administration
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="User Management"
            description="Manage user accounts and permissions"
            icon={<People />}
            color="#6366f1"
            onClick={() => navigate('/users')}
            delay={500}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Security Audit"
            description="Create and manage security audits"
            icon={<Security />}
            color="#10b981"
            onClick={() => navigate('/control-checklist')}
            delay={600}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Asset Inventory"
            description="Manage all organizational assets"
            icon={<Business />}
            color="#f59e0b"
            onClick={() => navigate('/assets')}
            delay={700}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Risk Assessment"
            description="Evaluate security risks across organization"
            icon={<Assessment />}
            color="#ec4899"
            onClick={() => navigate('/risk-assessment')}
            delay={800}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Compliance Management"
            description="Monitor compliance across frameworks"
            icon={<CheckCircle />}
            color="#3b82f6"
            onClick={() => navigate('/compliance')}
            delay={900}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="System Reports"
            description="Generate comprehensive system reports"
            icon={<Speed />}
            color="#8b5cf6"
            onClick={() => navigate('/reports')}
            delay={1000}
          />
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Recent Audits
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Audit Name</TableCell>
                <TableCell>Organization</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Auditor</TableCell>
                <TableCell>Due Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentAudits.map((audit) => (
                <TableRow key={audit.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{audit.title}</TableCell>
                  <TableCell>{audit.organization_name || 'N/A'}</TableCell>
                  <TableCell>
                    <Chip
                      label={audit.status}
                      size="small"
                      color={
                        audit.status === 'completed' ? 'success' :
                        audit.status === 'in_progress' ? 'primary' :
                        audit.status === 'failed' ? 'error' : 'default'
                      }
                    />
                  </TableCell>
                  <TableCell>{audit.auditor_name}</TableCell>
                  <TableCell>{safeDate(audit.end_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );

  // ==================== AUDITOR DASHBOARD ====================
  const AuditorDashboard = () => (
    <>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="My Audits"
            value={stats.myAudits || 0}
            subtitle="Assigned to me"
            icon={<Assignment sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
            delay={100}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Pending Review"
            value={stats.pendingReview || 0}
            subtitle="Need attention"
            icon={<Pending sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)"
            delay={200}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completed"
            value={stats.completedAudits || 0}
            subtitle="This month"
            icon={<CheckCircle sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #10b981 0%, #34d399 100%)"
            delay={300}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Overdue"
            value={stats.overdueAudits || 0}
            subtitle="Urgent attention"
            icon={<Warning sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #ef4444 0%, #f87171 100%)"
            delay={400}
          />
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: 'grey.800' }}>
        Auditor Tools
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Security Audit"
            description="Conduct compliance and security audits"
            icon={<Security />}
            color="#6366f1"
            onClick={() => navigate('/control-checklist')}
            delay={500}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Risk Assessment"
            description="Perform OCTAVE Allegro risk analysis"
            icon={<Assessment />}
            color="#ec4899"
            onClick={() => navigate('/risk-assessment')}
            delay={600}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Asset Review"
            description="Review and assess organizational assets"
            icon={<Business />}
            color="#f59e0b"
            onClick={() => navigate('/assets')}
            delay={700}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Findings Management"
            description="Document and track audit findings"
            icon={<Flag />}
            color="#ef4444"
            onClick={() => navigate('/findings-generator')}
            delay={800}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Compliance Scoring"
            description="Evaluate compliance framework adherence"
            icon={<CheckCircle />}
            color="#10b981"
            onClick={() => navigate('/compliance')}
            delay={900}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Generate Report"
            description="Create audit reports with AI assistance"
            icon={<Speed />}
            color="#3b82f6"
            onClick={() => navigate('/reports')}
            delay={1000}
          />
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          My Assigned Audits
        </Typography>
        <List>
          {recentAudits.slice(0, 5).map((audit, index) => (
            <React.Fragment key={audit.id}>
              <ListItem
                secondaryAction={
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => navigate('/control-checklist')}
                  >
                    View
                  </Button>
                }
              >
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: (() => {
                    const status = String(audit.status || '').toLowerCase();
                    if (status === 'completed') return 'success.main';
                    if (status === 'in_progress') return 'primary.main';
                    return 'warning.main';
                  })() }}>
                    <Gavel />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={audit.title}
                  secondary={`${audit.organization_name || 'N/A'} - Due: ${safeDate(audit.end_date)}`}
                />
              </ListItem>
              {index < recentAudits.slice(0, 5).length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </List>
      </Paper>
    </>
  );

  // ==================== AUDITEE DASHBOARD ====================
  const AuditeeDashboard = () => (
    <>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="My Tasks"
            value={stats.myTasks || 0}
            subtitle="Pending action"
            icon={<Assignment sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
            delay={100}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Evidence Required"
            value={stats.evidenceRequired || 0}
            subtitle="Upload needed"
            icon={<Pending sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)"
            delay={200}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completed"
            value={stats.completedTasks || 0}
            subtitle="Tasks done"
            icon={<CheckCircle sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #10b981 0%, #34d399 100%)"
            delay={300}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Compliance Score"
            value={`${stats.complianceScore || 0}%`}
            subtitle="Organization rating"
            icon={<TrendingUp sx={{ fontSize: 28 }} />}
            gradient="linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)"
            delay={400}
          />
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: 'grey.800' }}>
        My Actions
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Security Audit"
            description="View audit status and requirements"
            icon={<Security />}
            color="#6366f1"
            onClick={() => navigate('/control-checklist')}
            delay={500}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Upload Evidence"
            description="Submit audit evidence and documentation"
            icon={<Done />}
            color="#10b981"
            onClick={() => navigate('/evidence-collection')}
            delay={600}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="My Organization"
            description="View organization assets and profile"
            icon={<Business />}
            color="#f59e0b"
            onClick={() => navigate('/assets')}
            delay={700}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="View Findings"
            description="Review audit findings and recommendations"
            icon={<Flag />}
            color="#ef4444"
            onClick={() => navigate('/findings-generator')}
            delay={800}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="Compliance Status"
            description="Check compliance score and gaps"
            icon={<CheckCircle />}
            color="#3b82f6"
            onClick={() => navigate('/compliance')}
            delay={900}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <QuickActionCard
            title="AI Assistant"
            description="Get help preparing for audits"
            icon={<SmartToy />}
            color="#8b5cf6"
            onClick={() => navigate('/ai-assistant')}
            delay={1000}
          />
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          My Pending Tasks
        </Typography>
        {myTasks.length > 0 ? (
          <List>
            {myTasks.slice(0, 5).map((task, index) => (
              <React.Fragment key={task.id}>
                <ListItem
                  secondaryAction={
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => navigate('/evidence-collection')}
                    >
                      Complete
                    </Button>
                  }
                >
                  <ListItemIcon>
                    <Avatar sx={{ bgcolor: 'warning.main' }}>
                      <Schedule />
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={task.title}
                    secondary={`Due: ${safeDate(task.end_date)} - ${task.audit_title || 'Audit Task'}`}
                  />
                </ListItem>
                {index < myTasks.slice(0, 5).length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" color="success.main">
              All tasks completed!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You have no pending audit tasks
            </Typography>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Audit Notifications
        </Typography>
        <List>
          <ListItem>
            <ListItemIcon>
              <Avatar sx={{ bgcolor: 'info.main' }}>
                <Notifications />
              </Avatar>
            </ListItemIcon>
            <ListItemText
              primary="Upcoming Audit"
              secondary="Quarterly security audit scheduled for next week"
            />
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemIcon>
              <Avatar sx={{ bgcolor: 'success.main' }}>
                <Done />
              </Avatar>
            </ListItemIcon>
            <ListItemText
              primary="Evidence Approved"
              secondary="Your submitted evidence has been approved by auditor"
            />
          </ListItem>
        </List>
      </Paper>
    </>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Loading Dashboard
          </Typography>
          <LinearProgress sx={{ width: 200, borderRadius: 2 }} />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
      {/* Header Section */}
      <Fade in={mounted}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: 'grey.800' }}>
            {getGreeting()}, {user?.full_name?.split(' ')[0]}! 👋
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {user?.role === 'admin' && 'Manage your cybersecurity audit platform'}
            {user?.role === 'auditor' && 'Review and conduct security audits'}
            {user?.role === 'auditee' && 'View your audit tasks and compliance status'}
          </Typography>
          <Chip
            label={user?.role?.toUpperCase()}
            color={
              user?.role === 'admin' ? 'error' :
              user?.role === 'auditor' ? 'primary' :
              'success'
            }
            size="small"
            sx={{ mt: 1, fontWeight: 600 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {refreshing ? 'Syncing live data...' : `Last synced: ${lastUpdated ? lastUpdated.toLocaleString() : 'N/A'}`}
          </Typography>
        </Box>
      </Fade>

      {/* Role-Based Dashboard Content */}
      {user?.role === 'admin' && <AdminDashboard />}
      {user?.role === 'auditor' && <AuditorDashboard />}
      {user?.role === 'auditee' && <AuditeeDashboard />}

      {/* System Status Footer */}
      <Fade in={mounted} style={{ transitionDelay: '1200ms' }}>
        <Paper sx={{ mt: 4, p: 3, background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              System Status
            </Typography>
            <Chip
              label="Operational"
              color="success"
              size="small"
              sx={{ fontWeight: 600 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Database Connection
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.main' }}>
                Connected
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                AI Services
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.main' }}>
                Available
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Last Updated
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {lastUpdated ? lastUpdated.toLocaleString() : 'N/A'}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Fade>
    </Box>
  );
};

export default Dashboard;
