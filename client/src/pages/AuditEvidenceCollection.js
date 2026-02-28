import React, { useState, useEffect } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit,
  Delete,
  Visibility,
  Download,
  Upload as UploadIcon,
  Image,
  PictureAsPdf,
  InsertDriveFile,
} from '@mui/icons-material';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const MAX_EVIDENCE_FILE_SIZE_MB = 10;
const MAX_EVIDENCE_FILE_SIZE_BYTES = MAX_EVIDENCE_FILE_SIZE_MB * 1024 * 1024;
const MAX_EVIDENCE_FILES = 20;

const AuditEvidenceCollection = () => {
  const { user } = useAuth();
  const [evidence, setEvidence] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvidence, setEditingEvidence] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [formData, setFormData] = useState({
    checklist_item_id: '',
    evidence_type: 'Document',
    file_name: '',
    file_path: '',
    description: '',
    upload_date: new Date().toISOString().split('T')[0],
    uploaded_by: ''
  });

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [evidenceRes, checklistRes] = await Promise.all([
        api.get('/audit-evidence'),
        api.get('/audit-checklist')
      ]);
      setEvidence(evidenceRes.data.data || []);
      setChecklistItems(checklistRes.data.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
      setEvidence([]);
      setChecklistItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvidence = () => {
    setEditingEvidence(null);
    setSelectedFiles([]);
    setFormData({
      checklist_item_id: '',
      evidence_type: 'Document',
      file_name: '',
      file_path: '',
      description: '',
      upload_date: new Date().toISOString().split('T')[0],
      uploaded_by: ''
    });
    setDialogOpen(true);
    setError('');
  };

  const handleEditEvidence = (evidence) => {
    setEditingEvidence(evidence);
    setSelectedFiles([]);
    setFormData({
      checklist_item_id: evidence.checklist_item_id || '',
      evidence_type: evidence.evidence_type || 'Document',
      file_name: evidence.file_name || '',
      file_path: evidence.file_path || '',
      description: evidence.description || '',
      upload_date: evidence.upload_date || new Date().toISOString().split('T')[0],
      uploaded_by: evidence.uploaded_by || ''
    });
    setDialogOpen(true);
    setError('');
  };

  const handleDeleteEvidence = async (evidenceId) => {
    if (window.confirm('Are you sure you want to delete this evidence?')) {
      try {
        setError('');
        await api.delete(`/audit-evidence/${evidenceId}`);
        await loadData();
        alert('Evidence deleted successfully');
      } catch (error) {
        console.error('Error deleting evidence:', error);
        setError('Failed to delete evidence');
      }
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    event.target.value = '';

    const mergedFilesMap = new Map();
    [...selectedFiles, ...files].forEach((file) => {
      const key = `${file.name}::${file.size}::${file.lastModified}`;
      mergedFilesMap.set(key, file);
    });
    const mergedFiles = Array.from(mergedFilesMap.values());

    if (mergedFiles.length > MAX_EVIDENCE_FILES) {
      setError(`Too many files selected. Maximum number of files is ${MAX_EVIDENCE_FILES}.`);
      return;
    }

    const totalBytes = mergedFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalBytes > MAX_EVIDENCE_FILE_SIZE_BYTES) {
      setError(`Selected files are too large together. Maximum total size is ${MAX_EVIDENCE_FILE_SIZE_MB} MB.`);
      return;
    }

    setError('');
    setSelectedFiles(mergedFiles);
    setFormData((prev) => ({
      ...prev,
      file_name: mergedFiles.length === 1 ? mergedFiles[0].name : `${mergedFiles.length} files selected`,
      file_path: ''
    }));
  };

  const handleSubmit = async () => {
    // Basic validation
    if (!formData.checklist_item_id) {
      setError('Please select a checklist item');
      return;
    }
    if (!formData.file_name.trim()) {
      setError('File name is required');
      return;
    }
    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }
    
    try {
      setError('');
      const submitData = { ...formData };
      const uploaderId = Number(formData.uploaded_by);
      if (Number.isInteger(uploaderId) && uploaderId > 0) {
        submitData.uploaded_by = uploaderId;
      } else {
        delete submitData.uploaded_by;
      }

      if (editingEvidence) {
        await api.put(`/audit-evidence/${editingEvidence.id}`, submitData);
        alert('Evidence updated successfully');
      } else {
        if (!selectedFiles.length) {
          setError('Please choose at least one file');
          return;
        }

        if (selectedFiles.length > MAX_EVIDENCE_FILES) {
          setError(`Too many files selected. Maximum number of files is ${MAX_EVIDENCE_FILES}.`);
          return;
        }

        const totalBytes = selectedFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
        if (totalBytes > MAX_EVIDENCE_FILE_SIZE_BYTES) {
          setError(`Selected files are too large together. Maximum total size is ${MAX_EVIDENCE_FILE_SIZE_MB} MB.`);
          return;
        }

        setUploading(true);
        const uploadForm = new FormData();
        selectedFiles.forEach((file) => uploadForm.append('files', file));
        uploadForm.append('checklist_item_id', submitData.checklist_item_id || '');
        uploadForm.append('evidence_type', submitData.evidence_type || '');
        uploadForm.append('description', submitData.description || '');
        uploadForm.append('upload_date', submitData.upload_date || '');
        uploadForm.append('uploaded_by', submitData.uploaded_by || '');
        uploadForm.append('evidence_references', submitData.evidence_references || '');
        await api.post('/audit-evidence/upload-multiple', uploadForm, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        alert(`${selectedFiles.length} file(s) uploaded successfully`);
      }
      
      setDialogOpen(false);
      setEditingEvidence(null);
      setSelectedFiles([]);
      await loadData();
    } catch (error) {
      console.error('Error saving evidence:', error);
      setError(error.response?.data?.error || 'Failed to save evidence');
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (field) => (event) => {
    setFormData({
      ...formData,
      [field]: event.target.value
    });
  };

  const getChecklistItemName = (itemId) => {
    const item = checklistItems.find(i => i.id === itemId);
    return item ? item.control_name : 'Unknown Control';
  };

  const formatFileSize = (bytes) => {
    const size = Number(bytes || 0);
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    return `${(size / 1024).toFixed(1)} KB`;
  };

  const handleRemoveSelectedFile = (targetIndex) => {
    const remainingFiles = selectedFiles.filter((_, index) => index !== targetIndex);
    setSelectedFiles(remainingFiles);
    setFormData((prev) => ({
      ...prev,
      file_name: remainingFiles.length === 1 ? remainingFiles[0].name : (remainingFiles.length > 1 ? `${remainingFiles.length} files selected` : ''),
      file_path: remainingFiles.length ? prev.file_path : ''
    }));
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
      case 'pdf':
        return <PictureAsPdf />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return <Image />;
      default:
        return <InsertDriveFile />;
    }
  };

  const getEvidenceTypeColor = (type) => {
    const colors = {
      'Document': '#2196f3',
      'Screenshot': '#4caf50',
      'Log File': '#ff9800',
      'Configuration': '#9c27b0',
      'Other': '#757575'
    };
    return colors[type] || '#757575';
  };

  const inferEvidenceType = (item) => {
    const explicit = String(item?.evidence_type || '').trim();
    if (explicit) return explicit;
    const fileName = String(item?.file_name || item?.file_path || '').toLowerCase();
    const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'Screenshot';
    if (['log'].includes(ext)) return 'Log File';
    if (['conf', 'ini', 'yaml', 'yml', 'json', 'xml'].includes(ext)) return 'Configuration';
    if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) return 'Document';
    return 'Other';
  };

  const getServerBaseUrl = () => {
    const base = String(api.defaults.baseURL || '');
    if (base.startsWith('http')) {
      return base.replace(/\/api\/?$/, '');
    }
    return 'http://localhost:5000';
  };

  const buildFileUrl = (item) => {
    const raw = String(item?.file_path || '').trim();
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return `${getServerBaseUrl()}${raw}`;
    return `${getServerBaseUrl()}/${raw}`;
  };

  const isImageFile = (item) => {
    const name = String(item?.file_name || item?.file_path || '').toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].some((ext) => name.endsWith(ext));
  };

  const handleViewEvidence = (item) => {
    const url = buildFileUrl(item);
    if (!url) {
      setError('This evidence has no valid file path');
      return;
    }

    if (isImageFile(item)) {
      setPreviewTitle(item.file_name || 'Evidence Image');
      setPreviewUrl(url);
      setPreviewOpen(true);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadEvidence = (item) => {
    const url = buildFileUrl(item);
    if (!url) {
      setError('This evidence has no valid file path');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = item.file_name || 'evidence-file';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
          Audit Evidence Collection
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddEvidence}
        >
          Upload Evidence
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Maximum total size per upload: {MAX_EVIDENCE_FILE_SIZE_MB} MB, maximum number of files per upload: {MAX_EVIDENCE_FILES}.
          </Alert>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Checklist Item</TableCell>
                  <TableCell>File Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Upload Date</TableCell>
                  <TableCell>Uploaded By</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {evidence.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        No evidence found. Click "Upload Evidence" to add your first evidence.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  evidence.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {getChecklistItemName(item.checklist_item_id)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {getFileIcon(item.file_name)}
                          <Typography variant="body2">
                            {item.file_name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={inferEvidenceType(item)}
                          size="small"
                          sx={{
                            backgroundColor: getEvidenceTypeColor(inferEvidenceType(item)),
                            color: 'white'
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {item.description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.upload_date}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.uploaded_by}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleViewEvidence(item)}
                          title="View"
                        >
                          <Visibility />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleDownloadEvidence(item)}
                          title="Download"
                        >
                          <Download />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          color="primary" 
                          onClick={() => handleEditEvidence(item)}
                        >
                          <Edit />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          color="error" 
                          onClick={() => handleDeleteEvidence(item.id)}
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
          {editingEvidence ? 'Edit Evidence' : 'Upload New Evidence'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Checklist Item</InputLabel>
                <Select
                  value={formData.checklist_item_id}
                  onChange={handleInputChange('checklist_item_id')}
                  label="Checklist Item"
                  required
                >
                  {checklistItems.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.control_id} - {item.control_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Maximum total size per upload: {MAX_EVIDENCE_FILE_SIZE_MB} MB, maximum number of files per upload: {MAX_EVIDENCE_FILES}.
              </Alert>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadIcon />}
                disabled={uploading}
                sx={{ mb: 2 }}
              >
                {uploading ? 'Uploading...' : 'Choose Files'}
                <input
                  type="file"
                  hidden
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.log"
                  multiple
                />
              </Button>
              {selectedFiles.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Selected {selectedFiles.length} file(s), total size: {formatFileSize(selectedFiles.reduce((sum, file) => sum + Number(file.size || 0), 0))}
                  </Typography>
                  <Paper variant="outlined" sx={{ maxHeight: 180, overflow: 'auto' }}>
                    <List dense>
                      {selectedFiles.map((file, index) => (
                        <ListItem
                          key={`${file.name}-${index}`}
                          divider={index !== selectedFiles.length - 1}
                          secondaryAction={(
                            <IconButton
                              edge="end"
                              size="small"
                              color="error"
                              title="Remove file"
                              onClick={() => handleRemoveSelectedFile(index)}
                            >
                              <Delete />
                            </IconButton>
                          )}
                        >
                          <ListItemText
                            primary={file.name}
                            secondary={formatFileSize(file.size)}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                </Box>
              )}
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={formData.description}
                onChange={handleInputChange('description')}
                multiline
                rows={4}
                required
                placeholder="Describe what this evidence proves..."
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Upload Date"
                type="date"
                value={formData.upload_date}
                onChange={handleInputChange('upload_date')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Uploaded By"
                value={String(user?.id || formData.uploaded_by || '')}
                placeholder="Current user ID"
                disabled
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
            disabled={uploading}
          >
            {editingEvidence ? 'Update' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{previewTitle}</DialogTitle>
        <DialogContent>
          {previewUrl ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
              <img
                src={previewUrl}
                alt={previewTitle}
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }}
              />
            </Box>
          ) : (
            <Alert severity="warning">Preview is unavailable for this file.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AuditEvidenceCollection;
