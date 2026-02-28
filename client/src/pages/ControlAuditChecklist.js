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
  CircularProgress,
  Alert,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit,
  Delete,
  Security,
  CheckCircle,
  Warning,
  Error,
} from '@mui/icons-material';
import api from '../utils/api';

const ControlAuditChecklist = () => {
  const [checklist, setChecklist] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    control_id: '',
    control_name: '',
    control_description: '',
    category: 'Access Control',
    compliance_status: 'Not Assessed',
    evidence_required: true,
    findings: ''
  });

  const getDefaultCategory = () => 'Risk Governance';

  // Load checklist on component mount
  useEffect(() => {
    loadChecklist();
  }, []);

  const loadChecklist = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/audit-checklist', {
        params: {
          framework: 'OCTAVE Allegro',
          seed_template: 1
        },
        cache: false
      });
      setChecklist(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      console.error('Error loading checklist:', error);
      setError('Failed to load audit checklist');
      setChecklist([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setFormData({
      control_id: '',
      control_name: '',
      control_description: '',
      category: getDefaultCategory(),
      compliance_status: 'Not Assessed',
      evidence_required: true,
      findings: ''
    });
    setDialogOpen(true);
    setError('');
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setFormData({
      control_id: item.control_id || '',
      control_name: item.control_name || '',
      control_description: item.control_description || '',
      category: item.category || 'Access Control',
      compliance_status: item.compliance_status || 'Not Assessed',
      evidence_required: item.evidence_required !== false,
      findings: item.findings || ''
    });
    setDialogOpen(true);
    setError('');
  };

  const handleDeleteItem = async (itemId) => {
    if (window.confirm('Are you sure you want to delete this checklist item?')) {
      try {
        setError('');
        await api.delete(`/audit-checklist/${itemId}`);
        await loadChecklist();
        alert('Checklist item deleted successfully');
      } catch (error) {
        console.error('Error deleting item:', error);
        setError(error.response?.data?.error || 'Failed to delete checklist item');
      }
    }
  };

  const handleSubmit = async () => {
    // Basic validation
    if (!formData.control_id.trim()) {
      setError('Control ID is required');
      return;
    }
    if (!formData.control_name.trim()) {
      setError('Control name is required');
      return;
    }
    if (!formData.control_description.trim()) {
      setError('Control description is required');
      return;
    }
    
    try {
      setError('');
      if (editingItem) {
        await api.put(`/audit-checklist/${editingItem.id}`, formData);
        alert('Checklist item updated successfully');
      } else {
        await api.post('/audit-checklist', formData);
        alert('Checklist item created successfully');
      }
      
      setDialogOpen(false);
      setEditingItem(null);
      await loadChecklist();
    } catch (error) {
      console.error('Error saving checklist item:', error);
      setError(error.response?.data?.error || 'Failed to save checklist item');
    }
  };

  const handleInputChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData({
      ...formData,
      [field]: value
    });
  };

  const getComplianceColor = (status) => {
    const colors = {
      'Compliant': '#4caf50',
      'Non-Compliant': '#f44336',
      'Partially Compliant': '#ff9800',
      'Not Assessed': '#9e9e9e'
    };
    return colors[status] || '#9e9e9e';
  };

  const getComplianceIcon = (status) => {
    switch (status) {
      case 'Compliant':
        return <CheckCircle sx={{ fontSize: 16, color: getComplianceColor(status) }} />;
      case 'Non-Compliant':
        return <Error sx={{ fontSize: 16, color: getComplianceColor(status) }} />;
      case 'Partially Compliant':
        return <Warning sx={{ fontSize: 16, color: getComplianceColor(status) }} />;
      default:
        return <Warning sx={{ fontSize: 16, color: getComplianceColor(status) }} />;
    }
  };

  const getStats = () => {
    const total = checklist.length;
    const compliant = checklist.filter(item => item.compliance_status === 'Compliant').length;
    const nonCompliant = checklist.filter(item => item.compliance_status === 'Non-Compliant').length;
    const partiallyCompliant = checklist.filter(item => item.compliance_status === 'Partially Compliant').length;
    const notAssessed = checklist.filter(item => item.compliance_status === 'Not Assessed').length;
    
    return { total, compliant, nonCompliant, partiallyCompliant, notAssessed };
  };

  const stats = getStats();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1">
            Control Audit Checklist
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Security Audit Module: checklist is generated by OCTAVE Allegro (risk-centric analysis).
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddItem}
          >
            Add Control
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" color="primary">
                {stats.total}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Controls
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getComplianceColor('Compliant') }}>
                {stats.compliant}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Compliant
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getComplianceColor('Non-Compliant') }}>
                {stats.nonCompliant}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Non-Compliant
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getComplianceColor('Partially Compliant') }}>
                {stats.partiallyCompliant}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Partially Compliant
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getComplianceColor('Not Assessed') }}>
                {stats.notAssessed}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Not Assessed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Control ID</TableCell>
                  <TableCell>Control Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Compliance Status</TableCell>
                  <TableCell>Evidence Required</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {checklist.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        No checklist items found. Click "Add Control" to create your first control.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  checklist.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {item.control_id}
                        </Typography>
                      </TableCell>
                      <TableCell>{item.control_name}</TableCell>
                      <TableCell>
                        <Chip 
                          label={item.category} 
                          size="small" 
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {item.control_description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {getComplianceIcon(item.compliance_status)}
                          <Chip
                            label={item.compliance_status}
                            size="small"
                            sx={{
                              backgroundColor: getComplianceColor(item.compliance_status),
                              color: 'white'
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={item.evidence_required !== false}
                          disabled
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton 
                          size="small" 
                          color="primary" 
                          onClick={() => handleEditItem(item)}
                        >
                          <Edit />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          color="error" 
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingItem ? 'Edit Control' : 'Add New Control'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Control ID"
                value={formData.control_id}
                onChange={handleInputChange('control_id')}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  onChange={handleInputChange('category')}
                  label="Category"
                >
                  <MenuItem value="Risk Governance">Risk Governance</MenuItem>
                  <MenuItem value="Asset Profiling">Asset Profiling</MenuItem>
                  <MenuItem value="Container Profiling">Container Profiling</MenuItem>
                  <MenuItem value="Threat Analysis">Threat Analysis</MenuItem>
                  <MenuItem value="Risk Analysis">Risk Analysis</MenuItem>
                  <MenuItem value="Mitigation Planning">Mitigation Planning</MenuItem>
                  <MenuItem value="Evidence Management">Evidence Management</MenuItem>
                  <MenuItem value="Reporting">Reporting</MenuItem>
                  <MenuItem value="Access Control">Access Control</MenuItem>
                  <MenuItem value="Cryptography">Cryptography</MenuItem>
                  <MenuItem value="Physical Security">Physical Security</MenuItem>
                  <MenuItem value="Operations Security">Operations Security</MenuItem>
                  <MenuItem value="Communications Security">Communications Security</MenuItem>
                  <MenuItem value="System Acquisition">System Acquisition</MenuItem>
                  <MenuItem value="Supply Chain">Supply Chain</MenuItem>
                  <MenuItem value="Incident Management">Incident Management</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Control Name"
                value={formData.control_name}
                onChange={handleInputChange('control_name')}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Control Description"
                value={formData.control_description}
                onChange={handleInputChange('control_description')}
                multiline
                rows={3}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Compliance Status</InputLabel>
                <Select
                  value={formData.compliance_status}
                  onChange={handleInputChange('compliance_status')}
                  label="Compliance Status"
                >
                  <MenuItem value="Not Assessed">Not Assessed</MenuItem>
                  <MenuItem value="Compliant">Compliant</MenuItem>
                  <MenuItem value="Partially Compliant">Partially Compliant</MenuItem>
                  <MenuItem value="Non-Compliant">Non-Compliant</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.evidence_required}
                    onChange={handleInputChange('evidence_required')}
                  />
                }
                label="Evidence Required"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Findings"
                value={formData.findings}
                onChange={handleInputChange('findings')}
                multiline
                rows={3}
                placeholder="Any findings or observations..."
              />
            </Grid>
          </Grid>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            color="primary"
          >
            {editingItem ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ControlAuditChecklist;
