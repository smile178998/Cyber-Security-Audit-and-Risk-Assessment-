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
} from '@mui/material';
import {
  People,
  Add,
  Edit,
  Delete,
  Security,
  AssignmentInd,
  Refresh,
  Search,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

const UserManagement = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'auditee',
    organization_id: '',
    password: '',
  });
  const [assignData, setAssignData] = useState({
    auditor_id: '',
    audit_id: '',
    organization_id: '',
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('Fetching user data...');
      
      const [usersRes, orgsRes, auditsRes] = await Promise.all([
        api.get('/users'),
        api.get('/organizations'),
        api.get('/audits'),
      ]);
      
      console.log('Users response:', usersRes.data);
      console.log('Organizations response:', orgsRes.data);
      console.log('Audits response:', auditsRes.data);
      
      setUsers(Array.isArray(usersRes.data?.data) ? usersRes.data.data : []);
      setOrganizations(Array.isArray(orgsRes.data?.data) ? orgsRes.data.data : []);
      setAudits(Array.isArray(auditsRes.data?.data) ? auditsRes.data.data : []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    const normalizedEmail = formData.email.trim().toLowerCase();
    const normalizedName = formData.full_name.trim();
    const normalizedPassword = formData.password.trim();

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      const message = 'Full name, email, and password are required';
      setError(message);
      alert(message);
      return;
    }

    if (users.some((u) => String(u.email || '').toLowerCase() === normalizedEmail)) {
      const message = 'This email already exists. Please use a different email.';
      setError(message);
      alert(message);
      return;
    }

    try {
      await api.post('/users', {
        ...formData,
        email: normalizedEmail,
        full_name: normalizedName,
        password: normalizedPassword,
        organization_id: formData.organization_id || null,
      });
      setError('');
      setDialogOpen(false);
      setFormData({ email: '', full_name: '', role: 'auditee', organization_id: '', password: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating user:', error);
      const serverError = error?.response?.data?.error || error.message || 'Failed to create user';
      const message = String(serverError).includes("Duplicate entry")
        ? 'This email already exists. Please use a different email.'
        : serverError;
      setError(message);
      alert(message);
    }
  };

  const handleUpdateUser = async () => {
    try {
      await api.put(`/users/${selectedUser.id}`, {
        ...formData,
        email: formData.email.trim().toLowerCase(),
        full_name: formData.full_name.trim(),
        password: formData.password.trim(),
        organization_id: formData.organization_id || null,
      });
      setError('');
      setDialogOpen(false);
      setSelectedUser(null);
      setFormData({ email: '', full_name: '', role: 'auditee', organization_id: '', password: '' });
      fetchData();
    } catch (error) {
      console.error('Error updating user:', error);
      const message = error?.response?.data?.error || error.message || 'Failed to update user';
      setError(message);
      alert(message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      setError('');
      await api.delete(`/users/${userId}`);
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
      const rawMessage = error?.response?.data?.error || 'Failed to delete user';
      const message = String(rawMessage).toLowerCase().includes('foreign key constraint fails')
        ? 'Cannot delete this user because related records must be reassigned first.'
        : rawMessage;
      setError(message);
      alert(message);
    }
  };

  const handleAssignAuditor = async () => {
    try {
      await api.post('/audits/assign', assignData);
      setAssignDialogOpen(false);
      setAssignData({ auditor_id: '', audit_id: '', organization_id: '' });
      alert('Auditor assigned successfully');
      fetchData();
    } catch (error) {
      console.error('Error assigning auditor:', error);
      alert('Failed to assign auditor');
    }
  };

  const openCreateDialog = () => {
    setSelectedUser(null);
    setFormData({ email: '', full_name: '', role: 'auditee', organization_id: '', password: '' });
    setDialogOpen(true);
  };

  const openEditDialog = (user) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      organization_id: user.organization_id || '',
      password: '',
    });
    setDialogOpen(true);
  };

  const openAssignDialog = () => {
    setAssignData({ auditor_id: '', audit_id: '', organization_id: '' });
    setAssignDialogOpen(true);
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return 'error';
      case 'auditor': return 'primary';
      case 'auditee': return 'success';
      default: return 'default';
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const auditors = users.filter((u) => u.role === 'auditor');
  const auditees = users.filter((u) => u.role === 'auditee');

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Typography>Loading user management...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Fade in={mounted}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: 'grey.800' }}>
            User & Auditor Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage system users and assign auditors to organizations
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
                      {users.length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Total Users
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <People />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '200ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {auditors.length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Auditors
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <Security />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '300ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {auditees.length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Auditees
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <People />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '400ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', color: 'white' }}>
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
                    <AssignmentInd />
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
          Create User
        </Button>
        <Button
          variant="contained"
          startIcon={<AssignmentInd />}
          onClick={openAssignDialog}
          sx={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
            fontWeight: 600,
          }}
        >
          Assign Auditor
        </Button>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={fetchData}
        >
          Refresh
        </Button>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search users by name, email, or role..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: <Search sx={{ mr: 1, color: 'grey.500' }} />,
        }}
      />

      {/* Users Table */}
      <Fade in={mounted} style={{ transitionDelay: '500ms' }}>
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Organization</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: getRoleColor(user.role) + '.main', color: 'white' }}>
                          {user.full_name?.charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {user.full_name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.role.toUpperCase()}
                        color={getRoleColor(user.role)}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      {user.organization_name || (
                        <Typography variant="body2" color="text.secondary">
                          Not assigned
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Edit">
                        <IconButton onClick={() => openEditDialog(user)} color="primary">
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton onClick={() => handleDeleteUser(user.id)} color="error">
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Fade>

      {/* Create/Edit User Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {selectedUser ? 'Edit User' : 'Create New User'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Full Name"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  label="Role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="auditor">Auditor</MenuItem>
                  <MenuItem value="auditee">Auditee</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Organization</InputLabel>
                <Select
                  label="Organization"
                  value={formData.organization_id}
                  onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                >
                  <MenuItem value="">None</MenuItem>
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={org.id}>
                      {org.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={selectedUser ? 'New Password (leave blank to keep current)' : 'Password'}
                type="password"
                required={!selectedUser}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={selectedUser ? handleUpdateUser : handleCreateUser}
            sx={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
          >
            {selectedUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign Auditor Dialog */}
      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Assign Auditor to Audit</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
            Select an auditor and assign them to a specific audit and organization.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Auditor</InputLabel>
                <Select
                  value={assignData.auditor_id}
                  onChange={(e) => setAssignData({ ...assignData, auditor_id: e.target.value })}
                >
                  {auditors.map((auditor) => (
                    <MenuItem key={auditor.id} value={auditor.id}>
                      {auditor.full_name} ({auditor.email})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Organization</InputLabel>
                <Select
                  value={assignData.organization_id}
                  onChange={(e) => setAssignData({ ...assignData, organization_id: e.target.value })}
                >
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={org.id}>
                      {org.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Audit</InputLabel>
                <Select
                  value={assignData.audit_id}
                  onChange={(e) => setAssignData({ ...assignData, audit_id: e.target.value })}
                >
                  {audits.map((audit) => (
                    <MenuItem key={audit.id} value={audit.id}>
                      {audit.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAssignAuditor}
            sx={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' }}
          >
            Assign
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement;
