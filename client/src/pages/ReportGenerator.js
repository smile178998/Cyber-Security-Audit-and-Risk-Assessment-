import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  CircularProgress,
  Alert,
  Paper,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Description,
  Download,
  PictureAsPdf,
  InsertDriveFile,
  Assessment,
  Visibility,
  Delete,
  DateRange,
} from '@mui/icons-material';
import api from '../utils/api';

const ReportGenerator = () => {
  const [reports, setReports] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    organization_id: '',
    report_type: 'Security Audit',
    framework: 'OCTAVE Allegro',
    format: 'PDF',
    date_range: 'Last 30 Days',
    include_sections: {
      executive_summary: true,
      risk_assessment: true,
      compliance_status: true,
      findings: true,
      recommendations: true,
      appendix: false
    }
  });

  // Report types
  const reportTypes = [
    { value: 'Security Audit', label: 'Security Audit Report', icon: <Assessment /> },
    { value: 'Risk Assessment', label: 'Risk Assessment Report', icon: <Assessment /> },
    { value: 'Compliance', label: 'Compliance Report', icon: <Assessment /> },
    { value: 'Vulnerability', label: 'Vulnerability Assessment', icon: <Assessment /> },
    { value: 'Incident', label: 'Incident Response Report', icon: <Assessment /> },
    { value: 'Executive', label: 'Executive Summary', icon: <Assessment /> }
  ];

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [reportsRes, orgsRes] = await Promise.all([
        api.get('/reports'),
        api.get('/organizations')
      ]);
      setReports(reportsRes.data.data || []);
      setOrganizations(orgsRes.data.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
      setReports([]);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!formData.organization_id) {
      setError('Please select an organization');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      await api.post('/reports/generate', {
        organization_id: formData.organization_id,
        report_type: formData.report_type,
        framework: 'OCTAVE Allegro',
        format: formData.format
      });
      await loadData();
      setDialogOpen(false);
      alert('Report generated successfully!');
    } catch (error) {
      console.error('Error generating report:', error);
      setError(error.response?.data?.error || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadReport = async (report) => {
    try {
      setError('');
      const response = await api.get(`/reports/${report.id}/download`, {
        responseType: 'blob',
        cache: false
      });
      const blobUrl = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = report.file_name || `report-${report.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (downloadError) {
      console.error('Error downloading report:', downloadError);
      setError(downloadError.response?.data?.error || 'Failed to download report');
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (window.confirm('Are you sure you want to delete this report?')) {
      try {
        setError('');
        await api.delete(`/reports/${reportId}`);
        setReports(prev => prev.filter(r => r.id !== reportId));
        alert('Report deleted successfully');
      } catch (error) {
        console.error('Error deleting report:', error);
        setError('Failed to delete report');
      }
    }
  };

  const handleInputChange = (field) => (event) => {
    if (field.startsWith('include_sections.')) {
      const section = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        include_sections: {
          ...prev.include_sections,
          [section]: event.target.checked
        }
      }));
    } else {
      setFormData({
        ...formData,
        [field]: event.target.value
      });
    }
  };

  const getOrganizationName = (orgId) => {
    const org = organizations.find(o => o.id === orgId);
    return org ? org.name : 'Unknown Organization';
  };

  const getReportTypeIcon = (type) => {
    const reportType = reportTypes.find(r => r.value === type);
    return reportType ? reportType.icon : <Description />;
  };

  const getStatusColor = (status) => {
    const colors = {
      'Completed': '#4caf50',
      'Generating': '#ff9800',
      'Failed': '#f44336'
    };
    return colors[status] || '#757575';
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
          Report Generator
        </Typography>
        <Button
          variant="contained"
          startIcon={<Description />}
          onClick={() => setDialogOpen(true)}
        >
          Generate Report
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" color="primary">
                {reports.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Reports
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getStatusColor('Completed') }}>
                {reports.filter(r => r.status === 'Completed').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Completed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: getStatusColor('Generating') }}>
                {reports.filter(r => r.status === 'Generating').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Generating
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" color="primary">
                {reports.length > 0 ? Math.round(reports.reduce((sum, r) => sum + parseFloat(r.file_size || 0), 0) / reports.length * 10) / 10 : 0} MB
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Avg File Size
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Reports List */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Generated Reports
          </Typography>
          {reports.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Description sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                No reports found. Click "Generate Report" to create your first report.
              </Typography>
            </Box>
          ) : (
            <List>
              {reports.map((report) => (
                <ListItem key={report.id} sx={{ border: 1, borderColor: 'grey.200', borderRadius: 1, mb: 1 }}>
                  <ListItemIcon>
                    {getReportTypeIcon(report.report_type)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1">
                          {report.file_name}
                        </Typography>
                        <Chip
                          label={report.status}
                          size="small"
                          sx={{
                            backgroundColor: getStatusColor(report.status),
                            color: 'white'
                          }}
                        />
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Organization: {getOrganizationName(report.organization_id)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Type: {report.report_type}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Generated: {report.generated_date} by {report.generated_by}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Size: {report.file_size}
                        </Typography>
                      </Box>
                    }
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <IconButton
                      color="primary"
                      onClick={() => handleDownloadReport(report)}
                      disabled={report.status !== 'Completed'}
                    >
                      <Download />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => handleDeleteReport(report.id)}
                    >
                      <Delete />
                    </IconButton>
                  </Box>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Generate Report Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Generate New Report
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
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
                <InputLabel>Report Type</InputLabel>
                <Select
                  value={formData.report_type}
                  onChange={handleInputChange('report_type')}
                  label="Report Type"
                >
                  {reportTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {type.icon}
                        {type.label}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Date Range</InputLabel>
                <Select
                  value={formData.date_range}
                  onChange={handleInputChange('date_range')}
                  label="Date Range"
                >
                  <MenuItem value="Last 7 Days">Last 7 Days</MenuItem>
                  <MenuItem value="Last 30 Days">Last 30 Days</MenuItem>
                  <MenuItem value="Last Quarter">Last Quarter</MenuItem>
                  <MenuItem value="Last Year">Last Year</MenuItem>
                  <MenuItem value="Custom">Custom Range</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Alert severity="info" sx={{ mt: { xs: 1.5, sm: 0 } }}>
                Framework is fixed to <strong>OCTAVE Allegro</strong> for this platform.
              </Alert>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Format</InputLabel>
                <Select
                  value={formData.format}
                  onChange={handleInputChange('format')}
                  label="Format"
                >
                  <MenuItem value="PDF">PDF</MenuItem>
                  <MenuItem value="DOCX">DOCX</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Include Sections
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>
                      <input
                        type="checkbox"
                        checked={formData.include_sections.executive_summary}
                        onChange={handleInputChange('include_sections.executive_summary')}
                      />
                      {' '}Executive Summary
                    </InputLabel>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>
                      <input
                        type="checkbox"
                        checked={formData.include_sections.risk_assessment}
                        onChange={handleInputChange('include_sections.risk_assessment')}
                      />
                      {' '}Risk Assessment
                    </InputLabel>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>
                      <input
                        type="checkbox"
                        checked={formData.include_sections.compliance_status}
                        onChange={handleInputChange('include_sections.compliance_status')}
                      />
                      {' '}Compliance Status
                    </InputLabel>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>
                      <input
                        type="checkbox"
                        checked={formData.include_sections.findings}
                        onChange={handleInputChange('include_sections.findings')}
                      />
                      {' '}Findings
                    </InputLabel>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>
                      <input
                        type="checkbox"
                        checked={formData.include_sections.recommendations}
                        onChange={handleInputChange('include_sections.recommendations')}
                      />
                      {' '}Recommendations
                    </InputLabel>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>
                      <input
                        type="checkbox"
                        checked={formData.include_sections.appendix}
                        onChange={handleInputChange('include_sections.appendix')}
                      />
                      {' '}Appendix
                    </InputLabel>
                  </FormControl>
                </Grid>
              </Grid>
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
            onClick={handleGenerateReport} 
            variant="contained" 
            color="primary"
            disabled={generating}
            startIcon={generating ? <CircularProgress size={20} /> : <Description />}
          >
            {generating ? 'Generating...' : 'Generate Report'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReportGenerator;
