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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Add as AddIcon,
  AutoFixHigh,
  Edit,
  Delete,
  Gavel,
  Warning,
  Error,
  CheckCircle,
  ExpandMore,
  PriorityHigh,
} from '@mui/icons-material';
import api from '../utils/api';

const AuditFindingsGenerator = () => {
  const [findings, setFindings] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFinding, setEditingFinding] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    organization_id: '',
    title: '',
    issue: '',
    risk: '',
    affected_asset: '',
    description: '',
    risk_level: 'Medium',
    category: 'Access Control',
    recommendation: '',
    status: 'Open',
    finding_date: new Date().toISOString().split('T')[0],
    due_date: '',
    assigned_to: '',
    evidence_references: ''
  });

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [findingsRes, orgsRes] = await Promise.all([
        api.get('/audit-findings'),
        api.get('/organizations')
      ]);
      setFindings(findingsRes.data.data || []);
      setOrganizations(orgsRes.data.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError(error.response?.data?.error || 'Failed to load data');
      setFindings([]);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFinding = () => {
    setEditingFinding(null);
    setFormData({
      organization_id: '',
      title: '',
      issue: '',
      risk: '',
      affected_asset: '',
      description: '',
      risk_level: 'Medium',
      category: 'Access Control',
      recommendation: '',
      status: 'Open',
      finding_date: new Date().toISOString().split('T')[0],
      due_date: '',
      assigned_to: '',
      evidence_references: ''
    });
    setDialogOpen(true);
    setError('');
  };

  const handleEditFinding = (finding) => {
    setEditingFinding(finding);
    setFormData({
      organization_id: finding.organization_id || '',
      title: finding.title || '',
      issue: finding.issue || finding.title || finding.description || '',
      risk: finding.risk || finding.risk_level || 'Medium',
      affected_asset: finding.affected_asset || '',
      description: finding.description || '',
      risk_level: finding.risk_level || 'Medium',
      category: finding.category || 'Access Control',
      recommendation: finding.recommendation || '',
      status: finding.status || 'Open',
      finding_date: finding.finding_date || new Date().toISOString().split('T')[0],
      due_date: finding.due_date || '',
      assigned_to: finding.assigned_to || '',
      evidence_references: finding.evidence_references || ''
    });
    setDialogOpen(true);
    setError('');
  };

  const handleDeleteFinding = async (findingId) => {
    if (window.confirm('Are you sure you want to delete this finding?')) {
      try {
        setError('');
        await api.delete(`/audit-findings/${findingId}`);
        await loadData();
        alert('Finding deleted successfully');
      } catch (error) {
        console.error('Error deleting finding:', error);
        setError('Failed to delete finding');
      }
    }
  };

  const handleSubmit = async () => {
    // Basic validation
    if (!formData.organization_id) {
      setError('Please select an organization');
      return;
    }
    if (!formData.issue.trim()) {
      setError('Issue is required');
      return;
    }
    if (!formData.risk.trim()) {
      setError('Risk is required');
      return;
    }
    if (!formData.affected_asset.trim()) {
      setError('Affected asset is required');
      return;
    }
    if (!formData.recommendation.trim()) {
      setError('Recommendation is required');
      return;
    }
    
    try {
      setError('');
      const submitData = {
        ...formData,
        title: formData.title.trim() || formData.issue.trim(),
        description: formData.issue.trim(),
      };
      if (editingFinding) {
        await api.put(`/audit-findings/${editingFinding.id}`, submitData);
        alert('Finding updated successfully');
      } else {
        await api.post('/audit-findings', submitData);
        alert('Finding created successfully');
      }
      
      setDialogOpen(false);
      setEditingFinding(null);
      await loadData();
    } catch (error) {
      console.error('Error saving finding:', error);
      setError(error.response?.data?.error || 'Failed to save finding');
    }
  };

  const handleAutoGenerate = async () => {
    try {
      setGenerating(true);
      setError('');
      const response = await api.post('/findings/auto-generate', {});
      const count = Number(response.data?.created || 0);
      await loadData();
      alert(`Auto-generated ${count} findings`);
    } catch (autoError) {
      console.error('Error auto-generating findings:', autoError);
      setError(autoError.response?.data?.error || 'Failed to auto-generate findings');
    } finally {
      setGenerating(false);
    }
  };

  const handleInputChange = (field) => (event) => {
    setFormData({
      ...formData,
      [field]: event.target.value
    });
  };

  const getOrganizationName = (orgId) => {
    const org = organizations.find(o => Number(o.id) === Number(orgId));
    return org ? org.name : 'Unknown Organization';
  };

  const getRiskLevelColor = (level) => {
    const colors = {
      'Critical': '#d32f2f',
      'High': '#f44336',
      'Medium': '#ff9800',
      'Low': '#4caf50'
    };
    return colors[level] || '#757575';
  };

  const getStatusColor = (status) => {
    const colors = {
      'Open': '#f44336',
      'In Progress': '#ff9800',
      'Closed': '#4caf50',
      'Deferred': '#9e9e9e'
    };
    return colors[status] || '#757575';
  };

  const getRiskLevelIcon = (level) => {
    switch (level) {
      case 'Critical':
        return <Error sx={{ fontSize: 16, color: getRiskLevelColor(level) }} />;
      case 'High':
        return <PriorityHigh sx={{ fontSize: 16, color: getRiskLevelColor(level) }} />;
      case 'Medium':
        return <Warning sx={{ fontSize: 16, color: getRiskLevelColor(level) }} />;
      default:
        return <CheckCircle sx={{ fontSize: 16, color: getRiskLevelColor(level) }} />;
    }
  };

  const getStats = () => {
    const total = findings.length;
    const open = findings.filter(f => f.status === 'Open').length;
    const inProgress = findings.filter(f => f.status === 'In Progress').length;
    const closed = findings.filter(f => f.status === 'Closed').length;
    const critical = findings.filter(f => f.risk_level === 'Critical').length;
    const high = findings.filter(f => f.risk_level === 'High').length;
    
    return { total, open, inProgress, closed, critical, high };
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
        <Typography variant="h4" component="h1">
          Audit Findings Generator
        </Typography>
        <Button
          variant="outlined"
          startIcon={<AutoFixHigh />}
          onClick={handleAutoGenerate}
          disabled={generating}
          sx={{ mr: 1 }}
        >
          {generating ? 'Generating...' : 'Auto Generate'}
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddFinding}
        >
          Add Finding
        </Button>
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
                Total Findings
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getStatusColor('Open') }}>
                {stats.open}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Open
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getStatusColor('In Progress') }}>
                {stats.inProgress}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                In Progress
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getStatusColor('Closed') }}>
                {stats.closed}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Closed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getRiskLevelColor('Critical') }}>
                {stats.critical + stats.high}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Critical/High
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
                  <TableCell>Issue</TableCell>
                  <TableCell>Risk</TableCell>
                  <TableCell>Affected Asset</TableCell>
                  <TableCell>Recommendation</TableCell>
                  <TableCell>Organization</TableCell>
                  <TableCell>Risk Level</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {findings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        No findings found. Use "Auto Generate" or "Add Finding" to create findings.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  findings.map((finding) => (
                    <TableRow key={finding.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium" sx={{ whiteSpace: 'pre-wrap' }}>
                          {finding.issue || finding.title || finding.description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {finding.risk || finding.risk_level || 'Medium'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {finding.affected_asset || 'Control Environment'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {finding.recommendation}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {finding.organization_name || getOrganizationName(finding.organization_id)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {getRiskLevelIcon(finding.risk_level)}
                          <Chip
                            label={finding.risk_level}
                            size="small"
                            sx={{
                              backgroundColor: getRiskLevelColor(finding.risk_level),
                              color: 'white'
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={finding.status}
                          size="small"
                          sx={{
                            backgroundColor: getStatusColor(finding.status),
                            color: 'white'
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton 
                          size="small" 
                          color="primary" 
                          onClick={() => handleEditFinding(finding)}
                        >
                          <Edit />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          color="error" 
                          onClick={() => handleDeleteFinding(finding.id)}
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

      {/* Findings Details Accordion */}
      {findings.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Findings Details
          </Typography>
          {findings.map((finding) => (
            <Accordion key={finding.id}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                  {getRiskLevelIcon(finding.risk_level)}
                  <Typography variant="subtitle1" sx={{ flex: 1 }}>
                    {finding.title}
                  </Typography>
                  <Chip
                    label={finding.status}
                    size="small"
                    sx={{
                      backgroundColor: getStatusColor(finding.status),
                      color: 'white'
                    }}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Organization
                    </Typography>
                    <Typography variant="body2">
                      {finding.organization_name || getOrganizationName(finding.organization_id)}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" gutterBottom>
                      Issue
                    </Typography>
                    <Typography variant="body2">
                      {finding.issue || finding.title || finding.description}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Risk
                    </Typography>
                    <Typography variant="body2">
                      {finding.risk || finding.risk_level || 'Medium'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Affected Asset
                    </Typography>
                    <Typography variant="body2">
                      {finding.affected_asset || 'Control Environment'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Recommendation
                    </Typography>
                    <Typography variant="body2">
                      {finding.recommendation}
                    </Typography>
                  </Grid>
                  {finding.evidence_references && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom>
                        Evidence References
                      </Typography>
                      <Typography variant="body2">
                        {finding.evidence_references}
                      </Typography>
                    </Grid>
                  )}
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Assigned To
                    </Typography>
                    <Typography variant="body2">
                      {finding.assigned_to || 'Unassigned'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Due Date
                    </Typography>
                    <Typography variant="body2">
                      {finding.due_date || 'Not set'}
                    </Typography>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {editingFinding ? 'Edit Finding' : 'Add New Finding'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Organization</InputLabel>
                <Select
                  value={formData.organization_id}
                  onChange={handleInputChange('organization_id')}
                  label="Organization"
                  required
                >
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={org.id}>
                      {org.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  onChange={handleInputChange('category')}
                  label="Category"
                >
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
                label="Finding Title (Optional)"
                value={formData.title}
                onChange={handleInputChange('title')}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Issue"
                value={formData.issue}
                onChange={handleInputChange('issue')}
                multiline
                rows={3}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Risk"
                value={formData.risk}
                onChange={handleInputChange('risk')}
                multiline
                rows={2}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Affected Asset"
                value={formData.affected_asset}
                onChange={handleInputChange('affected_asset')}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Risk Level</InputLabel>
                <Select
                  value={formData.risk_level}
                  onChange={handleInputChange('risk_level')}
                  label="Risk Level"
                >
                  <MenuItem value="Low">Low</MenuItem>
                  <MenuItem value="Medium">Medium</MenuItem>
                  <MenuItem value="High">High</MenuItem>
                  <MenuItem value="Critical">Critical</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  onChange={handleInputChange('status')}
                  label="Status"
                >
                  <MenuItem value="Open">Open</MenuItem>
                  <MenuItem value="In Progress">In Progress</MenuItem>
                  <MenuItem value="Closed">Closed</MenuItem>
                  <MenuItem value="Deferred">Deferred</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Recommendation"
                value={formData.recommendation}
                onChange={handleInputChange('recommendation')}
                multiline
                rows={4}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Finding Date"
                type="date"
                value={formData.finding_date}
                onChange={handleInputChange('finding_date')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Due Date"
                type="date"
                value={formData.due_date}
                onChange={handleInputChange('due_date')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Assigned To"
                value={formData.assigned_to}
                onChange={handleInputChange('assigned_to')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Evidence References"
                value={formData.evidence_references}
                onChange={handleInputChange('evidence_references')}
                placeholder="Reference to related evidence..."
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
            {editingFinding ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AuditFindingsGenerator;
