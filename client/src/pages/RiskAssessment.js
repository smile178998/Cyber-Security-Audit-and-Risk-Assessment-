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
  LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit,
  Delete,
  Assessment,
  Warning,
  CheckCircle,
  Error,
} from '@mui/icons-material';
import api from '../utils/api';

const RiskAssessment = () => {
  const [risks, setRisks] = useState([]);
  const [assets, setAssets] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    asset_id: '',
    threat_description: '',
    vulnerability_description: '',
    likelihood: 'Medium',
    impact: 'Medium',
    risk_level: 'Medium',
    mitigation_plan: ''
  });

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [risksRes, assetsRes] = await Promise.all([
        api.get('/risk-assessments'),
        api.get('/assets')
      ]);
      setRisks(risksRes.data.data || []);
      setAssets(assetsRes.data.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
      setRisks([]);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRisk = () => {
    setEditingRisk(null);
    setFormData({
      asset_id: '',
      threat_description: '',
      vulnerability_description: '',
      likelihood: 'Medium',
      impact: 'Medium',
      risk_level: 'Medium',
      mitigation_plan: ''
    });
    setDialogOpen(true);
    setError('');
  };

  const handleEditRisk = (risk) => {
    setEditingRisk(risk);
    setFormData({
      asset_id: risk.asset_id || '',
      threat_description: risk.threat_description || '',
      vulnerability_description: risk.vulnerability_description || '',
      likelihood: risk.likelihood || 'Medium',
      impact: risk.impact || 'Medium',
      risk_level: risk.risk_level || 'Medium',
      mitigation_plan: risk.mitigation_plan || ''
    });
    setDialogOpen(true);
    setError('');
  };

  const handleDeleteRisk = async (riskId) => {
    if (window.confirm('Are you sure you want to delete this risk assessment?')) {
      try {
        setError('');
        await api.delete(`/risk-assessments/${riskId}`);
        await loadData();
        alert('Risk assessment deleted successfully');
      } catch (error) {
        console.error('Error deleting risk:', error);
        setError('Failed to delete risk assessment');
      }
    }
  };

  const calculateRiskLevel = (likelihood, impact) => {
    const riskMatrix = {
      'Low-Low': 'Low',
      'Low-Medium': 'Low',
      'Low-High': 'Medium',
      'Medium-Low': 'Low',
      'Medium-Medium': 'Medium',
      'Medium-High': 'High',
      'High-Low': 'Medium',
      'High-Medium': 'High',
      'High-High': 'Critical'
    };
    return riskMatrix[`${likelihood}-${impact}`] || 'Medium';
  };

  const handleSubmit = async () => {
    // Basic validation
    if (!formData.asset_id) {
      setError('Please select an asset');
      return;
    }
    if (!formData.threat_description.trim()) {
      setError('Threat description is required');
      return;
    }
    if (!formData.vulnerability_description.trim()) {
      setError('Vulnerability description is required');
      return;
    }
    
    try {
      setError('');
      const calculatedRiskLevel = calculateRiskLevel(formData.likelihood, formData.impact);
      const submitData = {
        ...formData,
        risk_level: calculatedRiskLevel
      };

      if (editingRisk) {
        await api.put(`/risk-assessments/${editingRisk.id}`, submitData);
        alert('Risk assessment updated successfully');
      } else {
        await api.post('/risk-assessments', submitData);
        alert('Risk assessment created successfully');
      }
      
      setDialogOpen(false);
      setEditingRisk(null);
      await loadData();
    } catch (error) {
      console.error('Error saving risk assessment:', error);
      setError(error.response?.data?.error || 'Failed to save risk assessment');
    }
  };

  const handleInputChange = (field) => (event) => {
    setFormData({
      ...formData,
      [field]: event.target.value
    });
  };

  const getRiskColor = (level) => {
    const colors = {
      Low: '#4caf50',
      Medium: '#ff9800',
      High: '#f44336',
      Critical: '#9c27b0'
    };
    return colors[level] || '#757575';
  };

  const getAssetName = (assetId) => {
    const asset = assets.find(a => a.id === assetId);
    return asset ? asset.name : 'Unknown Asset';
  };

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
          Risk Assessment
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddRisk}
        >
          Add Risk Assessment
        </Button>
      </Box>

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
                  <TableCell>Asset</TableCell>
                  <TableCell>Threat</TableCell>
                  <TableCell>Vulnerability</TableCell>
                  <TableCell>Likelihood</TableCell>
                  <TableCell>Impact</TableCell>
                  <TableCell>Risk Level</TableCell>
                  <TableCell>Mitigation Plan</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {risks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        No risk assessments found. Click "Add Risk Assessment" to create your first assessment.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  risks.map((risk) => (
                    <TableRow key={risk.id}>
                      <TableCell>{getAssetName(risk.asset_id)}</TableCell>
                      <TableCell>{risk.threat_description}</TableCell>
                      <TableCell>{risk.vulnerability_description}</TableCell>
                      <TableCell>
                        <Chip label={risk.likelihood} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip label={risk.impact} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={risk.risk_level}
                          size="small"
                          sx={{
                            backgroundColor: getRiskColor(risk.risk_level),
                            color: 'white'
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {risk.mitigation_plan}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton 
                          size="small" 
                          color="primary" 
                          onClick={() => handleEditRisk(risk)}
                        >
                          <Edit />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          color="error" 
                          onClick={() => handleDeleteRisk(risk.id)}
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
          {editingRisk ? 'Edit Risk Assessment' : 'Add New Risk Assessment'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Asset</InputLabel>
                <Select
                  value={formData.asset_id}
                  onChange={handleInputChange('asset_id')}
                  label="Asset"
                  required
                >
                  {assets.map((asset) => (
                    <MenuItem key={asset.id} value={asset.id}>
                      {asset.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Threat Description"
                value={formData.threat_description}
                onChange={handleInputChange('threat_description')}
                multiline
                rows={3}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Vulnerability Description"
                value={formData.vulnerability_description}
                onChange={handleInputChange('vulnerability_description')}
                multiline
                rows={3}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Likelihood</InputLabel>
                <Select
                  value={formData.likelihood}
                  onChange={handleInputChange('likelihood')}
                  label="Likelihood"
                >
                  <MenuItem value="Low">Low</MenuItem>
                  <MenuItem value="Medium">Medium</MenuItem>
                  <MenuItem value="High">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Impact</InputLabel>
                <Select
                  value={formData.impact}
                  onChange={handleInputChange('impact')}
                  label="Impact"
                >
                  <MenuItem value="Low">Low</MenuItem>
                  <MenuItem value="Medium">Medium</MenuItem>
                  <MenuItem value="High">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Calculated Risk Level"
                value={calculateRiskLevel(formData.likelihood, formData.impact)}
                disabled
                sx={{
                  '& .MuiInputBase-input.Mui-disabled': {
                    WebkitTextFillColor: getRiskColor(calculateRiskLevel(formData.likelihood, formData.impact)),
                  }
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Mitigation Plan"
                value={formData.mitigation_plan}
                onChange={handleInputChange('mitigation_plan')}
                multiline
                rows={4}
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
            {editingRisk ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RiskAssessment;
