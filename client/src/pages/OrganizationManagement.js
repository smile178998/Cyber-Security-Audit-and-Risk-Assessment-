import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  Avatar,
  Fade,
  Zoom,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Business,
  Add,
  Edit,
  Delete,
  Refresh,
  Search,
  People,
  Computer,
  Assessment,
  TrendingUp,
  Warning,
  CheckCircle,
  Public,
  Cloud,
  Lan,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

const OrganizationManagement = () => {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    business_sector: '',
    employee_count: '',
    system_type: [],
    exposure_level: 'Medium',
  });

  const systemTypes = [
    { value: 'web', label: 'Web Application', icon: <Public /> },
    { value: 'cloud', label: 'Cloud Infrastructure', icon: <Cloud /> },
    { value: 'internal', label: 'Internal Network', icon: <Lan /> },
    { value: 'mobile', label: 'Mobile Application', icon: <Computer /> },
  ];

  const businessSectors = [
    'Financial Services',
    'Healthcare',
    'Technology',
    'Manufacturing',
    'Retail',
    'Government',
    'Education',
    'Energy',
    'Telecommunications',
    'Other',
  ];

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [orgsRes, usersRes, assetsRes] = await Promise.all([
        api.get('/organizations'),
        api.get('/users'),
        api.get('/assets'),
      ]);
      setOrganizations(orgsRes.data.data || []);
      setUsers(usersRes.data.data || []);
      setAssets(assetsRes.data.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Auto-calculate exposure level based on system type and employee count
  const calculateExposureLevel = (systemTypes, employeeCount) => {
    let score = 0;
    
    // System type risk scores
    if (systemTypes.includes('web')) score += 3;
    if (systemTypes.includes('cloud')) score += 2;
    if (systemTypes.includes('internal')) score += 1;
    if (systemTypes.includes('mobile')) score += 2;
    
    // Employee count risk scores
    const empCount = parseInt(employeeCount) || 0;
    if (empCount > 1000) score += 3;
    else if (empCount > 500) score += 2;
    else if (empCount > 100) score += 1;
    
    if (score >= 6) return 'High';
    if (score >= 3) return 'Medium';
    return 'Low';
  };

  const handleCreateOrg = async () => {
    try {
      setError('');
      // Simple validation
      if (!formData.name.trim()) {
        setError('Please enter organization name');
        return;
      }
      
      // Auto-calculate exposure level
      const autoExposure = calculateExposureLevel(formData.system_type, formData.employee_count);
      const dataToSend = { 
        name: formData.name.trim(),
        business_sector: formData.business_sector || 'Technology',
        employee_count: parseInt(formData.employee_count) || 50,
        system_type: formData.system_type.join(',') || 'web',
        exposure_level: autoExposure
      };
      
      await api.post('/organizations', dataToSend);
      setDialogOpen(false);
      setFormData({ name: '', business_sector: '', employee_count: '', system_type: [], exposure_level: 'Medium' });
      fetchData();
      alert('Organization created successfully!');
    } catch (error) {
      console.error('Error creating organization:', error);
      setError('Failed to create organization. Please try again.');
    }
  };

  const handleUpdateOrg = async () => {
    try {
      const autoExposure = calculateExposureLevel(formData.system_type, formData.employee_count);
      const dataToSend = { ...formData, exposure_level: autoExposure };
      
      await api.put(`/organizations/${selectedOrg.id}`, dataToSend);
      setDialogOpen(false);
      setSelectedOrg(null);
      setFormData({ name: '', business_sector: '', employee_count: '', system_type: [], exposure_level: 'Medium' });
      fetchData();
    } catch (error) {
      console.error('Error updating organization:', error);
      alert('Failed to update organization');
    }
  };

  const handleDeleteOrg = async (orgId) => {
    if (!window.confirm('Are you sure you want to delete this organization?')) return;
    try {
      setError('');
      await api.delete(`/organizations/${orgId}`);
      fetchData();
    } catch (error) {
      console.error('Error deleting organization:', error);
      const message = error?.response?.data?.error || 'Failed to delete organization';
      setError(message);
      alert(message);
    }
  };

  const openCreateDialog = () => {
    setSelectedOrg(null);
    setFormData({ name: '', business_sector: '', employee_count: '', system_type: [], exposure_level: 'Medium' });
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (org) => {
    setSelectedOrg(org);
    setFormData({
      name: org.name,
      business_sector: org.business_sector || '',
      employee_count: org.employee_count || '',
      system_type: org.system_type ? org.system_type.split(',') : [],
      exposure_level: org.exposure_level || 'Medium',
    });
    setError('');
    setDialogOpen(true);
  };

  const getExposureColor = (level) => {
    switch (level) {
      case 'High': return 'error';
      case 'Medium': return 'warning';
      case 'Low': return 'success';
      case 'Critical': return 'error';
      default: return 'default';
    }
  };

  const getOrgStats = (orgId) => {
    const orgUsers = users.filter((u) => u.organization_id === orgId);
    const orgAssets = assets.filter((a) => a.organization_id === orgId);
    return {
      userCount: orgUsers.length,
      assetCount: orgAssets.length,
    };
  };

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.business_sector?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Typography>Loading organization management...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Fade in={mounted}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: 'grey.800' }}>
            Organization Profile Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Define organizational context for risk analysis (OCTAVE Allegro)
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </Fade>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '100ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {organizations.length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Organizations
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <Business />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '200ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {organizations.filter((o) => o.exposure_level === 'High').length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      High Exposure
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <Warning />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '300ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {organizations.filter((o) => o.exposure_level === 'Medium').length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Medium Exposure
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <Assessment />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '400ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {organizations.filter((o) => o.exposure_level === 'Low').length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Low Exposure
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <CheckCircle />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
      </Grid>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={openCreateDialog}
          sx={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            fontWeight: 600,
          }}
        >
          Create Organization
        </Button>
        <Button variant="outlined" startIcon={<Refresh />} onClick={fetchData}>
          Refresh
        </Button>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search organizations by name or sector..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: <Search sx={{ mr: 1, color: 'grey.500' }} />,
        }}
      />

      {/* Organizations Table */}
      <Fade in={mounted} style={{ transitionDelay: '500ms' }}>
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Organization</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Business Sector</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Employees</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>System Environment</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Exposure Level</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Stats</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredOrganizations.map((org) => {
                  const stats = getOrgStats(org.id);
                  return (
                    <TableRow key={org.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: 'primary.main', color: 'white' }}>
                            <Business />
                          </Avatar>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {org.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{org.business_sector || 'Not specified'}</TableCell>
                      <TableCell>{org.employee_count?.toLocaleString() || 'N/A'}</TableCell>
                      <TableCell>
                        {org.system_type ? (
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {org.system_type.split(',').map((type) => (
                              <Chip
                                key={type}
                                label={systemTypes.find((s) => s.value === type)?.label || type}
                                size="small"
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Not specified
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={org.exposure_level}
                          color={getExposureColor(org.exposure_level)}
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title={`${stats.userCount} users`}>
                            <Chip
                              icon={<People />}
                              label={stats.userCount}
                              size="small"
                              variant="outlined"
                            />
                          </Tooltip>
                          <Tooltip title={`${stats.assetCount} assets`}>
                            <Chip
                              icon={<Computer />}
                              label={stats.assetCount}
                              size="small"
                              variant="outlined"
                            />
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Edit">
                          <IconButton onClick={() => openEditDialog(org)} color="primary">
                            <Edit />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton onClick={() => handleDeleteOrg(org.id)} color="error">
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Fade>

      {/* Create/Edit Organization Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {selectedOrg ? 'Edit Organization' : 'Create New Organization'}
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Auto-calculation:</strong> Exposure level is automatically determined based on system environment and employee count.
            </Typography>
          </Alert>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Organization Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Business Sector</InputLabel>
                <Select
                  value={formData.business_sector}
                  onChange={(e) => setFormData({ ...formData, business_sector: e.target.value })}
                >
                  {businessSectors.map((sector) => (
                    <MenuItem key={sector} value={sector}>
                      {sector}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Number of Employees"
                type="number"
                value={formData.employee_count}
                onChange={(e) => setFormData({ ...formData, employee_count: e.target.value })}
                helperText="Used for automatic exposure level calculation"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>System Environment</InputLabel>
                <Select
                  multiple
                  value={formData.system_type}
                  onChange={(e) => setFormData({ ...formData, system_type: e.target.value })}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip
                          key={value}
                          label={systemTypes.find((s) => s.value === value)?.label}
                          size="small"
                        />
                      ))}
                    </Box>
                  )}
                >
                  {systemTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      <ListItemIcon>{type.icon}</ListItemIcon>
                      <ListItemText primary={type.label} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Alert
                severity={
                  calculateExposureLevel(formData.system_type, formData.employee_count) === 'High'
                    ? 'error'
                    : calculateExposureLevel(formData.system_type, formData.employee_count) === 'Medium'
                    ? 'warning'
                    : 'success'
                }
              >
                <Typography variant="subtitle2">
                  Calculated Exposure Level: {calculateExposureLevel(formData.system_type, formData.employee_count)}
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={selectedOrg ? handleUpdateOrg : handleCreateOrg}
            sx={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
          >
            {selectedOrg ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrganizationManagement;
