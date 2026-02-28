import React, { useEffect, useState } from 'react';
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
  Add,
  Refresh,
  Download,
  Edit,
  Delete,
  CheckCircle,
  Warning,
  Error,
} from '@mui/icons-material';
import api from '../utils/api';

const ComplianceScoring = () => {
  const [scores, setScores] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScore, setEditingScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({ compliant_controls: 0, total_controls: 0, compliance_percentage: 0 });
  const [formData, setFormData] = useState({
    organization_id: '',
    assessment_date: new Date().toISOString().split('T')[0],
    compliant_controls: 0,
    total_controls: 0,
    recommendations: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [scoresRes, orgsRes] = await Promise.all([
        api.get('/compliance-scores', { cache: false }),
        api.get('/organizations')
      ]);
      const scoreRows = Array.isArray(scoresRes.data?.data) ? scoresRes.data.data : [];
      const orgRows = Array.isArray(orgsRes.data?.data) ? orgsRes.data.data : [];
      setScores(scoreRows);
      if (orgRows.length) {
        setOrganizations(orgRows);
      } else {
        const fallback = scoreRows
          .filter((s) => Number(s.organization_id) > 0)
          .map((s) => ({ id: s.organization_id, name: s.organization_name || `Organization ${s.organization_id}` }))
          .filter((item, idx, arr) => arr.findIndex((a) => Number(a.id) === Number(item.id)) === idx);
        setOrganizations(fallback);
      }
    } catch (loadError) {
      setError(loadError.response?.data?.error || 'Failed to load data');
      setScores([]);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizationSummary = async (organizationId) => {
    const orgId = Number(organizationId || 0);
    if (!orgId) {
      setSummary({ compliant_controls: 0, total_controls: 0, compliance_percentage: 0 });
      return;
    }
    try {
      const res = await api.get(`/compliance-scores/organization/${orgId}/summary`, { cache: false });
      setSummary(res.data?.data || { compliant_controls: 0, total_controls: 0, compliance_percentage: 0 });
    } catch (_e) {
      setSummary({ compliant_controls: 0, total_controls: 0, compliance_percentage: 0 });
    }
  };

  const handleAddScore = async () => {
    const defaultOrgId = organizations[0]?.id || '';
    setEditingScore(null);
    setFormData({
      organization_id: defaultOrgId,
      assessment_date: new Date().toISOString().split('T')[0],
      compliant_controls: 0,
      total_controls: 0,
      recommendations: ''
    });
    if (defaultOrgId) {
      await loadOrganizationSummary(defaultOrgId);
    } else {
      setSummary({ compliant_controls: 0, total_controls: 0, compliance_percentage: 0 });
    }
    setDialogOpen(true);
    setError('');
  };

  const handleEditScore = async (score) => {
    setEditingScore(score);
    setFormData({
      organization_id: score.organization_id || '',
      assessment_date: String(score.assessment_date || new Date().toISOString().split('T')[0]).slice(0, 10),
      compliant_controls: Number(score.compliant_controls || 0),
      total_controls: Number(score.total_controls || 0),
      recommendations: score.recommendations || ''
    });
    await loadOrganizationSummary(score.organization_id);
    setDialogOpen(true);
    setError('');
  };

  const handleDeleteScore = async (scoreId) => {
    if (!window.confirm('Are you sure you want to delete this compliance score?')) return;
    try {
      setError('');
      await api.delete(`/compliance-scores/${scoreId}`);
      await loadData();
    } catch (deleteError) {
      setError(deleteError.response?.data?.error || 'Failed to delete compliance score');
    }
  };

  const handleSubmit = async () => {
    if (!formData.organization_id) {
      setError('Please select an organization');
      return;
    }

    try {
      setError('');
      const submitData = {
        organization_id: formData.organization_id,
        assessment_date: formData.assessment_date,
        compliant_controls: Number(formData.compliant_controls || 0),
        total_controls: Number(formData.total_controls || 0),
        recommendations: formData.recommendations
      };
      if (Number(submitData.total_controls) > 0) {
        submitData.compliance_percentage = Number(((submitData.compliant_controls / submitData.total_controls) * 100).toFixed(2));
      }

      if (editingScore) {
        await api.put(`/compliance-scores/${editingScore.id}`, submitData);
      } else {
        await api.post('/compliance-scores', submitData);
      }
      setDialogOpen(false);
      setEditingScore(null);
      await loadData();
    } catch (submitError) {
      setError(submitError.response?.data?.error || 'Failed to save compliance score');
    }
  };

  const handleInputChange = (field) => async (event) => {
    const value = event.target.value;
    const next = { ...formData, [field]: value };
    setFormData(next);
    if (field === 'organization_id') {
      await loadOrganizationSummary(value);
    }
  };

  const handleNonNegativeIntegerChange = (field) => (event) => {
    const raw = String(event.target.value ?? '');
    if (raw === '') {
      setFormData((prev) => ({ ...prev, [field]: '' }));
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    setFormData((prev) => ({ ...prev, [field]: Number(raw) }));
  };

  const getOrganizationName = (orgId) => {
    const org = organizations.find((o) => Number(o.id) === Number(orgId));
    return org ? org.name : String(orgId || 'Unknown Organization');
  };

  const complianceValue = (score) => Number(score.compliance_percentage ?? score.overall_score ?? 0);
  const calculatedFormCompliance = Number(formData.total_controls || 0) > 0
    ? Number(((Number(formData.compliant_controls || 0) / Number(formData.total_controls || 0)) * 100).toFixed(2))
    : 0;

  const getScoreColor = (value) => {
    if (value >= 85) return '#4caf50';
    if (value >= 60) return '#ff9800';
    return '#f44336';
  };

  const getScoreGrade = (value) => {
    if (value >= 85) return 'Compliant';
    if (value >= 60) return 'Needs Improvement';
    return 'Non-Compliant';
  };

  const getScoreIcon = (value) => {
    if (value >= 85) return <CheckCircle sx={{ color: getScoreColor(value) }} />;
    if (value >= 60) return <Warning sx={{ color: getScoreColor(value) }} />;
    return <Error sx={{ color: getScoreColor(value) }} />;
  };

  const exportScores = () => {
    const csv = [
      ['Organization', 'Assessment Date', 'Compliant Controls', 'Total Controls', 'Compliance %', 'Grade'],
      ...scores.map((score) => {
        const v = complianceValue(score);
        return [
          getOrganizationName(score.organization_id),
          String(score.assessment_date || '').slice(0, 10),
          Number(score.compliant_controls || 0),
          Number(score.total_controls || 0),
          `${v.toFixed(2)}%`,
          getScoreGrade(v)
        ];
      })
    ].map((row) => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compliance_scores.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const values = scores.map((s) => complianceValue(s));
  const highest = values.length ? Math.max(...values) : 0;
  const lowest = values.length ? Math.min(...values) : 0;
  const average = values.length ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2)) : 0;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">Compliance Scoring</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={loadData}>Refresh</Button>
          <Button variant="outlined" startIcon={<Download />} onClick={exportScores} disabled={!scores.length}>Export</Button>
          <Button variant="contained" startIcon={<Add />} onClick={handleAddScore}>Add Score</Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Compliance % = (number of compliant controls ÷ total controls) × 100
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!!scores.length && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card><CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" color="primary">{scores.length}</Typography>
              <Typography variant="body2" color="text.secondary">Total Assessments</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card><CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getScoreColor(highest) }}>{highest.toFixed(2)}%</Typography>
              <Typography variant="body2" color="text.secondary">Highest Score</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card><CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getScoreColor(lowest) }}>{lowest.toFixed(2)}%</Typography>
              <Typography variant="body2" color="text.secondary">Lowest Score</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card><CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getScoreColor(average) }}>{average.toFixed(2)}%</Typography>
              <Typography variant="body2" color="text.secondary">Average Score</Typography>
            </CardContent></Card>
          </Grid>
        </Grid>
      )}

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Organization</TableCell>
                  <TableCell>Assessment Date</TableCell>
                  <TableCell>Compliant Controls</TableCell>
                  <TableCell>Total Controls</TableCell>
                  <TableCell>Compliance %</TableCell>
                  <TableCell>Grade</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!scores.length ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        No compliance scores found. Click "Add Score" to create your first assessment.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  scores.map((score) => {
                    const value = complianceValue(score);
                    return (
                      <TableRow key={score.id}>
                        <TableCell>{getOrganizationName(score.organization_id)}</TableCell>
                        <TableCell>{String(score.assessment_date || '').slice(0, 10)}</TableCell>
                        <TableCell>{Number(score.compliant_controls || 0)}</TableCell>
                        <TableCell>{Number(score.total_controls || 0)}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, value))} sx={{ width: 120 }} />
                            <Typography variant="body2" fontWeight="medium">{value.toFixed(2)}%</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={getScoreGrade(value)} size="small" sx={{ backgroundColor: getScoreColor(value), color: 'white', fontWeight: 'bold' }} />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {getScoreIcon(value)}
                            <Typography variant="body2">{getScoreGrade(value)}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" color="primary" onClick={() => handleEditScore(score)}><Edit /></IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDeleteScore(score.id)}><Delete /></IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingScore ? 'Edit Compliance Score' : 'Add New Compliance Score'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Organization</InputLabel>
                <Select value={formData.organization_id} onChange={handleInputChange('organization_id')} label="Organization" required>
                  {organizations.map((org) => <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Assessment Date"
                type="date"
                value={formData.assessment_date}
                onChange={handleInputChange('assessment_date')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Compliant Controls"
                type="number"
                value={formData.compliant_controls}
                onChange={handleNonNegativeIntegerChange('compliant_controls')}
                inputProps={{ min: 0, step: 1, inputMode: 'numeric' }}
                InputProps={{ readOnly: false }}
                disabled={false}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Total Controls"
                type="number"
                value={formData.total_controls}
                onChange={handleNonNegativeIntegerChange('total_controls')}
                inputProps={{ min: 0, step: 1, inputMode: 'numeric' }}
                InputProps={{ readOnly: false }}
                disabled={false}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth label="Calculated Compliance %" value={`${calculatedFormCompliance.toFixed(2)}%`} disabled />
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info" sx={{ py: 0 }}>
                Manual input enabled: you can directly edit Compliant Controls and Total Controls.
              </Alert>
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info" sx={{ py: 0 }}>
                Auto summary for selected organization: {Number(summary.compliant_controls || 0)} / {Number(summary.total_controls || 0)} ({Number(summary.compliance_percentage || 0).toFixed(2)}%)
              </Alert>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Recommendations"
                value={formData.recommendations}
                onChange={handleInputChange('recommendations')}
                multiline
                rows={4}
                placeholder="Remediation recommendations..."
              />
            </Grid>
          </Grid>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">{editingScore ? 'Update' : 'Create'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ComplianceScoring;
