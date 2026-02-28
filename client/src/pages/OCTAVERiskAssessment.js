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
  LinearProgress,
} from '@mui/material';
import {
  Assessment,
  Add,
  Edit,
  Delete,
  Refresh,
  Search,
  Warning,
  CheckCircle,
  TrendingUp,
  Security,
  Person,
  Business,
  ExpandMore,
  Calculate,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

const OCTAVERiskAssessment = () => {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [threatActors, setThreatActors] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState({
    asset_id: '',
    threat_actor_id: '',
    threat_scenario: '',
    impact_area: 'Financial',
    impact_level: 'Medium',
    probability: 'Medium',
    certainty: 'Medium',
    mitigation_strategy: '',
    assessment_phase: 'Identify Threats'
  });

  const phases = [
    'Establish Criteria',
    'Profile Assets', 
    'Identify Threats',
    'Identify Risks',
    'Analyze Risks',
    'Select Mitigation'
  ];

  const impactAreas = [
    { value: 'Reputation', label: 'Reputation', description: 'Damage to organizational reputation and brand' },
    { value: 'Financial', label: 'Financial', description: 'Direct financial losses and costs' },
    { value: 'Productivity', label: 'Productivity', description: 'Impact on operational efficiency' },
    { value: 'Safety', label: 'Safety', description: 'Physical harm to people' },
    { value: 'Legal/Regulatory', label: 'Legal/Regulatory', description: 'Legal and regulatory compliance issues' },
    { value: 'Data/Information', label: 'Data/Information', description: 'Compromise of sensitive data' }
  ];

  const impactLevels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
  const probabilityLevels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
  const certaintyLevels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];

  const getRiskScoreColor = (score) => {
    if (score >= 20) return 'error';
    if (score >= 10) return 'warning';
    return 'success';
  };

  const getRelativeRiskScore = (impact, probability, certainty) => {
    const impactScores = { 'Very Low': 1, 'Low': 2, 'Medium': 3, 'High': 4, 'Very High': 5 };
    const probScores = { 'Very Low': 1, 'Low': 2, 'Medium': 3, 'High': 4, 'Very High': 5 };
    const certScores = { 'Very Low': 1, 'Low': 2, 'Medium': 3, 'High': 4, 'Very High': 5 };
    
    const impactScore = impactScores[impact] || 3;
    const probScore = probScores[probability] || 3;
    const certScore = certScores[certainty] || 3;
    
    return ((impactScore * probScore) / certScore).toFixed(2);
  };

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const [assessmentsRes, actorsRes, assetsRes] = await Promise.all([
        api.get('/octave-risk-assessments'),
        api.get('/threat-actors'),
        api.get('/assets')
      ]);
      
      setAssessments(assessmentsRes.data.data || []);
      setThreatActors(actorsRes.data.data || []);
      setAssets(assetsRes.data.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.asset_id || !formData.threat_scenario) {
      setError('Asset and threat scenario are required');
      return;
    }
    
    try {
      setError('');
      const relativeRiskScore = getRelativeRiskScore(
        formData.impact_level, 
        formData.probability, 
        formData.certainty
      );
      
      const dataToSend = {
        ...formData,
        relative_risk_score: parseFloat(relativeRiskScore)
      };
      
      if (selectedAssessment) {
        await api.put(`/octave-risk-assessments/${selectedAssessment.id}`, dataToSend);
        alert('Risk assessment updated successfully');
      } else {
        await api.post('/octave-risk-assessments', dataToSend);
        alert('Risk assessment created successfully');
      }
      
      setDialogOpen(false);
      setSelectedAssessment(null);
      setFormData({
        asset_id: '',
        threat_actor_id: '',
        threat_scenario: '',
        impact_area: 'Financial',
        impact_level: 'Medium',
        probability: 'Medium',
        certainty: 'Medium',
        mitigation_strategy: '',
        assessment_phase: 'Identify Threats'
      });
      loadData();
    } catch (error) {
      console.error('Error saving assessment:', error);
      setError('Failed to save assessment');
    }
  };

  const handleDelete = async (assessmentId) => {
    if (!window.confirm('Are you sure you want to delete this risk assessment?')) return;
    
    try {
      await api.delete(`/octave-risk-assessments/${assessmentId}`);
      alert('Risk assessment deleted successfully');
      loadData();
    } catch (error) {
      console.error('Error deleting assessment:', error);
      setError('Failed to delete assessment');
    }
  };

  const openEditDialog = (assessment) => {
    setSelectedAssessment(assessment);
    setFormData({
      asset_id: assessment.asset_id,
      threat_actor_id: assessment.threat_actor_id,
      threat_scenario: assessment.threat_scenario,
      impact_area: assessment.impact_area,
      impact_level: assessment.impact_level,
      probability: assessment.probability,
      certainty: assessment.certainty,
      mitigation_strategy: assessment.mitigation_strategy || '',
      assessment_phase: assessment.assessment_phase
    });
    setDialogOpen(true);
  };

  const filteredAssessments = assessments.filter(
    (assessment) =>
      assessment.threat_scenario?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assessment.impact_area?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAssetName = (assetId) => {
    const asset = assets.find(a => a.id === parseInt(assetId));
    return asset ? asset.name : 'Unknown Asset';
  };

  const getThreatActorName = (actorId) => {
    const actor = threatActors.find(t => t.id === parseInt(actorId));
    return actor ? actor.name : 'Unknown Actor';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Typography>Loading OCTAVE Risk Assessment...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Fade in={mounted}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: 'grey.800' }}>
            OCTAVE Allegro Risk Assessment
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Systematic risk assessment using threat actors and impact analysis
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
                      {assessments.length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Risk Assessments
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
          <Zoom in={mounted} style={{ transitionDelay: '200ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {threatActors.length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Threat Actors
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <Person />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '300ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {assessments.filter(a => parseFloat(a.relative_risk_score) >= 10).length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      High Risk Items
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
          <Zoom in={mounted} style={{ transitionDelay: '400ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {assessments.length > 0 ? (assessments.reduce((sum, a) => sum + parseFloat(a.relative_risk_score), 0) / assessments.length).toFixed(1) : '0'}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Avg Risk Score
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <TrendingUp />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setDialogOpen(true)}
          sx={{ mb: 2 }}
        >
          Create Risk Assessment
        </Button>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadData}
        >
          Refresh
        </Button>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search risk assessments..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        InputProps={{
          startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
        sx={{ mb: 3 }}
      />

      {/* Risk Assessments Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                <TableCell>Threat Scenario</TableCell>
                <TableCell>Asset</TableCell>
                <TableCell>Threat Actor</TableCell>
                <TableCell>Impact Area</TableCell>
                <TableCell>Risk Score</TableCell>
                <TableCell>Phase</TableCell>
                <TableCell
                  sx={{
                    position: 'sticky',
                    right: 0,
                    backgroundColor: '#fff',
                    zIndex: 2,
                    minWidth: 110
                  }}
                >
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAssessments.map((assessment) => (
                <TableRow key={assessment.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {assessment.threat_scenario.length > 50 
                        ? `${assessment.threat_scenario.substring(0, 50)}...` 
                        : assessment.threat_scenario}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={<Business />}
                      label={getAssetName(assessment.asset_id)}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={<Person />}
                      label={getThreatActorName(assessment.threat_actor_id)}
                      size="small"
                      color="secondary"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">
                        {assessment.impact_area}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={parseFloat(assessment.relative_risk_score)}
                        max={25}
                        sx={{ 
                          width: 60, 
                          height: 6, 
                          borderRadius: 3,
                          backgroundColor: getRiskScoreColor(parseFloat(assessment.relative_risk_score))
                        }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={assessment.relative_risk_score}
                      size="small"
                      color={getRiskScoreColor(parseFloat(assessment.relative_risk_score))}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={assessment.assessment_phase}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell
                    sx={{
                      position: 'sticky',
                      right: 0,
                      backgroundColor: '#fff',
                      zIndex: 1
                    }}
                  >
                    <IconButton
                      color="primary"
                      onClick={() => openEditDialog(assessment)}
                      size="small"
                    >
                      <Edit />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => handleDelete(assessment.id)}
                      size="small"
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {selectedAssessment ? 'Edit Risk Assessment' : 'Create New Risk Assessment'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Asset Container</InputLabel>
                <Select
                  value={formData.asset_id}
                  onChange={(e) => setFormData({ ...formData, asset_id: e.target.value })}
                  required
                >
                  {assets.map((asset) => (
                    <MenuItem key={asset.id} value={asset.id}>
                      {asset.name} ({asset.container_type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Threat Actor</InputLabel>
                <Select
                  value={formData.threat_actor_id}
                  onChange={(e) => setFormData({ ...formData, threat_actor_id: e.target.value })}
                  required
                >
                  {threatActors.map((actor) => (
                    <MenuItem key={actor.id} value={actor.id}>
                      <Box>
                        <Typography variant="inherit">{actor.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {actor.type} - {actor.motivation}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Threat Scenario"
                value={formData.threat_scenario}
                onChange={(e) => setFormData({ ...formData, threat_scenario: e.target.value })}
                required
                helperText="Describe the specific threat scenario involving the threat actor and asset"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Impact Area</InputLabel>
                <Select
                  value={formData.impact_area}
                  onChange={(e) => setFormData({ ...formData, impact_area: e.target.value })}
                >
                  {impactAreas.map((area) => (
                    <MenuItem key={area.value} value={area.value}>
                      <Box>
                        <Typography variant="inherit">{area.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {area.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Assessment Phase</InputLabel>
                <Select
                  value={formData.assessment_phase}
                  onChange={(e) => setFormData({ ...formData, assessment_phase: e.target.value })}
                >
                  {phases.map((phase) => (
                    <MenuItem key={phase} value={phase}>
                      {phase}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Impact Level</InputLabel>
                <Select
                  value={formData.impact_level}
                  onChange={(e) => setFormData({ ...formData, impact_level: e.target.value })}
                >
                  {impactLevels.map((level) => (
                    <MenuItem key={level} value={level}>
                      {level}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Probability</InputLabel>
                <Select
                  value={formData.probability}
                  onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                >
                  {probabilityLevels.map((level) => (
                    <MenuItem key={level} value={level}>
                      {level}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Certainty</InputLabel>
                <Select
                  value={formData.certainty}
                  onChange={(e) => setFormData({ ...formData, certainty: e.target.value })}
                >
                  {certaintyLevels.map((level) => (
                    <MenuItem key={level} value={level}>
                      {level}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Mitigation Strategy"
                value={formData.mitigation_strategy}
                onChange={(e) => setFormData({ ...formData, mitigation_strategy: e.target.value })}
                helperText="Describe the mitigation approach to reduce the risk"
              />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Calculate sx={{ mr: 1 }} />
                  Relative Risk Score: {getRelativeRiskScore(formData.impact_level, formData.probability, formData.certainty)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Formula: (Impact × Probability) ÷ Certainty
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.asset_id || !formData.threat_scenario}
          >
            {selectedAssessment ? 'Update' : 'Create'} Assessment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OCTAVERiskAssessment;
