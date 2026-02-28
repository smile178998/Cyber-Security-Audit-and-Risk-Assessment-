import React, { useEffect, useState } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import { CheckCircle, Warning, Error, Add, Upload, Close } from '@mui/icons-material';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../utils/api';

const SecurityAudit = () => {
  const [audits, setAudits] = useState([]);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [findings, setFindings] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [compliance, setCompliance] = useState({});
  const [tabValue, setTabValue] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [findingForm, setFindingForm] = useState({
    title: '',
    description: '',
    risk_level: 'Medium',
    affected_asset: '',
    recommendation: ''
  });

  useEffect(() => {
    fetchAudits();
  }, []);

  const fetchAudits = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/audits');
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      setAudits(rows);
      if (rows.length > 0) {
        handleAuditSelect(rows[0]);
      }
    } catch (fetchError) {
      console.error('Error fetching audits:', fetchError);
      setError(fetchError.response?.data?.error || 'Failed to load audit tasks.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuditSelect = async (audit) => {
    if (!audit?.id) return;
    setSelectedAudit(audit);
    setDetailLoading(true);
    setError('');
    try {
      const [checklistRes, findingsRes, complianceRes, evidenceRes] = await Promise.all([
        api.get(`/audits/${audit.id}/checklist`),
        api.get(`/audits/${audit.id}/findings`),
        api.get(`/audits/${audit.id}/compliance`),
        api.get('/audit-evidence', { params: { audit_task_id: audit.id } })
      ]);

      setChecklist(Array.isArray(checklistRes.data?.data) ? checklistRes.data.data : []);
      setFindings(Array.isArray(findingsRes.data?.data) ? findingsRes.data.data : []);
      setEvidence(Array.isArray(evidenceRes.data?.data) ? evidenceRes.data.data : []);
      setCompliance(complianceRes.data || {});
    } catch (detailError) {
      console.error('Error fetching audit details:', detailError);
      setError(detailError.response?.data?.error || 'Failed to load selected audit details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleChecklistUpdate = async (itemId, nextStatus, nextFindings) => {
    if (!selectedAudit?.id) return;
    try {
      await api.put(`/audits/${selectedAudit.id}/checklist/${itemId}`, {
        compliance_status: nextStatus,
        findings: nextFindings || ''
      });
      setChecklist((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, compliance_status: nextStatus, findings: nextFindings || '' }
            : item
        )
      );
      const complianceRes = await api.get(`/audits/${selectedAudit.id}/compliance`);
      setCompliance(complianceRes.data || {});
    } catch (updateError) {
      console.error('Error updating checklist:', updateError);
      setError(updateError.response?.data?.error || 'Failed to update checklist item.');
    }
  };

  const handleCreateFinding = async () => {
    if (!selectedAudit?.id) return;
    if (!findingForm.title.trim() || !findingForm.description.trim()) {
      setError('Finding title and description are required.');
      return;
    }
    try {
      setError('');
      await api.post(`/audits/${selectedAudit.id}/findings`, findingForm);
      const findingsRes = await api.get(`/audits/${selectedAudit.id}/findings`);
      setFindings(Array.isArray(findingsRes.data?.data) ? findingsRes.data.data : []);
      setDialogOpen(false);
      setFindingForm({
        title: '',
        description: '',
        risk_level: 'Medium',
        affected_asset: '',
        recommendation: ''
      });
    } catch (createError) {
      console.error('Error creating finding:', createError);
      setError(createError.response?.data?.error || 'Failed to create finding.');
    }
  };

  const handleEvidenceUpload = async () => {
    if (!selectedAudit?.id) return;
    if (!uploadFile) {
      setError('Please choose a file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('audit_task_id', selectedAudit.id);
    formData.append('description', uploadDescription || '');
    formData.append('evidence_type', 'Document');

    try {
      setUploading(true);
      setError('');
      await api.post('/audit-evidence/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const evidenceRes = await api.get('/audit-evidence', {
        params: { audit_task_id: selectedAudit.id }
      });
      setEvidence(Array.isArray(evidenceRes.data?.data) ? evidenceRes.data.data : []);
      setUploadFile(null);
      setUploadDescription('');
    } catch (uploadError) {
      console.error('Error uploading evidence:', uploadError);
      setError(uploadError.response?.data?.error || 'Failed to upload evidence.');
    } finally {
      setUploading(false);
    }
  };

  const getComplianceData = () => {
    return [
      { name: 'Compliant', value: Number(compliance.compliant_controls || 0), color: '#4caf50' },
      { name: 'Partially Compliant', value: Number(compliance.partial_controls || 0), color: '#ff9800' },
      { name: 'Non-Compliant', value: Number(compliance.non_compliant_controls || 0), color: '#f44336' }
    ].filter((item) => item.value > 0);
  };

  const getStatusColor = (status) => {
    const colors = {
      completed: '#4caf50',
      in_progress: '#ff9800',
      pending: '#757575'
    };
    return colors[status] || '#757575';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Typography>Loading security audits...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        Security Audit - OCTAVE Allegro Controls Verification
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Audit Tasks
            </Typography>
            {audits.length === 0 ? (
              <Alert severity="info">No audit tasks found. Create an audit task first.</Alert>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Organization</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {audits.map((audit) => (
                      <TableRow
                        key={audit.id}
                        hover
                        selected={selectedAudit?.id === audit.id}
                        onClick={() => handleAuditSelect(audit)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{audit.title}</TableCell>
                        <TableCell>{audit.organization_name || '-'}</TableCell>
                        <TableCell>
                          <Chip
                            label={String(audit.status || 'pending').replace('_', ' ')}
                            size="small"
                            sx={{ backgroundColor: getStatusColor(audit.status), color: 'white' }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {selectedAudit && (
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 2, minHeight: 500 }}>
              <Box sx={{ borderBottom: 1, borderColor: 'divider', pb: 2, mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Audit Details - {selectedAudit.title}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  <Chip label={`Framework: ${selectedAudit.framework || 'OCTAVE Allegro'}`} color="primary" variant="outlined" />
                  <Chip
                    label={`Status: ${String(selectedAudit.status || 'pending').replace('_', ' ')}`}
                    sx={{ borderColor: getStatusColor(selectedAudit.status), color: getStatusColor(selectedAudit.status) }}
                    variant="outlined"
                  />
                </Box>
                {detailLoading && <LinearProgress sx={{ mt: 1 }} />}
              </Box>

              <Tabs value={tabValue} onChange={(_e, next) => setTabValue(next)}>
                <Tab label="Controls Check" />
                <Tab label="Evidence" />
                <Tab label="Findings" />
                <Tab label={`Compliance (${compliance.compliance_score || 0}%)`} />
              </Tabs>

              {tabValue === 0 && (
                <Box sx={{ mt: 2, maxHeight: 420, overflow: 'auto' }}>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Control</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Findings / Notes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {checklist.map((item) => (
                          <TableRow key={item.id} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {item.control_id || '-'}
                              </Typography>
                              <Typography variant="caption" display="block" color="text.secondary">
                                {item.control_name || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <FormControl size="small" fullWidth>
                                <Select
                                  value={item.compliance_status || 'Not Assessed'}
                                  onChange={(e) => handleChecklistUpdate(item.id, e.target.value, item.findings)}
                                  size="small"
                                >
                                  <MenuItem value="Compliant">
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <CheckCircle sx={{ mr: 1, color: '#4caf50', fontSize: 16 }} />
                                      Compliant
                                    </Box>
                                  </MenuItem>
                                  <MenuItem value="Partially Compliant">
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <Warning sx={{ mr: 1, color: '#ff9800', fontSize: 16 }} />
                                      Partially Compliant
                                    </Box>
                                  </MenuItem>
                                  <MenuItem value="Non-Compliant">
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <Error sx={{ mr: 1, color: '#f44336', fontSize: 16 }} />
                                      Non-Compliant
                                    </Box>
                                  </MenuItem>
                                  <MenuItem value="Not Assessed">
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <Close sx={{ mr: 1, color: '#9e9e9e', fontSize: 16 }} />
                                      Not Assessed
                                    </Box>
                                  </MenuItem>
                                </Select>
                              </FormControl>
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                fullWidth
                                multiline
                                rows={2}
                                placeholder="Add findings or observations..."
                                value={item.findings || ''}
                                onChange={(e) => handleChecklistUpdate(item.id, item.compliance_status || 'Not Assessed', e.target.value)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {tabValue === 1 && (
                <Box sx={{ mt: 2 }}>
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      Upload Evidence
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={5}>
                        <Button variant="outlined" component="label" fullWidth startIcon={<Upload />}>
                          {uploadFile ? uploadFile.name : 'Choose File'}
                          <input
                            hidden
                            type="file"
                            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          />
                        </Button>
                      </Grid>
                      <Grid item xs={12} md={5}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Description"
                          value={uploadDescription}
                          onChange={(e) => setUploadDescription(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <Button
                          variant="contained"
                          fullWidth
                          onClick={handleEvidenceUpload}
                          disabled={uploading || !uploadFile}
                        >
                          {uploading ? 'Uploading...' : 'Upload'}
                        </Button>
                      </Grid>
                    </Grid>
                  </Paper>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>File</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell>Path</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {evidence.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <Alert severity="info">No evidence uploaded for this audit.</Alert>
                            </TableCell>
                          </TableRow>
                        ) : (
                          evidence.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.file_name || '-'}</TableCell>
                              <TableCell>{item.file_type || '-'}</TableCell>
                              <TableCell>{item.description || '-'}</TableCell>
                              <TableCell>{item.file_path || '-'}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {tabValue === 2 && (
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Audit Findings</Typography>
                    <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
                      Add Finding
                    </Button>
                  </Box>

                  {findings.length === 0 ? (
                    <Alert severity="info">No findings recorded yet.</Alert>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Title</TableCell>
                            <TableCell>Risk Level</TableCell>
                            <TableCell>Affected Asset</TableCell>
                            <TableCell>Recommendation</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {findings.map((finding) => (
                            <TableRow key={finding.id}>
                              <TableCell>{finding.title || finding.issue || '-'}</TableCell>
                              <TableCell>
                                <Chip
                                  label={finding.risk_level || 'Medium'}
                                  size="small"
                                  color={
                                    finding.risk_level === 'Critical'
                                      ? 'error'
                                      : finding.risk_level === 'High'
                                      ? 'warning'
                                      : 'info'
                                  }
                                />
                              </TableCell>
                              <TableCell>{finding.affected_asset || '-'}</TableCell>
                              <TableCell>{finding.recommendation || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}

              {tabValue === 3 && (
                <Box sx={{ mt: 2 }}>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>
                          Compliance Score: {compliance.compliance_score || 0}%
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Number(compliance.compliance_score || 0)}
                          sx={{
                            height: 20,
                            borderRadius: 5,
                            backgroundColor: '#e0e0e0',
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 5,
                              backgroundColor:
                                compliance.compliance_score >= 85
                                  ? '#4caf50'
                                  : compliance.compliance_score >= 60
                                  ? '#ff9800'
                                  : '#f44336'
                            }
                          }}
                        />
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          {compliance.compliant_controls || 0} of {compliance.total_controls || 0} controls compliant
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>
                          Compliance Distribution
                        </Typography>
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie
                              data={getComplianceData()}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              dataKey="value"
                            >
                              {getComplianceData().map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Paper>
          </Grid>
        )}
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create Audit Finding</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Finding Title"
                value={findingForm.title}
                onChange={(e) => setFindingForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Description"
                value={findingForm.description}
                onChange={(e) => setFindingForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Risk Level</InputLabel>
                <Select
                  label="Risk Level"
                  value={findingForm.risk_level}
                  onChange={(e) => setFindingForm((prev) => ({ ...prev, risk_level: e.target.value }))}
                >
                  <MenuItem value="Low">Low</MenuItem>
                  <MenuItem value="Medium">Medium</MenuItem>
                  <MenuItem value="High">High</MenuItem>
                  <MenuItem value="Critical">Critical</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Affected Asset"
                value={findingForm.affected_asset}
                onChange={(e) => setFindingForm((prev) => ({ ...prev, affected_asset: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Recommendation"
                value={findingForm.recommendation}
                onChange={(e) => setFindingForm((prev) => ({ ...prev, recommendation: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateFinding} variant="contained">
            Create Finding
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SecurityAudit;
