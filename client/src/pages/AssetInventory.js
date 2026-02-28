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
  Tabs,
  Tab,
} from '@mui/material';
import {
  Business,
  Add,
  Edit,
  Delete,
  Refresh,
  Search,
  Computer,
  LocationOn,
  People,
  Security,
  Warning,
  CheckCircle,
  Storage,
  Dns,
  Router,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

const AssetInventory = () => {
  const { user } = useAuth();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [tabValue, setTabValue] = useState('Technical');
  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    asset_class: 'Application',
    cia_value: 'Medium',
    container_type: 'Technical',
    description: '',
    owner: '',
    location: '',
    criticality: 'Medium',
    security_requirements: '',
  });

  const containerTypes = [
    { value: 'Technical', label: 'Technical Containers', icon: <Computer />, description: 'Servers, applications, networks, databases' },
    { value: 'Physical', label: 'Physical Containers', icon: <LocationOn />, description: 'Buildings, rooms, hardware, facilities' },
    { value: 'People', label: 'People Containers', icon: <People />, description: 'Employees, contractors, stakeholders with access' }
  ];

  const normalizeContainerType = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    if (
      raw.startsWith('tech') ||
      raw.includes('technical') ||
      raw.includes('technology') ||
      raw.includes('技术') ||
      raw.includes('tech_')
    ) return 'Technical';
    if (
      raw.startsWith('phys') ||
      raw.includes('physical') ||
      raw.includes('facility') ||
      raw.includes('物理') ||
      raw.includes('场地')
    ) return 'Physical';
    if (
      raw.startsWith('peop') ||
      raw.startsWith('person') ||
      raw.includes('people') ||
      raw.includes('human') ||
      raw.includes('人员') ||
      raw.includes('员工')
    ) return 'People';
    return null;
  };

  const criticalityColors = {
    Critical: 'error',
    High: 'error',
    Medium: 'warning', 
    Low: 'success'
  };

  useEffect(() => {
    setMounted(true);
    loadAssets();
  }, []);

  const loadAssets = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/assets');
      console.log('Assets response:', response.data);
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      const normalizedRows = rows.map((asset) => ({
        ...asset,
        raw_container_type: asset.container_type,
        container_type: normalizeContainerType(asset.container_type)
      }));
      setAssets(normalizedRows);
    } catch (error) {
      console.error('Error loading assets:', error);
      setError('Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Asset name is required');
      return;
    }
    
    try {
      setError('');
      const dataToSend = {
        name: formData.name.trim(),
        asset_class: formData.asset_class,
        cia_value: formData.cia_value,
        container_type: normalizeContainerType(formData.container_type),
        description: formData.description,
        owner: formData.owner || 'System Administrator',
        location: formData.location || 'Main Office',
        criticality: formData.criticality,
        security_requirements: formData.security_requirements
      };
      
      if (!dataToSend.container_type) {
        setError('Invalid container type. Please choose Technical, Physical, or People.');
        return;
      }

      if (selectedAsset) {
        await api.put(`/assets/${selectedAsset.id}`, dataToSend);
        alert('Asset updated successfully');
      } else {
        await api.post('/assets', dataToSend);
        alert('Asset created successfully');
      }
      
      setDialogOpen(false);
      setSelectedAsset(null);
      setFormData({
        name: '',
        asset_class: 'Application',
        cia_value: 'Medium',
        container_type: 'Technical',
        description: '',
        owner: '',
        location: '',
        criticality: 'Medium',
        security_requirements: '',
      });
      loadAssets();
    } catch (error) {
      console.error('Error saving asset:', error);
      setError('Failed to save asset');
    }
  };

  const handleDelete = async (assetId) => {
    if (!window.confirm('Are you sure you want to delete this asset?')) return;
    
    try {
      setError('');
      await api.delete(`/assets/${assetId}`);
      alert('Asset deleted successfully');
      loadAssets();
    } catch (error) {
      console.error('Error deleting asset:', error);
      const message = error?.response?.data?.error || error.message || 'Failed to delete asset';
      setError(message);
      alert(message);
    }
  };

  const openEditDialog = (asset) => {
    setSelectedAsset(asset);
    setFormData({
      name: asset.name,
      asset_class: asset.asset_class || 'Application',
      cia_value: asset.cia_value || 'Medium',
      container_type: normalizeContainerType(asset.container_type) || 'Technical',
      description: asset.description || '',
      owner: asset.owner,
      location: asset.location,
      criticality: asset.criticality,
      security_requirements: asset.security_requirements || '',
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setSelectedAsset(null);
    setFormData({
      name: '',
      asset_class: 'Application',
      cia_value: 'Medium',
      container_type: normalizeContainerType(tabValue) || 'Technical',
      description: '',
      owner: '',
      location: '',
      criticality: 'Medium',
      security_requirements: '',
    });
    setDialogOpen(true);
  };

  const getContainerIcon = (type) => {
    const container = containerTypes.find(c => c.value === type);
    return container ? container.icon : <Storage />;
  };

  const getContainerDescription = (type) => {
    const container = containerTypes.find(c => c.value === type);
    return container ? container.description : '';
  };

  const filteredAssets = assets.filter(
    (asset) =>
      asset.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.owner?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const assetsByContainer = containerTypes.reduce((acc, container) => {
    acc[container.value] = filteredAssets.filter((asset) => asset.container_type === container.value);
    return acc;
  }, {});

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Typography>Loading assets...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Fade in={mounted}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: 'grey.800' }}>
            OCTAVE Allegro - Asset Containers
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Profile technical, physical, and people containers as per OCTAVE Allegro methodology
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
                      {assets.length}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Total Containers
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
        {containerTypes.map((container, index) => (
          <Grid item xs={12} sm={6} md={3} key={container.value}>
            <Zoom in={mounted} style={{ transitionDelay: `${(index + 2) * 100}ms` }}>
              <Card sx={{ 
                background: container.value === 'Technical' ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' :
                           container.value === 'Physical' ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' :
                           'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)', 
                color: 'white' 
              }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="h3" sx={{ fontWeight: 700 }}>
                        {assetsByContainer[container.value]?.length || 0}
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.9 }}>
                        {container.label}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                      {container.icon}
                    </Avatar>
                  </Box>
                </CardContent>
              </Card>
            </Zoom>
          </Grid>
        ))}
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={openCreateDialog}
          sx={{ mb: 2 }}
        >
          Add Container
        </Button>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadAssets}
        >
          Refresh
        </Button>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search containers..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        InputProps={{
          startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
        sx={{ mb: 3 }}
      />

      {/* Container Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={(e, newValue) => setTabValue(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {containerTypes.map((container) => (
            <Tab
              key={container.value}
              label={container.label}
              icon={container.icon}
              value={container.value}
            />
          ))}
        </Tabs>
      </Paper>

      {/* Assets Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Container Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>CIA</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Criticality</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assetsByContainer[tabValue]?.map((asset) => (
                <TableRow key={asset.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getContainerIcon(asset.container_type)}
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {asset.name}
                        </Typography>
                        {asset.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                            {asset.description}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getContainerIcon(asset.container_type)}
                      label={asset.container_type || 'Unclassified'}
                      size="small"
                      color={asset.container_type ? 'primary' : 'warning'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={asset.cia_value || 'Medium'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{asset.owner}</TableCell>
                  <TableCell>{asset.location}</TableCell>
                  <TableCell>
                    <Chip
                      label={`${asset.criticality} (${asset.criticality_score || 0})`}
                      color={criticalityColors[asset.criticality]}
                      size="small"
                      icon={<Warning />}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      color="primary"
                      onClick={() => openEditDialog(asset)}
                      size="small"
                    >
                      <Edit />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => handleDelete(asset.id)}
                      size="small"
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {(!assetsByContainer[tabValue] || assetsByContainer[tabValue].length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No containers in this category.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {selectedAsset ? 'Edit Container' : 'Add New Container'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Container Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Asset Type</InputLabel>
                <Select
                  value={formData.asset_class}
                  onChange={(e) => setFormData({ ...formData, asset_class: e.target.value })}
                >
                  <MenuItem value="Application">Application</MenuItem>
                  <MenuItem value="Server">Server</MenuItem>
                  <MenuItem value="Data">Data</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>CIA Value</InputLabel>
                <Select
                  value={formData.cia_value}
                  onChange={(e) => setFormData({ ...formData, cia_value: e.target.value })}
                >
                  <MenuItem value="High">High</MenuItem>
                  <MenuItem value="Medium">Medium</MenuItem>
                  <MenuItem value="Low">Low</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Container Type</InputLabel>
                <Select
                  value={formData.container_type}
                  onChange={(e) => setFormData({ ...formData, container_type: e.target.value })}
                >
                  {containerTypes.map((container) => (
                    <MenuItem key={container.value} value={container.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {container.icon}
                        <Box>
                          <Typography variant="inherit">{container.label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {container.description}
                          </Typography>
                        </Box>
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
                rows={3}
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                helperText="Describe what this container contains and its purpose"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Owner"
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Criticality</InputLabel>
                <Select
                  value={formData.criticality}
                  onChange={(e) => setFormData({ ...formData, criticality: e.target.value })}
                >
                  <MenuItem value="High">High - Mission Critical</MenuItem>
                  <MenuItem value="Medium">Medium - Important</MenuItem>
                  <MenuItem value="Low">Low - Supporting</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Security Requirements"
                value={formData.security_requirements}
                onChange={(e) => setFormData({ ...formData, security_requirements: e.target.value })}
                helperText="Specific security requirements for this container"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.name.trim()}
          >
            {selectedAsset ? 'Update' : 'Create'} Container
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AssetInventory;
